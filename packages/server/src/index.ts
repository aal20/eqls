import {
    InitializeParams,
    InitializeResult,
    TextDocumentSyncKind,
    DidChangeTextDocumentParams,
    PublishDiagnosticsParams,
    createConnection,
    ProposedFeatures,
    _Connection,
    MessageReader,
    MessageWriter
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { WebSocketServer } from 'ws';
import express from 'express';
import cors from 'cors';
import { EchoQueryServer } from './echoquery-server.js';
import { IWebSocket, WebSocketMessageReader, WebSocketMessageWriter } from 'vscode-ws-jsonrpc';
import { createServerProcess } from 'vscode-ws-jsonrpc/server';

// Create WebSocket server for language server protocol
const wss = new WebSocketServer({ port: 30000 });

console.log('Starting EchoQuery Language Server on port 30000...');

// Handle WebSocket server errors
wss.on('error', (error) => {
    console.error('WebSocket server error:', error);
});

wss.on('connection', (ws) => {
    console.log('Client connected to language server');
    
    // Create JSON-RPC WebSocket wrapper
    const socket: IWebSocket = {
        send: content => ws.send(content, error => {
            if (error) {
                throw error;
            }
        }),
        onMessage: cb => ws.on('message', cb),
        onError: cb => ws.on('error', cb),
        onClose: cb => ws.on('close', cb),
        dispose: () => ws.close()
    };

    // Create JSON-RPC connection
    const reader = new WebSocketMessageReader(socket) as MessageReader;
    const writer = new WebSocketMessageWriter(socket) as MessageWriter;

    // Create LSP connection with proper features
    const connection = createConnection(ProposedFeatures.all, reader, writer);

    // Add logging for all incoming messages
    ws.on('message', (data) => {
        console.log('Raw WebSocket message received:', data.toString());
    });

    // Add notification logging
    connection.onNotification((method, params) => {
        console.log('LSP notification received:', { method, params });
    });

    // Create LSP server instance
    const server = new EchoQueryServer(connection);
    server.start();

    // Handle connection errors
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });

    // Handle client disconnection
    ws.on('close', () => {
        console.log('Client disconnected from language server');
        socket.dispose();
    });
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
const httpServer = app.listen(HTTP_PORT, () => {
    console.log(`HTTP server running on port ${HTTP_PORT}`);
});

// Handle HTTP server errors
httpServer.on('error', (error) => {
    console.error('HTTP server error:', error);
});
