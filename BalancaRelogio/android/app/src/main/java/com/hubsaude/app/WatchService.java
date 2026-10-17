package com.hubsaude.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.IntentCompat;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Serviço em primeiro plano que mantém o relógio conectado o tempo todo — inclusive com o app fechado
 * (fora da lista de recentes), com o Bluetooth desligado e religado e depois de reiniciar o celular.
 *
 * - Conecta por GATT ao relógio salvo (WatchPrefs), liga as notificações do canal FF03 e, a cada conexão,
 *   manda o tipo de celular e a hora (como o app oficial).
 * - Relógio pareado no Bluetooth do celular: conexão "automática" do Android (ele mantém e refaz a ligação,
 *   mesmo sem o relógio anunciar, e se junta à ligação que o celular já tiver com o relógio).
 *   Não pareado: conexão direta (precisa do relógio anunciando). Se cair, gatt.connect() espera o relógio voltar;
 *   se der erro, tenta de novo com espera crescente. Bluetooth desligado: espera ligar.
 * - Avisos do sistema: ligação Bluetooth do celular com o relógio (ACL) e fim do pareamento → reconecta na hora.
 * - O leitor de notificações (HubNotificationListener) manda as notificações do celular por aqui.
 * - Com o app aberto, o app (JS) usa esta mesma conexão (plugin HubBackground: watchWrite / evento watchData).
 */
@SuppressLint("MissingPermission") // a permissão BLUETOOTH_CONNECT é conferida em hasBluetoothPermission()
public class WatchService extends Service {

    static final String CHANNEL_ID = "hub-conexao-relogio";
    static final int NOTIFICATION_ID = 4101;

    // Canal de dados do relógio (NJJ): serviço 000001ff-…, escrita FF02, notificação FF03.
    static final UUID SERVICE_UUID = UUID.fromString("000001ff-3c17-d293-8e48-14fe2e4da212");
    static final UUID CCCD_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    static final String WRITE_PREFIX = "0000ff02";
    static final String NOTIFY_PREFIX = "0000ff03";

    // Estados informados ao app.
    static final String STATE_CONNECTING = "connecting";
    static final String STATE_CONNECTED = "connected";
    static final String STATE_RECONNECTING = "reconnecting";
    static final String STATE_BLUETOOTH_OFF = "bluetooth-off";
    static final String STATE_NO_PERMISSION = "no-permission";
    static final String STATE_STOPPED = "stopped";

    // Esperas entre tentativas depois de um erro (ms).
    private static final long[] RETRY_DELAYS = { 5_000, 15_000, 30_000, 60_000, 120_000, 300_000 };
    private static final long WRITE_TIMEOUT_MS = 1_000;
    // "Batimento": o app oficial manda este quadro a cada ~1 min (logs HCI); sem ele o relógio pode
    // encerrar a conexão por falta de atividade.
    private static final byte[] HEARTBEAT = { (byte) 0xAA, 0x21, 0x00, 0x00, (byte) 0xF0, (byte) 0xF0, (byte) 0xF0, (byte) 0xF0 };
    private static final long HEARTBEAT_MS = 60_000;
    // Registro da conexão (últimos eventos), mostrado no app para diagnosticar quedas.
    private static final int LOG_SIZE = 40;

    /** Serviço em execução (null se parado). */
    static volatile WatchService instance;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ArrayDeque<byte[]> writeQueue = new ArrayDeque<>();
    private BluetoothGatt gatt;
    private BluetoothGattCharacteristic writeCharacteristic;
    private boolean writing = false;
    private int retryIndex = 0;
    private boolean servicesRequested = false;
    private String currentAddress = null; // relógio da conexão atual
    private String state = STATE_STOPPED;
    private final ArrayDeque<String> log = new ArrayDeque<>();

    /** Manda o batimento enquanto o relógio estiver conectado. */
    private final Runnable heartbeat = new Runnable() {
        @Override
        public void run() {
            if (!isReady()) return;
            write(HEARTBEAT);
            handler.postDelayed(this, HEARTBEAT_MS);
        }
    };

