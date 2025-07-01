package com.jaybirdconnect.scanner;

import android.os.Bundle;
import android.util.Log;
import android.widget.TextView;
import android.widget.Button;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import android.bld.scan.ScanManager;
import org.json.JSONObject;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import okhttp3.Response;

public class MainActivity extends AppCompatActivity {
    private static final String TAG = "MainActivity";
    private ScanManager scanManager;
    private WebSocket webSocket;
    private TextView statusText;
    private TextView lastScanText;
    private Button reconnectButton;
    private boolean isConnected = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        
        statusText = findViewById(R.id.statusText);
        lastScanText = findViewById(R.id.lastScanText);
        reconnectButton = findViewById(R.id.reconnectButton);

        reconnectButton.setOnClickListener(v -> connectWebSocket());

        initializeScanManager();
        connectWebSocket();
    }

    private void initializeScanManager() {
        try {
            scanManager = new ScanManager();
            scanManager.setCallback(new ScanManager.ScanCallback() {
                @Override
                public void onScanResult(String barcode) {
                    handleScan(barcode);
                }
            });
            
            scanManager.startDecode();
            updateStatus("Scanner ready");
        } catch (Exception e) {
            Log.e(TAG, "Scanner initialization failed", e);
            updateStatus("Scanner initialization failed: " + e.getMessage());
        }
    }

    private void handleScan(String barcode) {
        runOnUiThread(() -> {
            lastScanText.setText("Last scan: " + barcode);
            sendBarcodeToServer(barcode);
        });
    }

    private void connectWebSocket() {
        if (webSocket != null) {
            webSocket.close(1000, "Reconnecting");
        }

        OkHttpClient client = new OkHttpClient();
        Request request = new Request.Builder()
            .url(Config.getWebSocketUrl())
            .build();

        WebSocketListener listener = new WebSocketListener() {
            @Override
            public void onOpen(WebSocket socket, Response response) {
                isConnected = true;
                updateStatus("Connected to server");
            }

            @Override
            public void onMessage(WebSocket socket, String text) {
                handleServerMessage(text);
            }

            @Override
            public void onFailure(WebSocket socket, Throwable t, Response response) {
                isConnected = false;
                updateStatus("Connection failed: " + t.getMessage());
            }

            @Override
            public void onClosed(WebSocket socket, int code, String reason) {
                isConnected = false;
                updateStatus("Disconnected: " + reason);
            }
        };

        webSocket = client.newWebSocket(request, listener);
    }

    private void handleServerMessage(String message) {
        try {
            JSONObject json = new JSONObject(message);
            String type = json.optString("type");

            if ("error".equals(type)) {
                updateStatus("Error: " + json.optString("message"));
            }
        } catch (Exception e) {
            Log.e(TAG, "Error parsing message", e);
        }
    }

    private void sendBarcodeToServer(String barcode) {
        if (!isConnected || webSocket == null) {
            updateStatus("Not connected - scan not sent");
            return;
        }

        try {
            JSONObject message = new JSONObject();
            message.put("type", "barcode");
            message.put("code", barcode);

            webSocket.send(message.toString());
            updateStatus("Sent: " + barcode);
        } catch (Exception e) {
            Log.e(TAG, "Error sending barcode", e);
            updateStatus("Error sending barcode");
        }
    }

    private void updateStatus(final String status) {
        runOnUiThread(() -> {
            statusText.setText(status);
            Log.d(TAG, "Status: " + status);
        });
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (scanManager != null) {
            scanManager.stopDecode();
        }
        if (webSocket != null) {
            webSocket.close(1000, "Activity destroyed");
        }
    }
}





    private void connectWebSocket() {
        if (webSocket != null) {

            webSocket.close(1000, "Reconnecting");
        }



        OkHttpClient client = new OkHttpClient();
        Request request = new Request.Builder()
            .url(Config.getWebSocketUrl())
            .build();

        WebSocketListener listener = new WebSocketListener() {
            @Override
            public void onOpen(WebSocket socket, Response response) {
                isConnected = true;
                updateStatus("Connected to server");
            }

            @Override
            public void onMessage(WebSocket socket, String text) {
                handleServerMessage(text);
            }


