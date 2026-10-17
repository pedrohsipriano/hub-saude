package com.hubsaude.app;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;

/**
 * Now Bar da Samsung para o treino.
 * - Na One UI 8.5, a Now Bar só mostra as "atualizações ao vivo" de apps de fora com o ajuste de teste
 *   Settings.Secure "enable_notification_nowbar_test" = 1. É o botão "Notif. ao vivo para todos apps" das
 *   Opções do desenvolvedor, que a Samsung esconde em alguns builds; a SystemUI lê o ajuste a cada notificação.
 * - O app liga o ajuste só enquanto há treino e desliga ao terminar e ao abrir sem treino. O Android não
 *   avisa o app de que ele vai ser desinstalado, então é assim que o ajuste não fica ligado depois.
 * - Enquanto ligado, vale para todos os apps (é assim que o ajuste da Samsung funciona).
 * - Gravar em Settings.Secure exige WRITE_SECURE_SETTINGS, que só o adb concede e que se perde ao
 *   desinstalar: adb shell pm grant com.hubsaude.app android.permission.WRITE_SECURE_SETTINGS
 */
final class NowBarSwitch {

    static final String KEY = "enable_notification_nowbar_test";

    private NowBarSwitch() {}

    /** Samsung com Android 16+ (onde a Now Bar mostra atualizações ao vivo). */
    static boolean isSupported() {
        return "samsung".equalsIgnoreCase(Build.MANUFACTURER) && Build.VERSION.SDK_INT >= 36;
    }

    /** O adb já concedeu a permissão de gravar o ajuste? */
    static boolean hasPermission(Context context) {
        return context.checkSelfPermission(Manifest.permission.WRITE_SECURE_SETTINGS) == PackageManager.PERMISSION_GRANTED;
    }

    /** O ajuste está ligado agora? */
    static boolean isEnabled(Context context) {
        try {
            return Settings.Secure.getInt(context.getContentResolver(), KEY, 0) == 1;
        } catch (Exception error) {
            return false;
        }
    }

    /** Liga ou desliga o ajuste (sem a permissão, não faz nada; só grava se mudou). */
    static void set(Context context, boolean enabled) {
        if (!isSupported() || !hasPermission(context) || isEnabled(context) == enabled) return;
        try {
            Settings.Secure.putInt(context.getContentResolver(), KEY, enabled ? 1 : 0);
        } catch (Exception ignored) {
            // Sem permissão ou ajuste recusado: a notificação continua na barra, só fora da Now Bar.
        }
    }
}
