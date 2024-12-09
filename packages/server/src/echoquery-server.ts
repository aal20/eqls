import { createConnection, _Connection, TextDocuments, ProposedFeatures } from 'vscode-languageserver/node.js';
import {
    Diagnostic, CompletionList, CompletionItem, Hover,
    SymbolInformation, TextEdit, CompletionItemKind
} from 'vscode-languageserver-types';
import { 
    TextDocumentPositionParams, 
    DocumentRangeFormattingParams,
    TextDocumentSyncKind,
    DocumentSymbolParams
} from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as URI from 'vscode-uri';
import { MessageConnection } from 'vscode-jsonrpc';

export class EchoQueryServer {
    protected readonly connection: _Connection;
    protected workspaceRoot: URI.URI | undefined;
    protected readonly documents = new TextDocuments(TextDocument);
    protected readonly pendingValidationRequests = new Map<string, NodeJS.Timeout>();

    constructor(connection: _Connection) {
        this.connection = connection;
        console.log('EchoQueryServer: Setting up document listener');
        
        // Listen for document lifecycle events
        connection.onDidOpenTextDocument((params) => {
            console.log('Document opened:', params.textDocument.uri);
            const document = TextDocument.create(
                params.textDocument.uri,
                params.textDocument.languageId,
                params.textDocument.version,
                params.textDocument.text
            );
            this.documents.set(document);
            this.validate(document);
        });

        connection.onDidChangeTextDocument((params) => {
            console.log('Document changed:', params.textDocument.uri);
            console.log('Changes:', params.contentChanges);
            const document = this.documents.get(params.textDocument.uri);
            if (!document) {
                console.log('Creating new document');
                const newDocument = TextDocument.create(
                    params.textDocument.uri,
                    'echo-query',
                    params.textDocument.version,
                    params.contentChanges[0].text
                );
                this.documents.set(newDocument);
                this.validate(newDocument);
            } else {
                console.log('Updating existing document');
                const newDocument = TextDocument.create(
                    document.uri,
                    document.languageId,
                    params.textDocument.version,
                    params.contentChanges[0].text
                );
                this.documents.set(newDocument);
                this.validate(newDocument);
            }
        });

        this.documents.listen(this.connection);
        
        this.documents.onDidChangeContent(change => {
            console.log('Document content changed:', change.document.uri);
            console.log('New content:', change.document.getText());
            this.validate(change.document)
        });
        
        this.documents.onDidClose(event => {
            console.log('Document closed:', event.document.uri);
            this.cleanPendingValidation(event.document);
            this.cleanDiagnostics(event.document);
        });

        this.connection.onInitialize(params => {
            console.log('Initializing with params:', params);
            if (params.rootPath) {
                this.workspaceRoot = URI.URI.file(params.rootPath);
            } else if (params.rootUri) {
                this.workspaceRoot = URI.URI.parse(params.rootUri);
            }
            
            console.log('The EchoQuery server is initialized.');
            
            return {
                capabilities: {
                    textDocumentSync: {
                        openClose: true,
                        change: TextDocumentSyncKind.Full,
                        willSave: false,
                        willSaveWaitUntil: false,
                        save: {
                            includeText: false
                        }
                    },
                    completionProvider: {
                        resolveProvider: true,
                        triggerCharacters: ['.', '@']
                    },
                    hoverProvider: true,
                    documentSymbolProvider: true,
                    documentRangeFormattingProvider: true,
                    diagnosticProvider: {
                        workspace: true,
                        identifier: {
                            propertyNames: ['owner']
                        },
                        codeActions: {
                            workspace: true
                        }
                    }
                }
            };
        });

        this.connection.onRequest('textDocument/completion', (params: any) => this.completion(params));
        this.connection.onRequest('completionItem/resolve', (item: any) => this.resolveCompletion(item));
        this.connection.onRequest('textDocument/hover', (params: any) => this.hover(params));
        this.connection.onRequest('textDocument/documentSymbol', (params: any) => this.findDocumentSymbols(params));
        this.connection.onRequest('textDocument/rangeFormatting', (params: any) => this.format(params));
    }

    public start(): void {
        this.connection.listen();
    }

    protected cleanPendingValidation(textDocument: TextDocument): void {
        const request = this.pendingValidationRequests.get(textDocument.uri);
        if (request) {
            clearTimeout(request);
            this.pendingValidationRequests.delete(textDocument.uri);
        }
    }

    protected cleanDiagnostics(textDocument: TextDocument): void {
        this.connection.sendNotification('textDocument/publishDiagnostics', {
            uri: textDocument.uri,
            diagnostics: []
        });
    }

    protected validate(textDocument: TextDocument): void {
        console.log('Starting validation process for:', textDocument.uri);
        this.cleanPendingValidation(textDocument);
        // Perform validation immediately instead of with timeout
        this.doValidate(textDocument);
    }

