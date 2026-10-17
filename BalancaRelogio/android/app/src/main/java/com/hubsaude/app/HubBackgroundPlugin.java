package com.hubsaude.app;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashSet;
import java.util.Iterator;
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
 */
@CapacitorPlugin(name = "HubBackground")
@android.annotation.SuppressLint("MissingPermission") // o app só chama estes métodos depois de pedir o Bluetooth
public class HubBackgroundPlugin extends Plugin {

    /** Plugin ativo (null com o app fechado: os eventos param de ser entregues, o serviço continua). */
    static volatile HubBackgroundPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
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
        editor.apply();
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
}
