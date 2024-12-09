import * as monaco from 'monaco-editor';

// Initialize the Monaco editor first so it's ready
const editor = monaco.editor.create(document.getElementById('editor')!, {
  value: '// Type your Echo Query here\nINDEX users\nFILTER age > 25',
  language: 'sql', // We'll use SQL highlighting for now
  theme: 'vs-dark',
  minimap: {
    enabled: false
  },
  automaticLayout: true,
});

// Track connection state
let initialized = false;
let nextRequestId = 1;
let ws: WebSocket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL = 1000; // 1 second

function connectToServer() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('Failed to connect to language server after maximum attempts');
    return;
  }

  ws = new WebSocket('ws://localhost:30000');

  ws.onopen = () => {
    console.log('Connected to language server');
    reconnectAttempts = 0; // Reset attempts on successful connection
    
    // Send initialize request
    const initializeRequest = {
      jsonrpc: '2.0',
      id: nextRequestId++,
      method: 'initialize',
      params: {
        processId: null,
        rootUri: null,
        capabilities: {
          textDocument: {
            synchronization: {
              dynamicRegistration: true,
              willSave: false,
              willSaveWaitUntil: false,
              didSave: false
            },
            completion: {
              dynamicRegistration: true,
              completionItem: {
                snippetSupport: true
              }
            },
            hover: {
              dynamicRegistration: true
            },
            signatureHelp: {
              dynamicRegistration: true
            },
            declaration: {
              dynamicRegistration: true
            },
            definition: {
              dynamicRegistration: true
            }
          },
          workspace: {
            didChangeConfiguration: {
              dynamicRegistration: true
            }
          }
        }
      }
    };
    ws?.send(JSON.stringify(initializeRequest));
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  ws.onclose = () => {
    console.log('Disconnected from language server');
    initialized = false;
    ws = null;

    // Try to reconnect
    reconnectAttempts++;
    console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
    setTimeout(connectToServer, RECONNECT_INTERVAL);
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    console.log('Received message from server:', message);

    if (!initialized && message.id === 1) { // Response to initialize request
      initialized = true;
      // Send initialized notification
      ws?.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialized',
        params: {}
      }));

      // Send initial document
      sendDocumentChange();
    }

    // Handle diagnostics
    if (message.method === 'textDocument/publishDiagnostics') {
      const diagnostics = message.params.diagnostics;
      const model = editor.getModel();
      if (model) {
        monaco.editor.setModelMarkers(model, 'echo-query', diagnostics.map((d: any) => ({
          severity: d.severity === 1 ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
          message: d.message,
          startLineNumber: d.range.start.line + 1,
          startColumn: d.range.start.character + 1,
          endLineNumber: d.range.end.line + 1,
          endColumn: d.range.end.character + 1
        })));
      }
    }
  };
}

// Function to send document changes
function sendDocumentChange() {
  if (!initialized || !ws) return;
  
  const content = editor.getValue();
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    method: 'textDocument/didChange',
    params: {
      textDocument: {
        uri: 'file:///workspace/query.echo',
        version: Date.now()
      },
      contentChanges: [
        {
          text: content
        }
      ]
    }
  }));
}

// Send document changes to the language server
editor.onDidChangeModelContent(() => {
  sendDocumentChange();
});

// Start connection attempt
connectToServer();
