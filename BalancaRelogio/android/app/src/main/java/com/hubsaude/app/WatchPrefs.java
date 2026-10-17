package com.hubsaude.app;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.core.app.NotificationManagerCompat;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Preferências do relógio guardadas no Android (lidas pelo serviço mesmo com o app fechado):
 * qual relógio, se deve ficar conectado e como repassar as notificações do celular.
 * O app (JS) grava aqui pelo plugin HubBackground.
 */
final class WatchPrefs {

    private static final String FILE = "hub_watch";
    static final String ADDRESS = "address";
    static final String NAME = "name";
    static final String KEEP_CONNECTED = "keepConnected";
    static final String FORWARD = "forwardNotifications";
    static final String CONTENT_MODE = "contentMode"; // "full" | "appOnly"
    static final String BLOCKED = "blockedPackages";
    static final String TYPES = "types"; // JSON { pacote: tipo do ícone no relógio }
    static final String DEFAULT_TYPE = "defaultType";
    // Lembretes do app (água, refeições, pesagem) também no relógio, na mesma hora; desliga o lembrete de água do relógio.
    static final String REMINDERS = "forwardReminders";
    static final String SEEN = "seenApps"; // JSON { pacote: { name, count, last } }

    private WatchPrefs() {}

    /**
     * Os lembretes do app vão para o relógio? Precisa da opção ligada e do "Acesso a notificações" (é o leitor de
     * notificações que os repassa). Sem o acesso, o lembrete de água próprio do relógio continua ligado.
     */
    static boolean remindersOnWatch(Context context) {
        return get(context).getBoolean(REMINDERS, true)
            && NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.getPackageName());
    }

    static SharedPreferences get(Context context) {
        return context.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    /** Tipo de ícone do relógio para um app (mapa do app; senão, o padrão). */
    static int typeFor(Context context, String packageName) {
        SharedPreferences prefs = get(context);
        try {
            JSONObject types = new JSONObject(prefs.getString(TYPES, "{}"));
            if (types.has(packageName)) return types.getInt(packageName);
        } catch (JSONException ignored) {
            // Mapa inválido: usa o padrão.
        }
        return prefs.getInt(DEFAULT_TYPE, 0);
    }

    /** O app está bloqueado (não vai para o relógio)? */
    static boolean isBlocked(Context context, String packageName) {
        Set<String> blocked = get(context).getStringSet(BLOCKED, new HashSet<>());
        return blocked != null && blocked.contains(packageName);
    }

    /** Anota um app que mandou notificação (para a lista de apps na tela do relógio). */
    static void markSeen(Context context, String packageName, String appName) {
        SharedPreferences prefs = get(context);
        try {
            JSONObject seen = new JSONObject(prefs.getString(SEEN, "{}"));
            JSONObject entry = seen.optJSONObject(packageName);
            if (entry == null) entry = new JSONObject();
            entry.put("name", appName);
            entry.put("count", entry.optInt("count", 0) + 1);
            entry.put("last", System.currentTimeMillis());
            seen.put(packageName, entry);
            prefs.edit().putString(SEEN, seen.toString()).apply();
        } catch (JSONException ignored) {
            // Lista é só informativa.
        }
    }
}
