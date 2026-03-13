package com.lovable.mobilecrmwithsimcalls;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(CallLogPlugin.class);
        registerPlugin(AudioRecorderPlugin.class);
        registerPlugin(CallRecordingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
