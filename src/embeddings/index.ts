export { 
  createEmbeddingProvider, 
  getModelDimension,
  DEFAULT_MODELS,
} from './provider.js';

export type { 
  EmbeddingProvider, 
  EmbeddingProviderConfig,
  ProviderType,
} from './provider.js';

export {
  chunkMarkdown,
  extractTitle,
  stripMdxComponents,
} from './chunker.js';

export type {
  Chunk,
  ChunkingOptions,
} from './chunker.js';
