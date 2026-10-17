package com.hubsaude.app;

import android.app.KeyguardManager;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.Settings;
import android.view.WindowManager;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Plugin do próprio app (registrado em MainActivity): a ponte entre o app (JS) e o que roda em segundo plano.
 * - Relógio: watchStart / watchStop / watchStatus / watchWrite e os eventos "watchState" e "watchData"
 *   (a conexão em si fica no WatchService, que continua com o app fechado).
 * - Notificações do celular no relógio: configureNotifications, notificationApps, notificationAccess,
 *   openNotificationAccessSettings e o evento "notificationPosted".
 * - Bateria: batteryStatus / requestIgnoreBatteryOptimizations.
 * - Impressão: printPage ("Gerar PDF" do relatório).
 * - Treino: workoutNotification / workoutNotificationClear (notificação na tela bloqueada e na Now Bar) e
 *   setShowOverLock / lockStatus / unlock + o evento "lockState" (painel do treino por cima da tela bloqueada).
 */
@CapacitorPlugin(name = "HubBackground")
@android.annotation.SuppressLint("MissingPermission") // o app só chama estes métodos depois de pedir o Bluetooth
public class HubBackgroundPlugin extends Plugin {

    /** Plugin ativo (null com o app fechado: os eventos param de ser entregues, o serviço continua). */
    static volatile HubBackgroundPlugin instance;

    /** Avisos de tela ligada/desligada/desbloqueada (treino por cima da tela bloqueada). */
    private BroadcastReceiver screenReceiver;

