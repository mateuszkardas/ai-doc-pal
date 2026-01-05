/**
 * Remove Command
 * 
 * Removes a documentation base.
 */

import * as fs from 'node:fs';
import chalk from 'chalk';
import {
  loadConfig,
  saveConfig,
  getDbPath,
  baseExists,
} from '../config/index.js';

export async function removeCommand(name: string): Promise<void> {
  // Check if base exists
  if (!baseExists(name)) {
    console.error(chalk.red(`\n❌ Documentation base "${name}" not found.`));
    console.error(chalk.gray('   Run "ai-doc-pal list" to see available bases.\n'));
    process.exit(1);
  }

  const dbPath = getDbPath(name);

  console.log(chalk.yellow(`\n⚠️  Are you sure you want to remove "${name}"?`));
  console.log(chalk.gray(`   Database: ${dbPath}`));
  console.log(chalk.gray('   This action cannot be undone.\n'));

  // Remove from config
  const config = loadConfig();
  delete config.bases[name];
  saveConfig(config);

  // Remove database directory
  const dbDir = dbPath.replace('/db.sqlite', '');
  if (fs.existsSync(dbDir)) {
    fs.rmSync(dbDir, { recursive: true, force: true });
  }

  console.log(chalk.green(`✅ Removed "${name}"\n`));
}