    /** Liga/desliga do Bluetooth: desligou → espera; ligou → reconecta. */
    private final BroadcastReceiver bluetoothReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            int adapterState = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR);
            if (adapterState == BluetoothAdapter.STATE_OFF) {
                logEvent("Bluetooth desligado");
                closeGatt();
                setState(STATE_BLUETOOTH_OFF);
            } else if (adapterState == BluetoothAdapter.STATE_ON) {
                logEvent("Bluetooth ligado: reconectando");
                retryIndex = 0;
                connect();
            }
        }
    };

    /** Avisos do sistema sobre o relógio: ligação do Bluetooth do celular (ACL) e pareamento. */
    private final BroadcastReceiver deviceReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            BluetoothDevice device = IntentCompat.getParcelableExtra(intent, BluetoothDevice.EXTRA_DEVICE, BluetoothDevice.class);
            String address = WatchPrefs.get(context).getString(WatchPrefs.ADDRESS, null);
            if (device == null || address == null || !address.equalsIgnoreCase(device.getAddress())) return;
            String action = intent.getAction();
            if (BluetoothDevice.ACTION_ACL_CONNECTED.equals(action)) {
                logEvent("Bluetooth do celular ligou ao relógio");
                // Se o app ainda não está no canal de dados, entra agora (a ligação já existe: é rápido).
                if (!isReady()) {
                    retryIndex = 0;
                    connect();
                }
            } else if (BluetoothDevice.ACTION_ACL_DISCONNECTED.equals(action)) {
                logEvent("Bluetooth do celular desligou do relógio");
            } else if (BluetoothDevice.ACTION_BOND_STATE_CHANGED.equals(action)) {
                int bond = intent.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, BluetoothDevice.BOND_NONE);
                logEvent("Pareamento: " + bondName(bond));
                if (bond == BluetoothDevice.BOND_BONDED) {
                    // Pareado: reconecta no modo automático.
                    retryIndex = 0;
                    connect();
                }
            }
        }
    };

    /** Nome do estado de pareamento. */
    static String bondName(int bond) {
        if (bond == BluetoothDevice.BOND_BONDED) return "pareado";
        if (bond == BluetoothDevice.BOND_BONDING) return "pareando…";
        return "não pareado";
    }

    /** Inicia (ou mantém) o serviço. */
    static void start(Context context) {
        ContextCompat.startForegroundService(context, new Intent(context, WatchService.class));
    }

    /** Para o serviço e não reconecta mais (até o app pedir de novo). */
    static void stop(Context context) {
        WatchPrefs.get(context).edit().putBoolean(WatchPrefs.KEEP_CONNECTED, false).apply();
        context.stopService(new Intent(context, WatchService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        ContextCompat.registerReceiver(
            this,
            bluetoothReceiver,
            new IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED),
            ContextCompat.RECEIVER_NOT_EXPORTED
        );
        IntentFilter deviceFilter = new IntentFilter();
        deviceFilter.addAction(BluetoothDevice.ACTION_ACL_CONNECTED);
        deviceFilter.addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED);
        deviceFilter.addAction(BluetoothDevice.ACTION_BOND_STATE_CHANGED);
        ContextCompat.registerReceiver(this, deviceReceiver, deviceFilter, ContextCompat.RECEIVER_EXPORTED);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            showForeground(textFor(state));
        } catch (Exception error) {
            // Sem permissão para o serviço (ex.: Bluetooth negado): não há como manter a conexão.
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!WatchPrefs.get(this).getBoolean(WatchPrefs.KEEP_CONNECTED, false)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        // Sem conexão, ou o app escolheu outro relógio: (re)conecta.
        String wanted = WatchPrefs.get(this).getString(WatchPrefs.ADDRESS, null);
        if (gatt == null || wanted == null || !wanted.equalsIgnoreCase(currentAddress)) connect();
        // Se o Android fechar o serviço, ele volta sozinho e reconecta (o relógio continua lembrado).
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        try {
            unregisterReceiver(bluetoothReceiver);
            unregisterReceiver(deviceReceiver);
        } catch (IllegalArgumentException ignored) {
            // Já removido.
        }
        closeGatt();
        instance = null;
        setState(STATE_STOPPED);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    /** O app foi tirado da lista de recentes: o serviço continua (é isso que mantém o relógio conectado). */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
    }

    // ---------------------------------------------------------------- conexão

    /** O app tem a permissão de Bluetooth (Android 12+)? */
    private boolean hasBluetoothPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S
            || ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    /** Conecta ao relógio salvo. */
    private void connect() {
        SharedPreferences prefs = WatchPrefs.get(this);
        String address = prefs.getString(WatchPrefs.ADDRESS, null);
        if (address == null) {
            stopSelf();
            return;
        }
        if (!hasBluetoothPermission()) {
            logEvent("Sem permissão de Bluetooth");
            setState(STATE_NO_PERMISSION);
            return;
        }
        BluetoothManager manager = (BluetoothManager) getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = manager != null ? manager.getAdapter() : null;
        if (adapter == null || !adapter.isEnabled()) {
            setState(STATE_BLUETOOTH_OFF);
            return;
        }
        closeGatt();
        setState(STATE_CONNECTING);
        try {
            BluetoothDevice device = adapter.getRemoteDevice(address);
            boolean bonded = device.getBondState() == BluetoothDevice.BOND_BONDED;
            boolean linked = manager.getConnectionState(device, BluetoothProfile.GATT) == BluetoothProfile.STATE_CONNECTED;
            logEvent("Conectando a " + address + " (" + (bonded ? "pareado no celular" : "não pareado") + (linked ? ", já ligado ao celular" : "") + ")");
            // Pareado: modo automático (o Android mantém e refaz a ligação, mesmo sem o relógio anunciar).
            // Não pareado: conexão direta (o relógio precisa estar anunciando).
            servicesRequested = false;
            currentAddress = address;
            gatt = device.connectGatt(this, bonded, callback, BluetoothDevice.TRANSPORT_LE);
        } catch (IllegalArgumentException | SecurityException error) {
            logEvent("Erro ao conectar: " + error.getMessage());
            scheduleRetry();
        }
    }

    /** Nova tentativa depois de um erro, com espera crescente. */
    private void scheduleRetry() {
        long delay = RETRY_DELAYS[Math.min(retryIndex, RETRY_DELAYS.length - 1)];
        retryIndex++;
        logEvent("Nova tentativa em " + (delay / 1000) + " s");
        setState(STATE_RECONNECTING);
        handler.removeCallbacksAndMessages(null);
        handler.postDelayed(this::connect, delay);
    }

    /** Fecha a conexão atual. */
    private void closeGatt() {
        handler.removeCallbacks(heartbeat);
        writeQueue.clear();
        writing = false;
        writeCharacteristic = null;
        if (gatt != null) {
            try {
                gatt.close();
            } catch (SecurityException ignored) {
                // Sem permissão: nada a fechar.
            }
            gatt = null;
        }
    }

    private final BluetoothGattCallback callback = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt changed, int status, int newState) {
            handler.post(() -> {
                if (changed != gatt) return;
                logEvent((newState == BluetoothProfile.STATE_CONNECTED ? "Conectou" : "Desconectou") + " (status " + status + ")");
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    servicesRequested = false;
                    // Pequena espera (a ligação, e a criptografia se pareado, terminam de assentar); depois
                    // pede pacotes maiores (o relógio pede 247) e lê os serviços. Se o Android não responder
                    // ao pedido de MTU, lê os serviços mesmo assim depois de 2 s.
                    handler.postDelayed(() -> {
                        if (changed != gatt) return;
                        if (!changed.requestMtu(247)) discover(changed);
                        handler.postDelayed(() -> discover(changed), 2_000);
                    }, 600);
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    handler.removeCallbacks(heartbeat);
                    writeCharacteristic = null;
                    writeQueue.clear();
                    writing = false;
                    if (status == BluetoothGatt.GATT_SUCCESS && changed.connect()) {
                        // Queda normal (relógio longe/desligado): o Android reconecta quando ele voltar ao alcance.
                        setState(STATE_RECONNECTING);
                    } else {
                        // Erro de conexão: fecha e tenta de novo daqui a pouco.
                        closeGatt();
                        scheduleRetry();
                    }
                }
            });
        }

        @Override
        public void onMtuChanged(BluetoothGatt changed, int mtu, int status) {
            handler.post(() -> {
                logEvent("MTU " + mtu + " (status " + status + ")");
                discover(changed);
            });
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt changed, int status) {
            handler.post(() -> {
                if (changed != gatt) return;
                logEvent("Serviços lidos (status " + status + ")");
                BluetoothGattService service = changed.getService(SERVICE_UUID);
                BluetoothGattCharacteristic notify = null;
                BluetoothGattCharacteristic write = null;
                if (service != null) {
                    for (BluetoothGattCharacteristic characteristic : service.getCharacteristics()) {
                        String uuid = characteristic.getUuid().toString().toLowerCase();
                        if (uuid.startsWith(WRITE_PREFIX)) write = characteristic;
                        if (uuid.startsWith(NOTIFY_PREFIX)) notify = characteristic;
                    }
                }
                if (write == null || notify == null) {
                    logEvent("Canal FF02/FF03 não encontrado");
                    closeGatt();
                    scheduleRetry();
                    return;
                }
                writeCharacteristic = write;
                // Liga as notificações do relógio (CCCD = 01 00).
                changed.setCharacteristicNotification(notify, true);
                BluetoothGattDescriptor cccd = notify.getDescriptor(CCCD_UUID);
                if (cccd == null) {
                    onReady();
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    changed.writeDescriptor(cccd, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                } else {
                    cccd.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                    changed.writeDescriptor(cccd);
                }
            });
        }

        @Override
        public void onDescriptorWrite(BluetoothGatt changed, BluetoothGattDescriptor descriptor, int status) {
            handler.post(() -> {
                if (changed != gatt) return;
                logEvent("Notificações do relógio ligadas (status " + status + ")");
                onReady();
            });
        }

        @Override
        public void onCharacteristicWrite(BluetoothGatt changed, BluetoothGattCharacteristic characteristic, int status) {
            handler.post(() -> {
                writing = false;
                writeNext();
            });
        }

        // Android 13+: o valor chega como parâmetro.
        @Override
        public void onCharacteristicChanged(BluetoothGatt changed, BluetoothGattCharacteristic characteristic, byte[] value) {
            deliver(value);
        }

        // Até o Android 12 (no 13+ o método acima já entregou o valor).
        @Override
        @SuppressWarnings("deprecation")
        public void onCharacteristicChanged(BluetoothGatt changed, BluetoothGattCharacteristic characteristic) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return;
            deliver(characteristic.getValue());
        }
    };

    /** Lê os serviços do relógio uma vez por conexão. */
    private void discover(BluetoothGatt target) {
        if (target != gatt || servicesRequested) return;
        servicesRequested = true;
        if (!target.discoverServices()) {
            logEvent("Não foi possível ler os serviços");
            closeGatt();
            scheduleRetry();
        }
    }

    /** Canal pronto: mesmo início do app oficial (tipo de celular e hora). */
    private void onReady() {
        retryIndex = 0;
        logEvent("Pronto: notificações ligadas, hora acertada");
        setState(STATE_CONNECTED);
        write(NjjFrames.phoneType());
        write(NjjFrames.time(System.currentTimeMillis()));
        // Lembretes do app no relógio: desliga o lembrete de água próprio dele (tocava fora de hora, 3 ou 4 vezes
        // a cada lembrete do celular). O do celular é repassado na mesma hora pelo HubNotificationListener.
        if (WatchPrefs.remindersOnWatch(this)) write(NjjFrames.drinkWater(false));
        handler.removeCallbacks(heartbeat);
        handler.postDelayed(heartbeat, HEARTBEAT_MS);
    }

    /** Anota um evento da conexão (com horário). */
    private void logEvent(String text) {
        String line = new SimpleDateFormat("dd/MM HH:mm:ss", Locale.US).format(new Date()) + "  " + text;
        synchronized (log) {
            log.addLast(line);
            while (log.size() > LOG_SIZE) log.removeFirst();
        }
    }

    /** Registro da conexão (mais antigo primeiro). */
    List<String> getLog() {
        synchronized (log) {
            return new ArrayList<>(log);
        }
    }

    /** Bytes vindos do relógio → app (se estiver aberto). */
    private void deliver(byte[] value) {
        if (value == null) return;
        byte[] copy = value.clone();
        handler.post(() -> HubBackgroundPlugin.emit("watchData", "data", NjjFrames.toHex(copy)));
    }

    // ---------------------------------------------------------------- escrita

    /** O relógio está conectado e pronto? */
    boolean isReady() {
        return STATE_CONNECTED.equals(state) && writeCharacteristic != null;
    }

    String getState() {
        return state;
    }

    /** Coloca um quadro na fila de escrita (uma escrita por vez, como o Bluetooth exige). */
    void write(byte[] frame) {
        handler.post(() -> {
            if (!isReady()) return;
            writeQueue.add(frame);
            writeNext();
        });
    }

    /** Escreve o próximo quadro da fila. */
    private void writeNext() {
        if (writing || writeQueue.isEmpty() || gatt == null || writeCharacteristic == null) return;
        byte[] frame = writeQueue.poll();
        writing = true;
        boolean started;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            started = gatt.writeCharacteristic(writeCharacteristic, frame, BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE)
                == BluetoothGatt.GATT_SUCCESS;
        } else {
            writeCharacteristic.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
            writeCharacteristic.setValue(frame);
            started = gatt.writeCharacteristic(writeCharacteristic);
        }
        if (!started) {
            writing = false;
            logEvent("Falha ao escrever no relógio");
        }
        // Se o Android não avisar o fim da escrita, segue a fila mesmo assim.
        handler.postDelayed(() -> {
            if (writing) {
                writing = false;
                writeNext();
            }
        }, WRITE_TIMEOUT_MS);
    }

    // ---------------------------------------------------------------- estado e notificação fixa

    /** Atualiza o estado, a notificação fixa e avisa o app. */
    private void setState(String next) {
        state = next;
        if (instance == this && !STATE_STOPPED.equals(next)) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification(textFor(next)));
        }
        HubBackgroundPlugin.emit("watchState", "state", next);
    }

    /** Texto da notificação fixa para cada estado. */
    private String textFor(String current) {
        String name = WatchPrefs.get(this).getString(WatchPrefs.NAME, "relógio");
        switch (current) {
            case STATE_CONNECTED:
                return "Conectado ao " + name;
            case STATE_BLUETOOTH_OFF:
                return "Bluetooth desligado: reconecta ao ligar";
            case STATE_NO_PERMISSION:
                return "Sem permissão de Bluetooth: abra o app";
            case STATE_RECONNECTING:
                return "Procurando o " + name + "…";
            default:
                return "Conectando ao " + name + "…";
        }
    }

    /** Liga o serviço em primeiro plano com a notificação fixa. */
    private void showForeground(String text) {
        Notification notification = buildNotification(text);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    /** Notificação fixa e silenciosa; tocar nela abre o app. */
    private Notification buildNotification(String text) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Conexão com o relógio", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Mantém o relógio conectado mesmo com o app fechado");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent content = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setContentTitle("Hub de Saúde")
            .setContentText(text)
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(content)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }
}
