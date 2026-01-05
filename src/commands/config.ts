/**
 * Config Command
 * 
 * Manages global configuration.
 */

import chalk from 'chalk';
import { loadConfig, saveConfig, CONFIG_FILE } from '../config/index.js';

interface ConfigOptions {
  set?: string;
  get?: string;
  show?: boolean;
}

export async function configCommand(options: ConfigOptions): Promise<void> {
  const config = loadConfig();

  if (options.show || (!options.set && !options.get)) {
    // Show all configuration
    console.log(chalk.blue('\n⚙️  Configuration\n'));
    console.log(chalk.gray(`  File: ${CONFIG_FILE}\n`));
    
    console.log(chalk.bold('  Global settings:'));
    console.log(chalk.gray(`    defaultProvider: ${config.global.defaultProvider}`));
    console.log(chalk.gray(`    defaultModel: ${config.global.defaultModel || '(not set)'}`));
    console.log(chalk.gray(`    ollamaEndpoint: ${config.global.ollamaEndpoint || '(not set)'}`));
    console.log(chalk.gray(`    openaiApiKey: ${config.global.openaiApiKey ? '***' : '(not set)'}`));
    
    console.log(chalk.bold('\n  Registered bases:'));
    const baseNames = Object.keys(config.bases);
    if (baseNames.length === 0) {
      console.log(chalk.gray('    (none)'));
    } else {
      for (const name of baseNames) {
        console.log(chalk.gray(`    - ${name}`));
      }
    }
    
    console.log();
    return;
  }

  if (options.get) {
    // Get a specific value
    const key = options.get as keyof typeof config.global;
    const value = config.global[key];
    
    if (value === undefined) {
      console.log(chalk.yellow(`\n  ${key}: (not set)\n`));
    } else if (key === 'openaiApiKey' && value) {
      console.log(chalk.gray(`\n  ${key}: ***\n`));
    } else {
      console.log(chalk.gray(`\n  ${key}: ${value}\n`));
    }
    return;
  }

  if (options.set) {
    // Set a value
    const [key, ...valueParts] = options.set.split('=');
    const value = valueParts.join('=');

    if (!key || !value) {
      console.log(chalk.red('\n❌ Invalid format. Use: --set key=value or --set base.key=value\n'));
      process.exit(1);
    }

    // Check if it's a base-specific setting (e.g., kaplay.description)
    if (key.includes('.')) {
      const [baseName, baseKey] = key.split('.');
      
      if (!config.bases[baseName]) {
        console.log(chalk.red(`\n❌ Base not found: ${baseName}`));
        console.log(chalk.gray('   Run "ai-doc-pal list" to see available bases.\n'));
        process.exit(1);
      }

      const validBaseKeys = ['description', 'model', 'endpoint'];
      if (!validBaseKeys.includes(baseKey)) {
        console.log(chalk.red(`\n❌ Unknown base key: ${baseKey}`));
        console.log(chalk.gray(`   Valid keys: ${validBaseKeys.join(', ')}\n`));
        process.exit(1);
      }

      // Update base config
      (config.bases[baseName] as any)[baseKey] = value;
      config.bases[baseName].lastUpdated = Date.now();
      saveConfig(config);
      
      console.log(chalk.green(`\n✅ Updated ${baseName}.${baseKey} = ${value}\n`));
      return;
    }

    // Global setting
    const validKeys = ['defaultProvider', 'defaultModel', 'ollamaEndpoint', 'openaiApiKey'];
    if (!validKeys.includes(key)) {
      console.log(chalk.red(`\n❌ Unknown key: ${key}`));
      console.log(chalk.gray(`   Valid keys: ${validKeys.join(', ')}\n`));
      console.log(chalk.gray(`   For base settings, use: base.key=value (e.g., kaplay.description="...")\n`));
      process.exit(1);
    }

    // Validate provider
    if (key === 'defaultProvider' && !['ollama', 'openai', 'compatible'].includes(value)) {
      console.log(chalk.red(`\n❌ Invalid provider: ${value}`));
      console.log(chalk.gray('   Valid providers: ollama, openai, compatible\n'));
      process.exit(1);
    }

    // Update config
    (config.global as unknown as Record<string, string>)[key] = value;
    saveConfig(config);

    const displayValue = key === 'openaiApiKey' ? '***' : value;
    console.log(chalk.green(`\n✅ Set ${key} = ${displayValue}\n`));
  }
}
