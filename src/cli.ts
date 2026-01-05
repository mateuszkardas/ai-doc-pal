#!/usr/bin/env -S node --disable-warning=ExperimentalWarning
/**
 * ai-doc-pal CLI
 * 
 * Commands:
 *   init    - Initialize a new documentation index in current directory
 *   update  - Update embeddings for changed files
 *   serve   - Start MCP server for a documentation index
 *   list    - List all indexed documentation bases
 *   config  - Manage global configuration
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init.js';
import { updateCommand } from './commands/update.js';
import { serveCommand } from './commands/serve.js';
import { listCommand } from './commands/list.js';
import { configCommand } from './commands/config.js';
import { removeCommand } from './commands/remove.js';
import { doctorCommand } from './commands/doctor.js';

const program = new Command();

program
  .name('ai-doc-pal')
  .description('Index your markdown documentation and expose it via MCP for AI agents')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize a new documentation index in current directory')
  .option('-n, --name <name>', 'Name for the documentation base (default: directory name)')
  .option('-p, --provider <provider>', 'Embedding provider: ollama, openai, compatible', 'ollama')
  .option('-m, --model <model>', 'Embedding model name')
  .option('-e, --endpoint <url>', 'API endpoint for compatible provider')
  .option('-d, --description <text>', 'Description of what this documentation is about')
  .action(initCommand);

program
  .command('update')
  .description('Update embeddings for changed files')
  .option('-f, --force', 'Force re-embedding of all files')
  .action(updateCommand);

program
  .command('serve <name>')
  .description('Start MCP server for a documentation index')
  .option('-t, --transport <type>', 'Transport type: stdio, http', 'stdio')
  .option('--port <port>', 'Port for HTTP transport', '3000')
  .action(serveCommand);

program
  .command('list')
  .description('List all indexed documentation bases')
  .action(listCommand);

program
  .command('config')
  .description('Manage global configuration')
  .option('--set <key=value>', 'Set a configuration value')
  .option('--get <key>', 'Get a configuration value')
  .option('--show', 'Show all configuration')
  .action(configCommand);

program
  .command('remove <name>')
  .description('Remove a documentation base')
  .action(removeCommand);

program
  .command('doctor')
  .description('Check system setup and diagnose issues')
  .action(doctorCommand);

program.parse();
