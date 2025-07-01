package com.jaybirdconnect.scanner;

public class Config {
    // Debug flag - should be false in production builds
    public static final boolean DEBUG = BuildConfig.DEBUG;
    
    // Use 10.0.2.2 for Android emulator, change for real device testing
    public static final String WS_URL_DEBUG = "ws://10.0.2.2:8080?type=scanner";

    // Will need to be updated with actual production URL
    public static final String WS_URL_PROD = "wss://your-production-url.com/ws?type=scanner";
    
    // Get appropriate WebSocket URL based on build type
    public static String getWebSocketUrl() {
        return BuildConfig.DEBUG ? WS_URL_DEBUG : WS_URL_PROD;
    }
    
    // Connection retry settings
    public static final int RECONNECT_DELAY_MS = 5000;
    public static final int MAX_RECONNECT_ATTEMPTS = 5;
    
    // Scanner settings
    public static final String SCAN_MODE = "2D";  // Default to 2D barcode scanning
    public static final int SCAN_TIMEOUT_MS = 10000;  // 10 second timeout
}