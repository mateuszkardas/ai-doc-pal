/**
 * ai-doc-pal - CLI for indexing markdown documentation with vector embeddings
 * 
 * This is the main entry point for the CLI application.
 */

export { VectorDatabase } from './db/vector-db.js';
export { EmbeddingProvider, createEmbeddingProvider } from './embeddings/provider.js';
export { McpDocServer } from './mcp/server.js';
export { Config, loadConfig, saveConfig } from './config/index.js';