    protected doValidate(textDocument: TextDocument): void {
        console.log('Performing validation for:', textDocument.uri);
        const diagnostics: Diagnostic[] = [];
        const text = textDocument.getText();
        const lines = text.split('\n');

        console.log('Document text to validate:', text);

        // Check each line for syntax errors
        lines.forEach((line, lineIndex) => {
            const trimmedLine = line.trim();
            if (trimmedLine === '' || trimmedLine.startsWith('//')) {
                return; // Skip empty lines and comments
            }

            console.log(`Validating line ${lineIndex}:`, trimmedLine);

            // Check for valid keywords at start of line
            const validStartKeywords = ['INDEX', 'FILTER', 'MAP', 'AS', 'SQL', 'JOIN'];
            const firstWord = trimmedLine.split(/\s+/)[0].toUpperCase();
            
            console.log('First word:', firstWord);
            
            if (!validStartKeywords.includes(firstWord)) {
                console.log('Invalid keyword found:', firstWord);
                diagnostics.push({
                    severity: 1, // Error
                    range: {
                        start: { line: lineIndex, character: 0 },
                        end: { line: lineIndex, character: firstWord.length }
                    },
                    message: `Line must start with one of: ${validStartKeywords.join(', ')}`,
                    source: 'Echo Query'
                });
            }

            // Check for INDEX statement format
            if (firstWord === 'INDEX') {
                const parts = trimmedLine.split(/\s+/).filter(part => part.length > 0);
                console.log('INDEX parts:', parts);
                if (parts.length < 2 || !parts[1]?.trim()) {
                    console.log('Invalid INDEX format detected');
                    diagnostics.push({
                        severity: 1,
                        range: {
                            start: { line: lineIndex, character: 0 },
                            end: { line: lineIndex, character: trimmedLine.length || 5 } // Default to length of "INDEX" if line is empty
                        },
                        message: 'INDEX statement must be followed by an index name',
                        source: 'Echo Query'
                    });
                }
            }

            // Check for FILTER statement format
            if (firstWord === 'FILTER') {
                const hasCondition = trimmedLine.includes('>') || 
                                   trimmedLine.includes('<') || 
                                   trimmedLine.includes('=') ||
                                   trimmedLine.includes('!=');
                
                if (!hasCondition) {
                    console.log('Invalid FILTER format detected');
                    diagnostics.push({
                        severity: 1,
                        range: {
                            start: { line: lineIndex, character: 0 },
                            end: { line: lineIndex, character: trimmedLine.length }
                        },
                        message: 'FILTER must include a comparison operator (>, <, =, !=)',
                        source: 'Echo Query'
                    });
                }
            }

            // Check for MAP statement format
            if (firstWord === 'MAP') {
                if (!trimmedLine.includes('AS') && !trimmedLine.includes('.')) {
                    console.log('Invalid MAP format detected');
                    diagnostics.push({
                        severity: 2, // Warning
                        range: {
                            start: { line: lineIndex, character: 0 },
                            end: { line: lineIndex, character: trimmedLine.length }
                        },
                        message: 'MAP statement should typically include field paths (using dots) or AS keyword',
                        source: 'Echo Query'
                    });
                }
            }

            // Check for unmatched quotes
            const quoteCount = (trimmedLine.match(/"/g) || []).length;
            if (quoteCount % 2 !== 0) {
                console.log('Unmatched quotes found');
                diagnostics.push({
                    severity: 1,
                    range: {
                        start: { line: lineIndex, character: 0 },
                        end: { line: lineIndex, character: trimmedLine.length }
                    },
                    message: 'Unmatched quotes in line',
                    source: 'Echo Query'
                });
            }
        });

        console.log('Final diagnostics:', diagnostics);
        
        // Send diagnostics notification
        this.connection.sendDiagnostics({
            uri: textDocument.uri,
            diagnostics: diagnostics
        });
        
        console.log('Sent diagnostics notification for:', textDocument.uri);
    }

    protected completion(params: TextDocumentPositionParams): CompletionList {
        const document = this.documents.get(params.textDocument.uri);
        if (!document) {
            return { isIncomplete: false, items: [] };
        }

        // Add completions for echo query language
        const items: CompletionItem[] = [
            {
                label: 'INDEX',
                kind: CompletionItemKind.Keyword,
                detail: 'INDEX statement',
                documentation: 'Specify the index to query from'
            },
            {
                label: 'FILTER',
                kind: CompletionItemKind.Keyword,
                detail: 'FILTER operation',
                documentation: 'Filter and transform the results'
            },
            {
                label: 'MAP',
                kind: CompletionItemKind.Keyword,
                detail: 'MAP function',
                documentation: 'Transform data using a mapping expression'
            },
            {
                label: 'AS',
                kind: CompletionItemKind.Keyword,
                detail: 'AS clause',
                documentation: 'Assign an alias to the result set'
            },
            {
                label: 'SQL',
                kind: CompletionItemKind.Keyword,
                detail: 'SQL operation',
                documentation: 'Perform SQL operations on the data'
            },
            {
                label: 'JOIN',
                kind: CompletionItemKind.Keyword,
                detail: 'JOIN function',
                documentation: 'Join two result sets based on conditions'
            },
            {
                label: 'NOT',
                kind: CompletionItemKind.Keyword,
                detail: 'NOT operator',
                documentation: 'Negate a condition'
            }
        ];

        // Add common field completions
        const fields = [
            'winlog.event_id',
            'winlog.event_data.ProcessName',
            'host.hostname',
            'process.executable'
        ].map(field => ({
            label: field,
            kind: CompletionItemKind.Field,
            detail: 'Field',
            documentation: `Field path: ${field}`
        }));

        return {
            isIncomplete: false,
            items: [...items, ...fields]
        };
    }

    protected resolveCompletion(item: CompletionItem): CompletionItem {
        if (item.kind === CompletionItemKind.Keyword) { 
            item.detail = 'Echo Query Keyword';
            item.documentation = 'Echo Query language keyword for query construction';
        } else if (item.kind === CompletionItemKind.Field) { 
            item.detail = 'Field Path';
            item.documentation = 'Field path for data access';
        }
        return item;
    }

    protected hover(params: TextDocumentPositionParams): Hover | undefined {
        const document = this.documents.get(params.textDocument.uri);
        if (!document) {
            return undefined;
        }

        const offset = document.offsetAt(params.position);
        const text = document.getText();
        const word = this.getWordAtOffset(text, offset);

        if (word) {
            switch (word.toUpperCase()) {
                case 'INDEX':
                    return {
                        contents: ['INDEX statement', 'Specifies the index to query from']
                    };
                case 'FILTER':
                    return {
                        contents: ['FILTER operation', 'Filters and transforms the result set']
                    };
                case 'MAP':
                    return {
                        contents: ['MAP function', 'Transforms data using a mapping expression']
                    };
                case 'AS':
                    return {
                        contents: ['AS clause', 'Assigns an alias to the result set']
                    };
                case 'SQL':
                    return {
                        contents: ['SQL operation', 'Performs SQL operations on the data']
                    };
                case 'JOIN':
                    return {
                        contents: ['JOIN function', 'Joins two result sets based on conditions']
                    };
                case 'NOT':
                    return {
                        contents: ['NOT operator', 'Negates a condition']
                    };
            }
        }

        return {
            contents: ['Echo Query Language']
        };
    }

    protected findDocumentSymbols(params: DocumentSymbolParams): SymbolInformation[] {
        const document = this.documents.get(params.textDocument.uri);
        if (!document) {
            return [];
        }

        const symbols: SymbolInformation[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        lines.forEach((line, i) => {
            // Match Echo Query keywords
            const keywordMatch = line.match(/\b(INDEX|FILTER|MAP|AS|SQL|JOIN|NOT)\b/gi);
            if (keywordMatch) {
                keywordMatch.forEach(keyword => {
                    symbols.push({
                        name: keyword,
                        kind: 14, // Keyword
                        location: {
                            uri: document.uri,
                            range: {
                                start: { line: i, character: line.indexOf(keyword) },
                                end: { line: i, character: line.indexOf(keyword) + keyword.length }
                            }
                        }
                    });
                });
            }

            // Match field paths
            const fieldMatch = line.match(/\b(winlog\.event_id|winlog\.event_data\.ProcessName|host\.hostname|process\.executable)\b/g);
            if (fieldMatch) {
                fieldMatch.forEach(field => {
                    symbols.push({
                        name: field,
                        kind: 7, // Variable
                        location: {
                            uri: document.uri,
                            range: {
                                start: { line: i, character: line.indexOf(field) },
                                end: { line: i, character: line.indexOf(field) + field.length }
                            }
                        }
                    });
                });
            }
        });

        return symbols;
    }

    protected format(params: DocumentRangeFormattingParams): TextEdit[] {
        const document = this.documents.get(params.textDocument.uri);
        if (!document) {
            return [];
        }

        const text = document.getText(params.range);
        const lines = text.split('\n');
        const formattedLines = lines.map(line => {
            // Format Echo Query keywords
            return line.replace(/\b(INDEX|FILTER|MAP|AS|SQL|JOIN|NOT)\b/gi, match => match.toUpperCase())
                      .replace(/([,(){}])/g, '$1 ')
                      .replace(/\s+/g, ' ')
                      .trim();
        });

        return [{
            range: params.range,
            newText: formattedLines.join('\n')
        }];
    }

    private getWordAtOffset(text: string, offset: number): string | undefined {
        const wordPattern = /\b\w+\b/g;
        let match;
        while ((match = wordPattern.exec(text)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (offset >= start && offset <= end) {
                return match[0];
            }
        }
        return undefined;
    }
}
