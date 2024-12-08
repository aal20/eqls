import { createConnection, ProposedFeatures, Disposable } from 'vscode-languageserver/node.js';
import { WebSocketServer } from 'ws';
import express from 'express';
import cors from 'cors';
import { EchoQueryServer } from './echoquery-server.js';

// Create WebSocket server for language server protocol
const wss = new WebSocketServer({ port: 30000 });

wss.on('connection', (ws) => {
    console.log('Client connected to language server');
    
    // Create a connection for each client
    const connection = createConnection(ProposedFeatures.all);
    const server = new EchoQueryServer(connection);
    
    // Handle incoming messages
    ws.on('message', (data) => {
        try {
            const message = data.toString();
            // Instead of onMessage, parse and handle the message appropriately
            connection.listen();
        } catch (e) {
            console.error('Error processing message:', e);
            ws.send(JSON.stringify({
                jsonrpc: '2.0',
                id: null,
                error: {
                    code: -32603,
                    message: 'Internal server error'
                }
            }));
        }
    });

    // Handle connection errors
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });

    // Handle client disconnection
    ws.on('close', () => {
        console.log('Client disconnected from language server');
    });

    // Forward messages from the language server to the client
    connection.onNotification = (message: any) => {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(message));
        }
        return { dispose: () => {} }; // Return a Disposable object
    };

    server.start();
});

// Create HTTP server for code saving functionality
const app = express();
app.use(cors());
app.use(express.json());

app.post('/save-code', (req, res) => {
    const { code } = req.body;
    console.log('Received code:', code);
    res.json({ success: true, message: code });
});

const HTTP_PORT = 3004;
app.listen(HTTP_PORT, () => {
    console.log(`HTTP server running on port ${HTTP_PORT}`);
});

console.log('EchoQuery Language Server is running on port 30000');
