package com.hubsaude.app;

import android.app.Notification;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import com.getcapacitor.JSObject;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Leitor das notificações do celular (o usuário libera em "Acesso a notificações").
 * Repassa cada notificação nova ao relógio pelo WatchService — funciona com o app fechado —
 * conforme as escolhas da tela do relógio (WatchPrefs: ligado, apps bloqueados, ícone de cada app,
 * texto completo ou só o nome do app). Nada é gravado no banco nem enviado para fora do celular.
 */
public class HubNotificationListener extends NotificationListenerService {

    // Tipos de ícone do relógio usados diretamente aqui (os demais vêm do mapa do app).
    private static final int TYPE_INCOMING_CALL = 1;

    /** Última notificação enviada de cada chave (evita repetir a mesma mensagem quando o app a atualiza). */
    private static final Map<String, String> lastSent = new LinkedHashMap<String, String>(64, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, String> eldest) {
            return size() > 100;
        }
    };

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;
        String packageName = sbn.getPackageName();
        // As do próprio app (lembretes, "Conectado ao relógio") não vão para o relógio.
        if (getPackageName().equals(packageName)) return;

        Notification notification = sbn.getNotification();
        if (notification == null) return;
        // Resumo de grupo repete as mensagens; notificações fixas (música, download) não interessam, a não ser chamadas.
        if ((notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        boolean isCall = Notification.CATEGORY_CALL.equals(notification.category);
        if (sbn.isOngoing() && !isCall) return;

        Bundle extras = notification.extras;
        CharSequence titleChars = extras != null ? extras.getCharSequence(Notification.EXTRA_TITLE) : null;
        CharSequence textChars = extras != null ? extras.getCharSequence(Notification.EXTRA_BIG_TEXT) : null;
        if (textChars == null && extras != null) textChars = extras.getCharSequence(Notification.EXTRA_TEXT);
        String title = titleChars != null ? titleChars.toString() : "";
        String text = textChars != null ? textChars.toString() : "";
        if (title.isEmpty() && text.isEmpty()) return;

        String appName = appLabel(packageName);
        WatchPrefs.markSeen(this, packageName, appName);
        boolean forwarded = forward(sbn.getKey(), packageName, appName, title, text, isCall);

        // Com o app aberto, ele mostra a lista de apps e o que foi enviado (sem guardar o texto).
        JSObject data = new JSObject();
        data.put("packageName", packageName);
        data.put("appName", appName);
        data.put("forwarded", forwarded);
        data.put("postedAt", sbn.getPostTime());
        HubBackgroundPlugin.emitObject("notificationPosted", data);
    }

    /** Manda ao relógio, se as preferências permitirem e ele estiver conectado. */
    private boolean forward(String key, String packageName, String appName, String title, String text, boolean isCall) {
        SharedPreferences prefs = WatchPrefs.get(this);
        if (!prefs.getBoolean(WatchPrefs.FORWARD, false) || WatchPrefs.isBlocked(this, packageName)) return false;
        WatchService service = WatchService.instance;
        if (service == null || !service.isReady()) return false;

        // Mesma mensagem da mesma notificação (o app só atualizou): não repete. Chamada: só uma vez.
        String signature = isCall ? "call" : title + "\n" + text;
        synchronized (lastSent) {
            if (signature.equals(lastSent.get(key))) return false;
            lastSent.put(key, signature);
        }

        int type = isCall ? TYPE_INCOMING_CALL : WatchPrefs.typeFor(this, packageName);
        boolean appOnly = "appOnly".equals(prefs.getString(WatchPrefs.CONTENT_MODE, "full"));
        String watchTitle;
        String watchText;
        if (isCall) {
            watchTitle = title.isEmpty() ? "Chamada" : title;
            watchText = "Chamada recebida";
        } else if (appOnly) {
            watchTitle = appName;
            watchText = "Nova notificação";
        } else {
            // Título: quem mandou (ou o app); texto: a mensagem.
            watchTitle = title.isEmpty() ? appName : title;
            watchText = text.isEmpty() ? appName : text;
        }
        service.write(NjjFrames.alert(type, watchTitle, watchText));
        return true;
    }

    /** Nome do app ("WhatsApp") a partir do pacote ("com.whatsapp"). */
    private String appLabel(String packageName) {
        try {
            PackageManager manager = getPackageManager();
            ApplicationInfo info = manager.getApplicationInfo(packageName, 0);
            return manager.getApplicationLabel(info).toString();
        } catch (PackageManager.NameNotFoundException error) {
            return packageName;
        }
    }
}