    @Override
    public void load() {
        instance = this;
        screenReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                // Tela apagando: avisa "bloqueado" já, para o app trocar para o painel do treino antes de a
                // tela voltar (sem mostrar outra aba por um instante). Ao ligar e ao desbloquear, vale o estado real.
                boolean locked = Intent.ACTION_SCREEN_OFF.equals(intent.getAction()) || (!Intent.ACTION_USER_PRESENT.equals(intent.getAction()) && isKeyguardLocked());
                emitLockState(locked);
            }
        };
        IntentFilter filter = new IntentFilter(Intent.ACTION_SCREEN_OFF);
        filter.addAction(Intent.ACTION_SCREEN_ON);
        filter.addAction(Intent.ACTION_USER_PRESENT);
        // Avisos protegidos do sistema (só o Android envia), então "exportado" não abre brecha.
        ContextCompat.registerReceiver(getContext(), screenReceiver, filter, ContextCompat.RECEIVER_EXPORTED);
    }

    @Override
    protected void handleOnResume() {
        // Voltou à frente (inclusive por cima da tela bloqueada): confirma o estado.
        emitLockState(isKeyguardLocked());
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        try {
            if (screenReceiver != null) getContext().unregisterReceiver(screenReceiver);
        } catch (IllegalArgumentException ignored) {
            // Já removido.
        }
    }

    /** Evento com um campo de texto para o app (se estiver aberto). */
    static void emit(String event, String key, String value) {
        JSObject data = new JSObject();
        data.put(key, value);
        emitObject(event, data);
    }

    /** Evento para o app (se estiver aberto). */
    static void emitObject(String event, JSObject data) {
        HubBackgroundPlugin plugin = instance;
        if (plugin != null) plugin.notifyListeners(event, data);
    }

    // ---------------------------------------------------------------- relógio

    /** Lembra o relógio e liga o serviço que o mantém conectado. */
    @PluginMethod
    public void watchStart(PluginCall call) {
        String address = call.getString("address");
        if (address == null) {
            call.reject("Endereço do relógio ausente.");
            return;
        }
        WatchPrefs.get(getContext())
            .edit()
            .putString(WatchPrefs.ADDRESS, address)
            .putString(WatchPrefs.NAME, call.getString("name", "relógio"))
            .putBoolean(WatchPrefs.KEEP_CONNECTED, true)
            .apply();
        try {
            WatchService.start(getContext());
            call.resolve();
        } catch (Exception error) {
            call.reject("Não foi possível iniciar a conexão em segundo plano: " + error.getMessage());
        }
    }

    /** Desconecta e para de reconectar (o relógio continua lembrado, a não ser com forget = true). */
    @PluginMethod
    public void watchStop(PluginCall call) {
        WatchService.stop(getContext());
        if (call.getBoolean("forget", false)) {
            WatchPrefs.get(getContext()).edit().remove(WatchPrefs.ADDRESS).remove(WatchPrefs.NAME).apply();
        }
        call.resolve();
    }

    /** Estado atual: relógio lembrado, serviço ligado e estado da conexão. */
    @PluginMethod
    public void watchStatus(PluginCall call) {
        SharedPreferences prefs = WatchPrefs.get(getContext());
        WatchService service = WatchService.instance;
        JSObject result = new JSObject();
        result.put("address", prefs.getString(WatchPrefs.ADDRESS, null));
        result.put("name", prefs.getString(WatchPrefs.NAME, null));
        result.put("keepConnected", prefs.getBoolean(WatchPrefs.KEEP_CONNECTED, false));
        result.put("running", service != null);
        result.put("state", service != null ? service.getState() : WatchService.STATE_STOPPED);
        // Situação no Bluetooth do celular: pareado? ligado ao celular agora?
        String address = prefs.getString(WatchPrefs.ADDRESS, null);
        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = manager != null ? manager.getAdapter() : null;
        if (address != null && adapter != null) {
            try {
                BluetoothDevice device = adapter.getRemoteDevice(address);
                result.put("bond", WatchService.bondName(device.getBondState()));
                result.put("bonded", device.getBondState() == BluetoothDevice.BOND_BONDED);
                result.put("systemConnected", manager.getConnectionState(device, BluetoothProfile.GATT) == BluetoothProfile.STATE_CONNECTED);
            } catch (IllegalArgumentException | SecurityException ignored) {
                // Sem permissão ou endereço inválido: sem essa informação.
            }
        }
        // Registro da conexão (diagnóstico de quedas).
        JSArray log = new JSArray();
        if (service != null) {
            for (String line : service.getLog()) log.put(line);
        }
        result.put("log", log);
        call.resolve(result);
    }

    /** Envia um quadro ao relógio (hex "BC 4F 01 …") pela conexão do serviço. */
    @PluginMethod
    public void watchWrite(PluginCall call) {
        WatchService service = WatchService.instance;
        String data = call.getString("data");
        if (service == null || !service.isReady() || data == null) {
            call.reject("Relógio desconectado.");
            return;
        }
        service.write(NjjFrames.fromHex(data));
        call.resolve();
    }

    /**
     * Aparelhos pareados no Bluetooth do celular (Configurações → Bluetooth), com o tipo
     * (LE, clássico ou duplo) e se estão ligados ao celular agora.
     */
    @PluginMethod
    public void bondedDevices(PluginCall call) {
        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = manager != null ? manager.getAdapter() : null;
        JSArray devices = new JSArray();
        if (adapter == null) {
            call.reject("Este celular não tem Bluetooth.");
            return;
        }
        try {
            for (BluetoothDevice device : adapter.getBondedDevices()) {
                JSObject item = new JSObject();
                item.put("address", device.getAddress());
                item.put("name", device.getName());
                int type = device.getType();
                item.put("type", type == BluetoothDevice.DEVICE_TYPE_LE ? "le" : type == BluetoothDevice.DEVICE_TYPE_DUAL ? "dual" : type == BluetoothDevice.DEVICE_TYPE_CLASSIC ? "classic" : "unknown");
                item.put("connected", manager.getConnectionState(device, BluetoothProfile.GATT) == BluetoothProfile.STATE_CONNECTED);
                devices.put(item);
            }
        } catch (SecurityException error) {
            call.reject("Permita o Bluetooth (\"Dispositivos próximos\") para o app.");
            return;
        }
        JSObject result = new JSObject();
        result.put("devices", devices);
        call.resolve(result);
    }

    /** Pareia o relógio pelo Bluetooth do celular (abre a janela de pareamento do Android). */
    @PluginMethod
    public void pairWatch(PluginCall call) {
        String address = call.getString("address");
        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = manager != null ? manager.getAdapter() : null;
        if (address == null || adapter == null) {
            call.reject("Relógio não encontrado.");
            return;
        }
        try {
            BluetoothDevice device = adapter.getRemoteDevice(address);
            JSObject result = new JSObject();
            result.put("started", device.getBondState() == BluetoothDevice.BOND_BONDED || device.createBond());
            call.resolve(result);
        } catch (IllegalArgumentException | SecurityException error) {
            call.reject("Não foi possível parear: " + error.getMessage());
        }
    }

    /** Abre as configurações de Bluetooth do Android. */
    @PluginMethod
    public void openBluetoothSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    // ---------------------------------------------------------------- notificações do celular

    /** Grava as escolhas do envio de notificações ao relógio (lidas pelo leitor, mesmo com o app fechado). */
    @PluginMethod
    public void configureNotifications(PluginCall call) {
        SharedPreferences.Editor editor = WatchPrefs.get(getContext()).edit();
        editor.putBoolean(WatchPrefs.FORWARD, call.getBoolean("enabled", false));
        editor.putString(WatchPrefs.CONTENT_MODE, call.getString("contentMode", "full"));
        editor.putInt(WatchPrefs.DEFAULT_TYPE, call.getInt("defaultType", 0));
        Set<String> blocked = new HashSet<>();
        JSArray blockedArray = call.getArray("blocked", new JSArray());
        for (int i = 0; i < blockedArray.length(); i++) blocked.add(blockedArray.optString(i));
        editor.putStringSet(WatchPrefs.BLOCKED, blocked);
        JSObject types = call.getObject("types", new JSObject());
        editor.putString(WatchPrefs.TYPES, types.toString());
        boolean reminders = call.getBoolean("reminders", true);
        editor.putBoolean(WatchPrefs.REMINDERS, reminders);
        editor.apply();
        // Lembretes do app no relógio: desliga já o lembrete de água próprio dele (também a cada conexão).
        WatchService service = WatchService.instance;
        if (WatchPrefs.remindersOnWatch(getContext()) && service != null && service.isReady()) service.write(NjjFrames.drinkWater(false));
        call.resolve();
    }

    /** Apps que já mandaram notificação neste celular (nome, quantas e a última vez). */
    @PluginMethod
    public void notificationApps(PluginCall call) {
        JSArray apps = new JSArray();
        try {
            JSONObject seen = new JSONObject(WatchPrefs.get(getContext()).getString(WatchPrefs.SEEN, "{}"));
            Iterator<String> keys = seen.keys();
            while (keys.hasNext()) {
                String packageName = keys.next();
                JSONObject entry = seen.getJSONObject(packageName);
                JSObject app = new JSObject();
                app.put("packageName", packageName);
                app.put("appName", entry.optString("name", packageName));
                app.put("count", entry.optInt("count", 0));
                app.put("last", entry.optLong("last", 0));
                apps.put(app);
            }
        } catch (JSONException ignored) {
            // Lista vazia.
        }
        JSObject result = new JSObject();
        result.put("apps", apps);
        call.resolve(result);
    }

    /** O acesso às notificações do celular está liberado para o app? */
    @PluginMethod
    public void notificationAccess(PluginCall call) {
        JSObject result = new JSObject();
        result.put("enabled", NotificationManagerCompat.getEnabledListenerPackages(getContext()).contains(getContext().getPackageName()));
        call.resolve(result);
    }

    /** Abre a tela "Acesso a notificações" do Android. */
    @PluginMethod
    public void openNotificationAccessSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    // ---------------------------------------------------------------- bateria

    /** O app está liberado da economia de bateria? */
    @PluginMethod
    public void batteryStatus(PluginCall call) {
        PowerManager power = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        JSObject result = new JSObject();
        result.put("ignoringOptimizations", power != null && power.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        call.resolve(result);
    }

    /** Abre a janela do Android que libera o app da economia de bateria. */
    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception error) {
            // Alguns aparelhos não têm essa janela: abre a lista de otimização de bateria.
            Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(fallback);
        }
        call.resolve();
    }

    // ---------------------------------------------------------------- impressão (PDF)

    /**
     * "Gerar PDF": o WebView do Android não implementa window.print(), então a página vai para o
     * PrintManager do sistema, onde o destino "Salvar como PDF" gera o arquivo (vale o CSS de @media print).
     */
    @PluginMethod
    public void printPage(PluginCall call) {
        String name = call.getString("name", "Relatorio");
        getActivity().runOnUiThread(() -> {
            try {
                PrintManager printManager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                PrintDocumentAdapter adapter = getBridge().getWebView().createPrintDocumentAdapter(name);
                PrintAttributes attributes = new PrintAttributes.Builder()
                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                    .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                    .build();
                printManager.print(name, adapter, attributes);
                call.resolve();
            } catch (Exception error) {
                call.reject(error.getMessage());
            }
        });
    }

    // ---------------------------------------------------------------- treino em andamento

    /** Mostra ou atualiza a notificação do treino (ver WorkoutNotification). */
    @PluginMethod
    public void workoutNotification(PluginCall call) {
        List<String> lines = new ArrayList<>();
        JSArray array = call.getArray("lines", new JSArray());
        for (int i = 0; i < array.length(); i++) lines.add(array.optString(i));
        WorkoutNotification.show(
            getContext(),
            call.getString("title", "Treino"),
            call.getString("text", ""),
            lines,
            call.getString("shortText"),
            call.getData().optLong("elapsedMs", 0L),
            call.getBoolean("paused", false)
        );
        call.resolve();
    }

    /** Apaga a notificação do treino. */
    @PluginMethod
    public void workoutNotificationClear(PluginCall call) {
        WorkoutNotification.clear(getContext());
        call.resolve();
    }

    /** Now Bar da Samsung: aparelho compatível, permissão concedida pelo adb e ajuste ligado agora. */
    @PluginMethod
    public void nowBarStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", NowBarSwitch.isSupported());
        result.put("permission", NowBarSwitch.hasPermission(getContext()));
        result.put("enabled", NowBarSwitch.isEnabled(getContext()));
        call.resolve(result);
    }

    // ---------------------------------------------------------------- treino por cima da tela bloqueada

    /**
     * Liga ou desliga o app por cima da tela bloqueada, como a navegação do Google Maps: com o app aberto ao
     * bloquear, a tela volta direto no painel do treino, sem desbloquear. Não é notificação, então vale
     * mesmo com as notificações escondidas na tela bloqueada. O app só liga durante um treino.
     */
    @PluginMethod
    public void setShowOverLock(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        getActivity().runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                getActivity().setShowWhenLocked(enabled);
            } else if (enabled) {
                getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED);
            } else {
                getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED);
            }
            call.resolve();
        });
    }

    /** A tela está bloqueada agora (mesmo com o app por cima dela)? */
    @PluginMethod
    public void lockStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("locked", isKeyguardLocked());
        call.resolve(result);
    }

    /** Pede o desbloqueio (senha, digital ou rosto); depois dele o app volta ao normal. */
    @PluginMethod
    public void unlock(PluginCall call) {
        KeyguardManager keyguard = (KeyguardManager) getContext().getSystemService(Context.KEYGUARD_SERVICE);
        if (keyguard == null) {
            call.resolve();
            return;
        }
        getActivity().runOnUiThread(() -> {
            keyguard.requestDismissKeyguard(getActivity(), new KeyguardManager.KeyguardDismissCallback() {
                @Override
                public void onDismissSucceeded() {
                    emitLockState(false);
                }
            });
            call.resolve();
        });
    }

    /** Tela bloqueada (ou mostrando o app por cima do bloqueio)? */
    private boolean isKeyguardLocked() {
        KeyguardManager keyguard = (KeyguardManager) getContext().getSystemService(Context.KEYGUARD_SERVICE);
        return keyguard != null && keyguard.isKeyguardLocked();
    }

    /** Evento "lockState" para o app: { locked }. */
    private void emitLockState(boolean locked) {
        JSObject data = new JSObject();
        data.put("locked", locked);
        notifyListeners("lockState", data);
    }
}
