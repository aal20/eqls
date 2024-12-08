import * as monaco from 'monaco-editor';

// Create WebSocket connection to language server
const ws = new WebSocket('ws://localhost:30000');

// Initialize the Monaco editor
const editor = monaco.editor.create(document.getElementById('editor')!, {
  value: '// Type your Echo Query here\nINDEX users\nFILTER age > 25',
  language: 'sql', // We'll use SQL highlighting for now
  theme: 'vs-dark',
  minimap: {
    enabled: false
  },
  automaticLayout: true,
});

// Handle WebSocket messages from the language server
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  // Handle language server messages (completions, diagnostics, etc.)
  console.log('Received message from server:', message);
};

// Send document changes to the language server
editor.onDidChangeModelContent(() => {
  const content = editor.getValue();
  ws.send(JSON.stringify({
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
});
