package com.jaybirdconnect;

import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Callback;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import android.bld.scan.ScanManager;

public class ScannerModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;
    private ScanManager scanManager;

    public ScannerModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        this.scanManager = new ScanManager();
    }

    @Override
    public String getName() {
        return "ScannerModule";
    }

    @ReactMethod
    public void startScanner() {
        scanManager.setCallback(new ScanManager.ScanCallback() {
            @Override
            public void onScanResult(String barcode) {
                // Send event to React
                sendEvent("onBarcodeScanned", barcode);
            }
        });
        scanManager.startDecode();
    }

    @ReactMethod
    public void stopScanner() {
        scanManager.stopDecode();
    }

    private void sendEvent(String eventName, String data) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit(eventName, data);
    }
}