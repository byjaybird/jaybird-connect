const WebSocket = require('ws');
const dotenv = require('dotenv');
const http = require('http');
const url = require('url');

dotenv.config();

const PORT = process.env.SCANNER_BRIDGE_PORT || 8080;
const server = http.createServer();
const wss = new WebSocket.Server({ server });

const clients = {
    scanners: new Set(),
    web: new Set()
};

const processBarcodeQueue = new Set();
const BATCH_TIMEOUT = 1000;

const scheduleBatchProcessing = () => {
    setTimeout(() => {
        if (processBarcodeQueue.size > 0) {
            const scans = Array.from(processBarcodeQueue);
            processBarcodeQueue.clear();
        }
    }, BATCH_TIMEOUT);
};

const handleBarcodeScan = async (barcode) => {
    processBarcodeQueue.add(barcode);
    scheduleBatchProcessing();
};

const handleBarcodeMapping = async (barcode) => {
    return {
        type: 'scan_result',
        barcode,
        source_type: result.source_type,
        source_id: result.source_id
    };
};

const handleWebSocketError = (ws, error) => {
    console.error('WebSocket error:', error);

    const errorMessage = {
        type: 'error',
        message: error.message || 'Unknown error occurred'
    };

    ws.send(JSON.stringify(errorMessage));
};

wss.on('connection', (ws, req) => {
    const query = new URL(req.url, 'http://10.0.2.2:8080').searchParams;
    const clientId = query.get('clientId');
    const clientType = query.get('type');

        if (clientType === 'scanner') {
        clients.scanners.add(ws);
    } else if (clientType === 'web') {
        clients.web.add(ws);
    }

    console.log(`Client connected - Type: ${clientType}, ID: ${clientId}`);
    ws.isAlive = true;
    ws.send(JSON.stringify({
        type: 'connected',
        clientId,
        scannerConnected: clients.scanners.size > 0
                    }));

    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data);

            switch (message.type) {
                case 'barcode':
                clients.web.forEach(clientWs => {
                    if (clientWs.readyState === WebSocket.OPEN) {
                        clientWs.send(JSON.stringify({
                            type: 'barcode',
                                code: message.code,
                            timestamp: Date.now()
                        }));
        }
    });
                    await handleBarcodeScan(message.code);
                    break;

                case 'mapping_request':
                    const mappingResult = await handleBarcodeMapping(message.barcode);
                    ws.send(JSON.stringify(mappingResult));
                    break;

                case 'ping':
                    break;
            }
        } catch (error) {
            console.error('Message processing error:', error);
        }
});

    ws.on('close', () => {
        console.log(`Client disconnected - Type: ${clientType}, ID: ${clientId}`);
        if (clientType === 'scanner') {
            clients.scanners.delete(ws);
        } else if (clientType === 'web') {
            clients.web.delete(ws);
        }

        if (clientType === 'scanner') {
            clients.web.forEach(clientWs => {
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify({
                        type: 'status',
                        scannerConnected: clients.scanners.size > 0
                    }));
                }
    });
        }
});

    ws.on('pong', () => {
        ws.isAlive = true;
});

    ws.on('error', (error) => {
        handleWebSocketError(ws, error);
});
});

const PING_INTERVAL = 30000;

setInterval(() => {
    wss.clients.forEach(client => {
        if (client.isAlive === false) {
            return client.terminate();
        }

        client.isAlive = false;
        client.ping();
    });
}, PING_INTERVAL);

server.listen(PORT, () => {
    console.log(`WebSocket bridge server running on port ${PORT}`);
});

