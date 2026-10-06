package com.cultivo.flora.v25;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkDownloadPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
