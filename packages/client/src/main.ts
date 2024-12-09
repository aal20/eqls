import * as monaco from 'monaco-editor';

// Register the echo-query language
monaco.languages.register({ id: 'echo-query' });

// Initialize the Monaco editor first so it's ready
const editor = monaco.editor.create(document.getElementById('editor')!, {
  value: '// Type your Echo Query here\nINDEX users\nFILTER age > 25',
  language: 'echo-query', // We'll use SQL highlighting for now
  theme: 'vs-dark',
  minimap: {
    enabled: false
  },
  automaticLayout: true,
  renderValidationDecorations: 'on',
  lightbulb: {
    enabled: true
  },
  lineNumbers: 'on',
  glyphMargin: true,
  folding: true,
  renderLineHighlight: 'all',
  matchBrackets: 'always'
});

// Configure editor markers
monaco.editor.setModelMarkers(editor.getModel()!, 'echo-query', []);

// Register custom error decoration
monaco.editor.defineTheme('echo-query-theme', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editorError.foreground': '#ff0000',
    'editorError.border': '#ff0000'
  }
});

monaco.editor.setTheme('echo-query-theme');

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
            publishDiagnostics: {
              relatedInformation: true
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
    console.log('Raw message from server:', event.data);
    const message = JSON.parse(event.data);
    console.log('Parsed message from server:', message);

    if (!initialized && message.id === 1) { // Response to initialize request
      initialized = true;
      // Send initialized notification
      ws?.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialized',
        params: {}
      }));

      // Send document open notification
      const content = editor.getValue();
      ws?.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'textDocument/didOpen',
        params: {
          textDocument: {
            uri: 'file:///workspace/query.echo',
            languageId: 'echo-query',
            version: Date.now(),
            text: content
          }
        }
      }));

      // Send initial document
      sendDocumentChange();
    }

    // Handle diagnostics
    if (message.method === 'textDocument/publishDiagnostics') {
      console.log('Received diagnostics:', message.params);
      const diagnostics = message.params.diagnostics;
      const model = editor.getModel();
      if (model) {
        console.log('Setting markers for model:', model.uri.toString());
        const markers = diagnostics.map((d: any) => ({
          severity: d.severity === 1 ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
          message: d.message,
          startLineNumber: d.range.start.line + 1,
          startColumn: d.range.start.character + 1,
          endLineNumber: d.range.end.line + 1,
          endColumn: d.range.end.character + 1,
          source: 'Echo Query',
          tags: [],
          relatedInformation: []
        }));
        console.log('Created markers:', markers);
        monaco.editor.setModelMarkers(model, 'echo-query', markers);
      } else {
        console.warn('No model found for editor');
      }
    }
  };
}

// Function to send document changes
function sendDocumentChange() {
  if (!initialized || !ws) {
    console.log('Not sending change - not initialized or no websocket');
    return;
  }
  
  const content = editor.getValue();
  console.log('Sending document change:', content);
  
  const message = {
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
  };
  
  console.log('Sending message:', message);
  ws.send(JSON.stringify(message));
}

// Send document changes to the language server
editor.onDidChangeModelContent(() => {
  console.log('Editor content changed');
  sendDocumentChange();
});

// Start connection attempt
connectToServer();
