/**
 * Configuration Module
 * 
 * Handles global and per-base configuration.
 * Config location: ~/.ai-doc-pal/config.json
 * Bases location: ~/.ai-doc-pal/<name>/db.sqlite
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ProviderType } from '../embeddings/provider.js';

// Base directory for all ai-doc-pal data
export const APP_DIR = path.join(os.homedir(), '.ai-doc-pal');
export const CONFIG_FILE = path.join(APP_DIR, 'config.json');

export interface GlobalConfig {
  defaultProvider: ProviderType;
  defaultModel?: string;
  openaiApiKey?: string;
  ollamaEndpoint?: string;
}

export interface BaseConfig {
  name: string;
  docsPath: string;
  provider: ProviderType;
  model: string;
  endpoint?: string;
  apiKey?: string;
  embeddingDimension: number;
  description?: string;
  createdAt: number;
  lastUpdated: number;
}

export interface Config {
  global: GlobalConfig;
  bases: Record<string, BaseConfig>;
}

const DEFAULT_CONFIG: Config = {
  global: {
    defaultProvider: 'ollama',
    ollamaEndpoint: 'http://localhost:11434',
  },
  bases: {},
};

/**
 * Ensure app directory exists
 */
export function ensureAppDir(): void {
  if (!fs.existsSync(APP_DIR)) {
    fs.mkdirSync(APP_DIR, { recursive: true });
  }
}

/**
 * Load configuration from disk
 */
export function loadConfig(): Config {
  ensureAppDir();

  if (!fs.existsSync(CONFIG_FILE)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(content) as Partial<Config>;
    return {
      global: { ...DEFAULT_CONFIG.global, ...config.global },
      bases: config.bases || {},
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save configuration to disk
 */
export function saveConfig(config: Config): void {
  ensureAppDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Get path to a base's directory
 */
export function getBasePath(name: string): string {
  return path.join(APP_DIR, name);
}

/**
 * Get path to a base's database file
 */
export function getDbPath(name: string): string {
  return path.join(getBasePath(name), 'db.sqlite');
}

/**
 * Check if a base exists
 */
export function baseExists(name: string): boolean {
  return fs.existsSync(getDbPath(name));
}

/**
 * Create a new base configuration
 */
export function createBaseConfig(options: {
  name: string;
  docsPath: string;
  provider: ProviderType;
  model: string;
  embeddingDimension: number;
  endpoint?: string;
  apiKey?: string;
  description?: string;
}): BaseConfig {
  const now = Date.now();
  return {
    name: options.name,
    docsPath: path.resolve(options.docsPath),
    provider: options.provider,
    model: options.model,
    embeddingDimension: options.embeddingDimension,
    endpoint: options.endpoint,
    apiKey: options.apiKey,
    description: options.description,
    createdAt: now,
    lastUpdated: now,
  };
}

/**
 * Register a base in config
 */
export function registerBase(baseConfig: BaseConfig): void {
  const config = loadConfig();
  config.bases[baseConfig.name] = baseConfig;
  saveConfig(config);
}

/**
 * Get a base configuration
 */
export function getBaseConfig(name: string): BaseConfig | null {
  const config = loadConfig();
  return config.bases[name] || null;
}

/**
 * List all registered bases
 */
export function listBases(): BaseConfig[] {
  const config = loadConfig();
  return Object.values(config.bases);
}

/**
 * Update base's lastUpdated timestamp
 */
export function touchBase(name: string): void {
  const config = loadConfig();
  if (config.bases[name]) {
    config.bases[name].lastUpdated = Date.now();
    saveConfig(config);
  }
}

/**
 * Delete a base
 */
export function deleteBase(name: string): void {
  const config = loadConfig();
  delete config.bases[name];
  saveConfig(config);

  // Also delete the database directory
  const basePath = getBasePath(name);
  if (fs.existsSync(basePath)) {
    fs.rmSync(basePath, { recursive: true });
  }
}

/**
 * Get API key from config or environment
 */
export function getApiKey(provider: ProviderType, baseConfig?: BaseConfig): string | undefined {
  // Priority: base config > environment > global config
  if (baseConfig?.apiKey) {
    return baseConfig.apiKey;
  }

  if (provider === 'openai') {
    if (process.env.OPENAI_API_KEY) {
      return process.env.OPENAI_API_KEY;
    }
    const config = loadConfig();
    return config.global.openaiApiKey;
  }

  return undefined;
}

/**
 * Get endpoint from config or default
 */
export function getEndpoint(provider: ProviderType, baseConfig?: BaseConfig): string | undefined {
  if (baseConfig?.endpoint) {
    return baseConfig.endpoint;
  }

  if (provider === 'ollama') {
    const config = loadConfig();
    return config.global.ollamaEndpoint || 'http://localhost:11434';
  }

  return undefined;
}
