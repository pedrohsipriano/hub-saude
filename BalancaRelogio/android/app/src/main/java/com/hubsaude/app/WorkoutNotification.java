package com.hubsaude.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.text.TextUtils;
import androidx.core.app.NotificationCompat;
import java.util.List;

/**
 * Notificação do treino em andamento, na barra de notificações e na tela bloqueada.
 * - Visibilidade pública: mostra os números também com o celular bloqueado.
 * - Cronômetro contado pelo próprio Android (setUsesChronometer), sem depender do app atualizar.
 * - Texto com os números que o app manda (distância, ritmo/velocidade, calorias), atualizado a cada poucos segundos.
 * - Android 16+: pede para virar "atualização ao vivo" (setRequestPromotedOngoing). Ela ganha o chip na barra de
 *   status e destaque na tela bloqueada. Na Samsung, a Now Bar ainda depende de um ajuste de teste, que o
 *   app liga só durante o treino (NowBarSwitch).
 * - Usa o mesmo id da notificação do serviço de GPS do plugin @capacitor-community/background-geolocation
 *   (BackgroundGeolocationService.NOTIFICATION_ID = 28351). Assim ela substitui a notificação fixa
 *   "Gravando o treino" em vez de criar uma segunda, e some sozinha quando o GPS para.
 */
final class WorkoutNotification {

    /** Mesmo id da notificação do serviço de GPS do plugin (ver acima). */
    static final int NOTIFICATION_ID = 28351;
    static final String CHANNEL_ID = "hub-treino";

    private WorkoutNotification() {}

    /**
     * Mostra ou atualiza a notificação.
     * @param title título ("Corrida · gravando")
     * @param text linha da notificação recolhida ("2,15 km · 5:30 /km · 135 kcal")
     * @param lines linhas da notificação expandida
     * @param shortText texto do chip da barra de status (Android 16+), ou null
     * @param elapsedMs tempo em movimento (o cronômetro continua a partir dele)
     * @param paused pausado: o cronômetro para (o tempo vai no título)
     */
    static void show(Context context, String title, String text, List<String> lines, String shortText, long elapsedMs, boolean paused) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        createChannel(manager);
        // Samsung: libera a Now Bar só durante o treino (ver NowBarSwitch).
        NowBarSwitch.set(context, true);

        // Tocar na notificação volta ao app.
        PendingIntent open = null;
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            open = PendingIntent.getActivity(context, NOTIFICATION_ID, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_workout)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(TextUtils.join("\n", lines)))
            .setOngoing(true)
            .setOnlyAlertOnce(true) // atualizar não toca nem vibra
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC) // conteúdo completo na tela bloqueada
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            // Cronômetro: conta a partir de "agora − tempo em movimento"; pausado, fica parado.
            .setWhen(System.currentTimeMillis() - elapsedMs)
            .setShowWhen(!paused)
            .setUsesChronometer(!paused)
            // Android 16+: atualização ao vivo (chip na barra de status, tela bloqueada, Now Bar da Samsung).
            .setRequestPromotedOngoing(true);
        if (shortText != null && !paused) builder.setShortCriticalText(shortText);
        if (open != null) builder.setContentIntent(open);

        try {
            manager.notify(NOTIFICATION_ID, builder.build());
        } catch (SecurityException ignored) {
            // Sem a permissão de notificações: o treino continua gravando, só sem a notificação.
        }
    }

    /** Apaga a notificação (com o GPS ligado, quem a apaga é o próprio serviço do plugin ao parar). */
    static void clear(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.cancel(NOTIFICATION_ID);
        // Sem treino, o ajuste da Now Bar volta a ficar desligado.
        NowBarSwitch.set(context, false);
    }

    /**
     * Canal do treino: importância padrão (fica na seção de alertas e aparece na tela bloqueada; as
     * "silenciosas" a Samsung esconde), mas sem som, vibração nem luz.
     */
    private static void createChannel(NotificationManager manager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Treino em andamento", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("Cronômetro, distância, ritmo e calorias do treino, também na tela bloqueada.");
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.enableLights(false);
        channel.setShowBadge(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }
}
