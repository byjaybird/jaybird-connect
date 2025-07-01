class MainActivity : AppCompatActivity() {
    private lateinit var websocket: WebSocket
    private lateinit var scanner: BarcodeScanner
    private var isConnected = false
    
    private val webSocketListener = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            isConnected = true
            runOnUiThread {
                updateConnectionStatus("Connected to server")
            }
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            isConnected = false
            runOnUiThread {
                updateConnectionStatus("Connection failed: ${t.message}")
            }
            // Attempt reconnection after delay
            Handler(Looper.getMainLooper()).postDelayed({
                connectWebSocket()
            }, 5000)
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            isConnected = false
            runOnUiThread {
                updateConnectionStatus("Connection closing")
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        initializeScanner()
        connectWebSocket()
    }

    private fun initializeScanner() {
        scanner = BarcodeScanner.Builder(this)
            .setBarcodeFormats(BarcodeFormat.ALL_FORMATS)
            .build()

        scanner.setOnScanListener { barcode ->
            if (isConnected) {
                val scanData = JSONObject().apply {
                    put("type", "scan")
                    put("barcode", barcode.rawValue)
                    put("format", barcode.format)
                    put("timestamp", System.currentTimeMillis())
                }
                websocket.send(scanData.toString())
            }
        }
    }

    private fun connectWebSocket() {
        val client = OkHttpClient.Builder()
            .readTimeout(0, TimeUnit.MILLISECONDS) // No timeout for WebSocket
            .build()

        val wsUrl = if (BuildConfig.DEBUG) {
            "ws://10.0.2.2:8080?type=scanner&clientId=${UUID.randomUUID()}"
        } else {
            "wss://your-production-url/ws?type=scanner&clientId=${UUID.randomUUID()}"
        }

        val request = Request.Builder()
            .url(wsUrl)
            .build()

        websocket = client.newWebSocket(request, webSocketListener)
    }

    private fun updateConnectionStatus(status: String) {
        findViewById<TextView>(R.id.connectionStatus).text = status
    }

    override fun onDestroy() {
        super.onDestroy()
        websocket.close(1000, "Activity destroyed")
        scanner.release()
    }
}