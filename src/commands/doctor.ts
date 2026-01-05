/**
 * Doctor Command
 * 
 * Diagnoses system setup and checks if everything is ready.
 */

import chalk from 'chalk';
import ora from 'ora';
import { checkOllamaAvailability, DEFAULT_MODELS } from '../embeddings/provider.js';
import { getApiKey, getEndpoint } from '../config/index.js';

export async function doctorCommand(): Promise<void> {
  console.log(chalk.blue('\n🏥 ai-doc-pal Doctor\n'));
  console.log(chalk.gray('Checking system setup...\n'));

  let allGood = true;

  // Check Ollama
  console.log(chalk.bold('Ollama (local embeddings):'));
  const ollamaSpinner = ora('Checking Ollama...').start();
  
  const ollamaCheck = await checkOllamaAvailability();
  
  if (ollamaCheck.available) {
    ollamaSpinner.succeed('Ollama is running');
    console.log(chalk.gray(`   Endpoint: http://localhost:11434`));
    
    if (ollamaCheck.models && ollamaCheck.models.length > 0) {
      console.log(chalk.gray(`   Models: ${ollamaCheck.models.join(', ')}`));
      
      // Check for recommended model
      const recommendedModel = DEFAULT_MODELS.ollama;
      const hasRecommended = ollamaCheck.models.some(name => 
        name === recommendedModel || name.startsWith(`${recommendedModel}:`)
      );
      
      if (hasRecommended) {
        console.log(chalk.green(`   ✓ Recommended model "${recommendedModel}" is available`));
      } else {
        console.log(chalk.yellow(`   ⚠ Recommended model "${recommendedModel}" not found`));
        console.log(chalk.gray(`     Install with: ollama pull ${recommendedModel}`));
        allGood = false;
      }
    }
  } else {
    ollamaSpinner.fail('Ollama not available');
    console.log(chalk.red(`   ${ollamaCheck.error}`));
    console.log(chalk.gray('   Install: https://ollama.ai'));
    allGood = false;
  }

  console.log();

  // Check OpenAI
  console.log(chalk.bold('OpenAI (cloud embeddings):'));
  const openaiKey = getApiKey('openai');
  
  if (openaiKey) {
    console.log(chalk.green('   ✓ API key found'));
    console.log(chalk.gray(`   Key: ${openaiKey.substring(0, 7)}...`));
  } else {
    console.log(chalk.yellow('   ⚠ No API key found'));
    console.log(chalk.gray('     Set with: export OPENAI_API_KEY=sk-...'));
  }

  console.log();

  // Summary
  console.log(chalk.bold('Summary:'));
  if (allGood) {
    console.log(chalk.green('   ✓ Everything looks good!'));
    console.log(chalk.gray('   You can use: ai-doc-pal init'));
  } else {
    console.log(chalk.yellow('   ⚠ Some issues found'));
    console.log(chalk.gray('   Fix the issues above or use an alternative provider'));
    console.log(chalk.gray('   Example: ai-doc-pal init --provider openai'));
  }

  console.log();
}
