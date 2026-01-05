/**
 * List Command
 * 
 * Lists all indexed documentation bases.
 */

import chalk from 'chalk';
import { listBases, getDbPath } from '../config/index.js';
import { VectorDatabase } from '../db/vector-db.js';

export async function listCommand(): Promise<void> {
  const bases = listBases();

  if (bases.length === 0) {
    console.log(chalk.yellow('\n📭 No documentation bases found.\n'));
    console.log(chalk.gray('   Create one with: ai-doc-pal init\n'));
    return;
  }

  console.log(chalk.blue(`\n📚 Documentation bases (${bases.length}):\n`));

  for (const base of bases) {
    console.log(chalk.bold(`  ${base.name}`));
    console.log(chalk.gray(`    Path: ${base.docsPath}`));
    console.log(chalk.gray(`    Provider: ${base.provider} / ${base.model}`));
    console.log(chalk.gray(`    Created: ${new Date(base.createdAt).toLocaleDateString()}`));
    console.log(chalk.gray(`    Updated: ${new Date(base.lastUpdated).toLocaleDateString()}`));

    // Get stats from database
    try {
      const db = new VectorDatabase(getDbPath(base.name), base.embeddingDimension);
      const stats = db.getStats();
      console.log(chalk.gray(`    Documents: ${stats.documents}, Chunks: ${stats.chunks}`));
      db.close();
    } catch {
      console.log(chalk.gray(`    Stats: unavailable`));
    }

    console.log();
  }

  console.log(chalk.gray('  Start a server with: ai-doc-pal serve <name>\n'));
}
