/**
 * Embedding Provider Module
 * 
 * Supports: Ollama (local), OpenAI (cloud), Compatible (any OpenAI-compatible endpoint)
 */

export type ProviderType = 'ollama' | 'openai' | 'compatible';

export interface EmbeddingProviderConfig {
  type: ProviderType;
  model: string;
  endpoint?: string;
  apiKey?: string;
}

export interface EmbeddingProvider {
  readonly type: ProviderType;
  readonly model: string;
  readonly dimension: number;
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

const MODEL_DIMENSIONS: Record<string, number> = {
  'nomic-embed-text': 768,
  'mxbai-embed-large': 1024,
  'all-minilm': 384,
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
};

export const DEFAULT_MODELS: Record<ProviderType, string> = {
  ollama: 'nomic-embed-text',
  openai: 'text-embedding-3-small',
  compatible: 'text-embedding-3-small',
};

class OllamaProvider implements EmbeddingProvider {
  readonly type = 'ollama' as const;
  readonly model: string;
  readonly dimension: number;
  private endpoint: string;

  constructor(model: string, endpoint: string = 'http://localhost:11434') {
    this.model = model;
    this.endpoint = endpoint;
    this.dimension = MODEL_DIMENSIONS[model] || 768;
  }

  async embed(text: string): Promise<Float32Array> {
    const response = await fetch(`${this.endpoint}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt: text }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama embedding failed: ${error}`);
    }

    const data = await response.json() as { embedding: number[] };
    return new Float32Array(data.embedding);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const results: Float32Array[] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }
}

class OpenAIProvider implements EmbeddingProvider {
  readonly type = 'openai' as const;
  readonly model: string;
  readonly dimension: number;
  private apiKey: string;
  private endpoint: string;

  constructor(model: string, apiKey: string, endpoint: string = 'https://api.openai.com/v1') {
    this.model = model;
    this.apiKey = apiKey;
    this.endpoint = endpoint;
    this.dimension = MODEL_DIMENSIONS[model] || 1536;
  }

  async embed(text: string): Promise<Float32Array> {
    return (await this.embedBatch([text]))[0];
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const response = await fetch(`${this.endpoint}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI embedding failed: ${await response.text()}`);
    }

    const data = await response.json() as { data: Array<{ embedding: number[]; index: number }> };
    return data.data.sort((a, b) => a.index - b.index).map(item => new Float32Array(item.embedding));
  }
}

class CompatibleProvider implements EmbeddingProvider {
  readonly type = 'compatible' as const;
  readonly model: string;
  readonly dimension: number;
  private apiKey: string;
  private endpoint: string;

  constructor(model: string, endpoint: string, apiKey: string = '') {
    this.model = model;
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.dimension = MODEL_DIMENSIONS[model] || 768;
  }

  async embed(text: string): Promise<Float32Array> {
    return (await this.embedBatch([text]))[0];
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    const response = await fetch(`${this.endpoint}/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: this.model, input: texts }),
    });

    if (!response.ok) {
      throw new Error(`Embedding failed: ${await response.text()}`);
    }

    const data = await response.json() as { data: Array<{ embedding: number[]; index: number }> };
    return data.data.sort((a, b) => a.index - b.index).map(item => new Float32Array(item.embedding));
  }
}

export function createEmbeddingProvider(config: EmbeddingProviderConfig): EmbeddingProvider {
  switch (config.type) {
    case 'ollama':
      return new OllamaProvider(config.model || 'nomic-embed-text', config.endpoint || 'http://localhost:11434');
    case 'openai':
      if (!config.apiKey) throw new Error('OpenAI provider requires an API key');
      return new OpenAIProvider(config.model || 'text-embedding-3-small', config.apiKey, config.endpoint);
    case 'compatible':
      if (!config.endpoint) throw new Error('Compatible provider requires an endpoint');
      return new CompatibleProvider(config.model, config.endpoint, config.apiKey);
    default:
      throw new Error(`Unknown provider type: ${config.type}`);
  }
}

export function getModelDimension(model: string): number {
  return MODEL_DIMENSIONS[model] || 768;
}

export async function checkOllamaAvailability(
  endpoint: string = 'http://localhost:11434',
  model?: string
): Promise<{ available: boolean; models?: string[]; error?: string }> {
  try {
    const response = await fetch(`${endpoint}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return { available: false, error: `Ollama responded with ${response.status}` };
    }

    const data = await response.json() as { models: Array<{ name: string }> };
    const modelNames = data.models.map(m => m.name);

    if (model) {
      const found = modelNames.some(name => name === model || name.startsWith(`${model}:`));
      if (!found) {
        return { available: false, models: modelNames, error: `Model "${model}" not found` };
      }
    }

    return { available: true, models: modelNames };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { available: false, error: `Cannot connect to Ollama: ${msg}` };
  }
}
