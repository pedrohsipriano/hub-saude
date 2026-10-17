package com.hubsaude.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Depois de ligar o celular (ou atualizar o app), volta a manter o relógio conectado —
 * se ele estava conectado antes. Não é preciso abrir o app.
 */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) return;
        if (!WatchPrefs.get(context).getBoolean(WatchPrefs.KEEP_CONNECTED, false)) return;
        try {
            WatchService.start(context);
        } catch (Exception ignored) {
            // O Android pode recusar iniciar o serviço agora; ele volta quando o app for aberto.
        }
    }
}
