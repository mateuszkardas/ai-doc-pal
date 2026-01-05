/**
 * Init Command
 * 
 * Initializes a new documentation index in the current directory.
 * Scans for .md and .mdx files, creates embeddings, and stores them.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as readline from 'node:readline/promises';
import chalk from 'chalk';
import ora from 'ora';
import { glob } from 'glob';

import { VectorDatabase } from '../db/vector-db.js';
import {
  createEmbeddingProvider,
  getModelDimension,
  DEFAULT_MODELS,
  chunkMarkdown,
  extractTitle,
  type ProviderType,
} from '../embeddings/index.js';
import {
  createBaseConfig,
  registerBase,
  getDbPath,
  baseExists,
  getApiKey,
  getEndpoint,
  loadConfig,
} from '../config/index.js';

interface InitOptions {
  name?: string;
  provider: ProviderType;
  model?: string;
  endpoint?: string;
  description?: string;
}

export async function initCommand(options: InitOptions): Promise<void> {
  const cwd = process.cwd();
  const dirName = path.basename(cwd);
  const baseName = options.name || dirName;

  console.log(chalk.blue(`\n📚 Initializing documentation index: ${chalk.bold(baseName)}\n`));

  // Check if base already exists
  if (baseExists(baseName)) {
    console.log(chalk.yellow(`⚠️  Base "${baseName}" already exists. Use 'ai-doc-pal update' to refresh.`));
    process.exit(1);
  }

  // Prompt for description if not provided
  let description = options.description;
  if (!description) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    description = await rl.question(
      chalk.cyan('📝 Description (helps AI understand what this documentation is about): ')
    );
    rl.close();

    if (!description?.trim()) {
      description = `Documentation for ${baseName}`;
      console.log(chalk.gray(`   Using default: "${description}"`));
    }
    console.log();
  }

  // Determine model
  const model = options.model || DEFAULT_MODELS[options.provider];
  const dimension = getModelDimension(model);

  console.log(chalk.gray(`  Provider: ${options.provider}`));
  console.log(chalk.gray(`  Model: ${model}`));
  console.log(chalk.gray(`  Embedding dimension: ${dimension}`));

  // Get API key/endpoint if needed
  const globalConfig = loadConfig();
  const apiKey = getApiKey(options.provider);
  const endpoint = options.endpoint || getEndpoint(options.provider);

  if (options.provider === 'openai' && !apiKey) {
    console.log(chalk.red('\n❌ OpenAI API key required. Set OPENAI_API_KEY environment variable.'));
    process.exit(1);
  }

  if (options.provider === 'compatible' && !endpoint) {
    console.log(chalk.red('\n❌ Compatible provider requires --endpoint option.'));
    process.exit(1);
  }

  // Check Ollama availability if using Ollama
  if (options.provider === 'ollama') {
    const spinner = ora('Checking Ollama availability...').start();
    
    const { checkOllamaAvailability } = await import('../embeddings/provider.js');
    const check = await checkOllamaAvailability(endpoint, model);
    
    if (!check.available) {
      spinner.fail('Ollama not available');
      console.log(chalk.red(`\n❌ ${check.error}\n`));
      
      if (check.models && check.models.length > 0) {
        console.log(chalk.yellow('💡 Available models:'));
        check.models.forEach(m => console.log(chalk.gray(`   - ${m}`)));
        console.log(chalk.yellow(`\n   Pull the model with: ollama pull ${model}\n`));
      } else {
        console.log(chalk.yellow('💡 To fix this:'));
        console.log(chalk.gray('   1. Install Ollama: https://ollama.ai'));
        console.log(chalk.gray(`   2. Pull the model: ollama pull ${model}`));
        console.log(chalk.gray('   3. Or use OpenAI: --provider openai\n'));
      }
      process.exit(1);
    }
    
    spinner.succeed('Ollama is ready');
  }

  // Create embedding provider
  const spinner = ora('Creating embedding provider...').start();
  
  let provider;
  try {
    provider = createEmbeddingProvider({
      type: options.provider,
      model,
      endpoint,
      apiKey,
    });
    spinner.succeed('Embedding provider ready');
  } catch (error) {
    spinner.fail(`Failed to create embedding provider: ${error}`);
    process.exit(1);
  }

  // Find markdown files
  spinner.start('Scanning for markdown files...');
  
  const files = await glob('**/*.{md,mdx}', {
    cwd,
    ignore: ['node_modules/**', '**/node_modules/**', '.git/**'],
    absolute: false,
  });

  if (files.length === 0) {
    spinner.fail('No markdown files found in current directory');
    process.exit(1);
  }

  spinner.succeed(`Found ${files.length} markdown files`);

  // Create database
  const dbPath = getDbPath(baseName);
  spinner.start('Creating vector database...');
  
  const db = new VectorDatabase(dbPath, dimension);
  
  // Store metadata
  db.setInfo('name', baseName);
  db.setInfo('provider', options.provider);
  db.setInfo('model', model);
  db.setInfo('embeddingDimension', dimension.toString());
  db.setInfo('docsPath', cwd);
  db.setInfo('createdAt', Date.now().toString());
  db.setInfo('lastUpdated', Date.now().toString());
  
  spinner.succeed('Vector database created');

  // Process files
  console.log(chalk.blue('\n📝 Processing documents...\n'));
  
  let totalChunks = 0;
  let processedFiles = 0;
  let errors = 0;

  for (const file of files) {
    const filePath = path.join(cwd, file);
    const fileSpinner = ora(`Processing ${file}...`).start();

    try {
      // Read file content
      const content = fs.readFileSync(filePath, 'utf-8');
      const stats = fs.statSync(filePath);
      const fileHash = crypto.createHash('md5').update(content).digest('hex');

      // Extract title
      const title = extractTitle(content, path.basename(file));

      // Upsert document
      const docId = db.upsertDocument({
        filePath: file,
        title,
        lastModified: stats.mtimeMs,
        fileHash,
      });

      // Chunk the document
      const chunks = chunkMarkdown(content);

      if (chunks.length === 0) {
        fileSpinner.warn(`${file}: No content to index`);
        continue;
      }

      // Generate embeddings for all chunks
      const texts = chunks.map(c => c.content);
      const embeddings = await provider.embedBatch(texts);

      // Store chunks with embeddings
      for (let i = 0; i < chunks.length; i++) {
        db.addChunk(
          {
            documentId: docId,
            content: chunks[i].content,
            chunkIndex: chunks[i].index,
            lineStart: chunks[i].lineStart,
            lineEnd: chunks[i].lineEnd,
            heading: chunks[i].heading ?? undefined,
          },
          embeddings[i]
        );
      }

      totalChunks += chunks.length;
      processedFiles++;
      fileSpinner.succeed(`${file}: ${chunks.length} chunks`);

    } catch (error) {
      errors++;
      fileSpinner.fail(`${file}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Register base in config
  const baseConfig = createBaseConfig({
    name: baseName,
    docsPath: cwd,
    provider: options.provider,
    model,
    embeddingDimension: dimension,
    endpoint,
    apiKey,
    description: description?.trim(),
  });
  registerBase(baseConfig);

  // Close database
  db.close();

  // Summary
  console.log(chalk.green('\n✅ Initialization complete!\n'));
  console.log(chalk.gray('  Summary:'));
  console.log(chalk.gray(`    • Files processed: ${processedFiles}`));
  console.log(chalk.gray(`    • Total chunks: ${totalChunks}`));
  if (errors > 0) {
    console.log(chalk.yellow(`    • Errors: ${errors}`));
  }
  console.log(chalk.gray(`    • Database: ${dbPath}`));

  console.log(chalk.blue('\n🚀 Start MCP server with:'));
  console.log(chalk.white(`   ai-doc-pal serve ${baseName}\n`));
}
