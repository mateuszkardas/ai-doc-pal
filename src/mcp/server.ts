/**
 * MCP Server Module
 * 
 * Exposes documentation via Model Context Protocol.
 * 
 * Tools:
 *   - search_docs: Semantic search through documentation
 *   - read_file: Read full document content
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { VectorDatabase, type SearchResult } from '../db/vector-db.js';
import { createEmbeddingProvider, type EmbeddingProvider, type ProviderType } from '../embeddings/provider.js';
import { getApiKey, getEndpoint } from '../config/index.js';

export interface McpDocServerConfig {
  name: string;
  dbPath: string;
  docsPath: string;
  embeddingDimension: number;
  provider: ProviderType;
  model: string;
  endpoint?: string;
  apiKey?: string;
  description?: string;
}

export class McpDocServer {
  private config: McpDocServerConfig;
  private server: Server;
  private db: VectorDatabase;
  private embeddingProvider: EmbeddingProvider | null = null;

  constructor(config: McpDocServerConfig) {
    this.config = config;
    
    // Initialize database
    this.db = new VectorDatabase(config.dbPath, config.embeddingDimension);

    // Initialize MCP server
    this.server = new Server(
      {
        name: `ai-doc-pal:${config.name}`,
        version: '0.1.0',
        description: config.description || `Documentation for ${config.name}`,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private async getEmbeddingProvider(): Promise<EmbeddingProvider> {
    if (!this.embeddingProvider) {
      const apiKey = this.config.apiKey || getApiKey(this.config.provider);
      const endpoint = this.config.endpoint || getEndpoint(this.config.provider);

      this.embeddingProvider = createEmbeddingProvider({
        type: this.config.provider,
        model: this.config.model,
        endpoint,
        apiKey,
      });
    }
    return this.embeddingProvider;
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'search_docs',
            description: `Search through ${this.config.name} documentation using semantic similarity. Returns relevant chunks from markdown files.`,
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'The search query - describe what you\'re looking for',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results to return (default: 5)',
                  default: 5,
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'read_file',
            description: `Read the full content of a documentation file from ${this.config.name}. Use this after search_docs to get more context.`,
            inputSchema: {
              type: 'object',
              properties: {
                file_path: {
                  type: 'string',
                  description: 'Relative path to the documentation file (e.g., "getting-started.md")',
                },
              },
              required: ['file_path'],
            },
          },
          {
            name: 'list_files',
            description: `List all documentation files in ${this.config.name}.`,
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'search_docs':
          return this.handleSearchDocs(args as { query: string; limit?: number });
        
        case 'read_file':
          return this.handleReadFile(args as { file_path: string });
        
        case 'list_files':
          return this.handleListFiles();
        
        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    });
  }

  private async handleSearchDocs(args: { query: string; limit?: number }): Promise<CallToolResult> {
    const { query, limit = 5 } = args;

    try {
      // Get embedding for query
      const provider = await this.getEmbeddingProvider();
      const queryEmbedding = await provider.embed(query);

      // Search database
      const results = this.db.search(queryEmbedding, limit);

      if (results.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No relevant documentation found for your query.',
          }],
        };
      }

      // Format results
      const formattedResults = results.map((r, i) => this.formatSearchResult(r, i + 1));
      
      return {
        content: [{
          type: 'text',
          text: `Found ${results.length} relevant sections:\n\n${formattedResults.join('\n\n---\n\n')}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private formatSearchResult(result: SearchResult, index: number): string {
    const header = result.heading ? ` > ${result.heading}` : '';
    const location = `**[${index}] ${result.filePath}${header}** (lines ${result.lineStart}-${result.lineEnd})`;
    const score = `_Relevance: ${(result.score * 100).toFixed(1)}%_`;
    
    return `${location}\n${score}\n\n${result.content}`;
  }

  private async handleReadFile(args: { file_path: string }): Promise<CallToolResult> {
    const { file_path } = args;

    try {
      // Construct full path
      const fullPath = path.join(this.config.docsPath, file_path);

      // Security check: ensure file is within docs path
      const resolvedPath = path.resolve(fullPath);
      const resolvedDocsPath = path.resolve(this.config.docsPath);
      
      if (!resolvedPath.startsWith(resolvedDocsPath)) {
        return {
          content: [{
            type: 'text',
            text: `Access denied: File path must be within documentation directory`,
          }],
          isError: true,
        };
      }

      // Check if file exists
      if (!fs.existsSync(resolvedPath)) {
        return {
          content: [{
            type: 'text',
            text: `File not found: ${file_path}`,
          }],
          isError: true,
        };
      }

      // Read file
      const content = fs.readFileSync(resolvedPath, 'utf-8');

      return {
        content: [{
          type: 'text',
          text: `# ${file_path}\n\n${content}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private async handleListFiles(): Promise<CallToolResult> {
    try {
      const documents = this.db.getAllDocuments();
      
      if (documents.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No documentation files indexed.',
          }],
        };
      }

      const fileList = documents
        .map(d => `- ${d.filePath}${d.title ? ` (${d.title})` : ''}`)
        .join('\n');

      return {
        content: [{
          type: 'text',
          text: `Documentation files (${documents.length}):\n\n${fileList}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to list files: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  /**
   * Start server with STDIO transport (for CLI/process integration)
   */
  async startStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    // Handle shutdown
    process.on('SIGINT', async () => {
      await this.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await this.shutdown();
      process.exit(0);
    });
  }

  /**
   * Start server with HTTP transport (for remote access)
   * Note: Simplified implementation - in production use express + StreamableHTTPServerTransport
   */
  async startHttp(port: number): Promise<void> {
    // For now, just log that HTTP isn't fully implemented yet
    console.error('HTTP transport not fully implemented yet. Use stdio transport instead.');
    console.error(`Would start on port ${port}`);
    
    // Keep process alive
    await new Promise(() => {});
  }

  /**
   * Clean shutdown
   */
  async shutdown(): Promise<void> {
    this.db.close();
    await this.server.close();
  }
}
