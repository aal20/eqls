# Echo Query Language Server

A standalone implementation of the Echo Query Language Server that provides language features through the Language Server Protocol (LSP).

## Features

- Language Server Protocol support
- WebSocket-based communication
- Code saving functionality through HTTP endpoint
- TypeScript implementation

## Setup

1. Install dependencies:
```bash
npm install
```

2. Build the project:
```bash
npm run build
```

3. Start the server:
```bash
npm start
```

## Server Details

- Language Server runs on WebSocket port 30000
- HTTP server for code saving runs on port 3004
- Supports LSP features:
  - Completion
  - Hover
  - Document Symbols
  - Document Formatting

## API Endpoints

- POST `/save-code`: Save code content
  - Body: `{ "code": "string" }`
  - Returns: `{ "success": true, "message": "saved code" }`
