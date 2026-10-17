package com.hubsaude.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin do próprio app (segundo plano, bateria e notificações do celular): registrado antes do onCreate.
        registerPlugin(HubBackgroundPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
