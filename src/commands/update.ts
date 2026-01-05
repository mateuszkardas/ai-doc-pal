/**
 * Update Command
 * 
 * Updates embeddings for changed files in an existing index.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import chalk from 'chalk';
import ora from 'ora';
import { glob } from 'glob';

import { VectorDatabase } from '../db/vector-db.js';
import {
  createEmbeddingProvider,
  chunkMarkdown,
  extractTitle,
} from '../embeddings/index.js';
import {
  getDbPath,
  baseExists,
  getBaseConfig,
  getApiKey,
  getEndpoint,
  touchBase,
  listBases,
} from '../config/index.js';

interface UpdateOptions {
  force?: boolean;
}

export async function updateCommand(options: UpdateOptions): Promise<void> {
  const cwd = process.cwd();
  
  // Find which base corresponds to this directory
  const bases = listBases();
  const baseConfig = bases.find(b => b.docsPath === cwd);

  if (!baseConfig) {
    console.log(chalk.red('\n❌ No index found for current directory.'));
    console.log(chalk.gray('   Run "ai-doc-pal init" first to create an index.\n'));
    process.exit(1);
  }

  const baseName = baseConfig.name;
  console.log(chalk.blue(`\n🔄 Updating documentation index: ${chalk.bold(baseName)}\n`));

  if (options.force) {
    console.log(chalk.yellow('   Force mode: re-embedding all files\n'));
  }

  // Open database
  const dbPath = getDbPath(baseName);
  const db = new VectorDatabase(dbPath, baseConfig.embeddingDimension);

  // Create embedding provider
  const spinner = ora('Creating embedding provider...').start();
  
  const apiKey = getApiKey(baseConfig.provider, baseConfig);
  const endpoint = getEndpoint(baseConfig.provider, baseConfig);
  
  let provider;
  try {
    provider = createEmbeddingProvider({
      type: baseConfig.provider,
      model: baseConfig.model,
      endpoint,
      apiKey,
    });
    spinner.succeed('Embedding provider ready');
  } catch (error) {
    spinner.fail(`Failed to create embedding provider: ${error}`);
    db.close();
    process.exit(1);
  }

  // Find current markdown files
  spinner.start('Scanning for markdown files...');
  
  const files = await glob('**/*.{md,mdx}', {
    cwd,
    ignore: ['node_modules/**', '**/node_modules/**', '.git/**'],
    absolute: false,
  });

  spinner.succeed(`Found ${files.length} markdown files`);

  // Get existing documents
  const existingDocs = db.getAllDocuments();
  const existingPaths = new Set(existingDocs.map(d => d.filePath));
  const currentPaths = new Set(files);

  // Find documents to delete (no longer exist)
  const toDelete = existingDocs.filter(d => !currentPaths.has(d.filePath));
  
  // Process files
  console.log(chalk.blue('\n📝 Processing changes...\n'));
  
  let added = 0;
  let updated = 0;
  let deleted = 0;
  let skipped = 0;
  let errors = 0;

  // Delete removed documents
  for (const doc of toDelete) {
    const deleteSpinner = ora(`Removing ${doc.filePath}...`).start();
    try {
      db.deleteDocumentChunks(doc.id);
      // Note: Document itself will be orphaned but not deleted
      // We could add a delete method to VectorDatabase
      deleted++;
      deleteSpinner.succeed(`Removed ${doc.filePath}`);
    } catch (error) {
      deleteSpinner.fail(`Failed to remove ${doc.filePath}`);
      errors++;
    }
  }

  // Process current files
  for (const file of files) {
    const filePath = path.join(cwd, file);
    
    try {
      // Read file and compute hash
      const content = fs.readFileSync(filePath, 'utf-8');
      const stats = fs.statSync(filePath);
      const fileHash = crypto.createHash('md5').update(content).digest('hex');

      // Check if needs update
      const needsUpdate = options.force || db.documentNeedsUpdate(file, fileHash);

      if (!needsUpdate) {
        skipped++;
        continue;
      }

      const fileSpinner = ora(`Processing ${file}...`).start();

      // Get or create document
      const existingDoc = db.getDocumentByPath(file);
      const title = extractTitle(content, path.basename(file));

      // If updating, delete old chunks first
      if (existingDoc) {
        db.deleteDocumentChunks(existingDoc.id);
        updated++;
      } else {
        added++;
      }

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

      // Generate embeddings
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

      fileSpinner.succeed(`${file}: ${chunks.length} chunks`);

    } catch (error) {
      errors++;
      console.log(chalk.red(`   ❌ ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  // Update timestamp
  touchBase(baseName);
  db.setInfo('lastUpdated', Date.now().toString());

  // Close database
  db.close();

  // Summary
  console.log(chalk.green('\n✅ Update complete!\n'));
  console.log(chalk.gray('  Summary:'));
  console.log(chalk.gray(`    • Added: ${added}`));
  console.log(chalk.gray(`    • Updated: ${updated}`));
  console.log(chalk.gray(`    • Deleted: ${deleted}`));
  console.log(chalk.gray(`    • Skipped (unchanged): ${skipped}`));
  if (errors > 0) {
    console.log(chalk.yellow(`    • Errors: ${errors}`));
  }
  console.log();
}
