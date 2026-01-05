/**
 * Serve Command
 * 
 * Starts an MCP server for a documentation index.
 */

import chalk from 'chalk';
import {
  getDbPath,
  baseExists,
  getBaseConfig,
} from '../config/index.js';
import { McpDocServer } from '../mcp/server.js';

interface ServeOptions {
  transport: 'stdio' | 'http';
  port: string;
}

export async function serveCommand(name: string, options: ServeOptions): Promise<void> {
  // Check if base exists
  if (!baseExists(name)) {
    console.error(chalk.red(`\n❌ Documentation base "${name}" not found.`));
    console.error(chalk.gray('   Run "ai-doc-pal list" to see available bases.\n'));
    process.exit(1);
  }

  const baseConfig = getBaseConfig(name);
  if (!baseConfig) {
    console.error(chalk.red(`\n❌ Configuration for "${name}" not found.\n`));
    process.exit(1);
  }

  const dbPath = getDbPath(name);

  // For stdio transport, minimize console output (goes to stderr)
  if (options.transport === 'stdio') {
    console.error(chalk.blue(`🚀 Starting MCP server for "${name}"...`));
    console.error(chalk.gray(`   Database: ${dbPath}`));
    console.error(chalk.gray(`   Transport: stdio`));
    console.error(chalk.gray(`   Docs path: ${baseConfig.docsPath}\n`));
  } else {
    console.log(chalk.blue(`\n🚀 Starting MCP server for "${name}"\n`));
    console.log(chalk.gray(`   Database: ${dbPath}`));
    console.log(chalk.gray(`   Transport: ${options.transport}`));
    console.log(chalk.gray(`   Port: ${options.port}`));
    console.log(chalk.gray(`   Docs path: ${baseConfig.docsPath}\n`));
  }

  // Create and start MCP server
  const server = new McpDocServer({
    name,
    dbPath,
    docsPath: baseConfig.docsPath,
    embeddingDimension: baseConfig.embeddingDimension,
    provider: baseConfig.provider,
    model: baseConfig.model,
    description: baseConfig.description,
  });

  try {
    if (options.transport === 'stdio') {
      await server.startStdio();
    } else {
      const port = parseInt(options.port, 10);
      await server.startHttp(port);
    }
  } catch (error) {
    console.error(chalk.red(`\n❌ Failed to start server: ${error}\n`));
    process.exit(1);
  }
}
