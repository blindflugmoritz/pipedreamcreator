const chalk = require('chalk');
const ora = require('ora');
const aiClient = require('../utils/ai-client');

async function execute(options) {
  try {
    const { query, app, action } = options;
    
    if (!query && !app) {
      console.error(chalk.red('Error: You must specify either a query or an app name.'));
      console.log(chalk.yellow('Example: pdcreator research --query "CRM integration" or pdcreator research --app "github"'));
      process.exit(1);
    }
    
    const spinner = ora('Researching Pipedream apps...').start();
    
    const result = await aiClient.researchApp(query, app, action);
    
    spinner.succeed('Research complete!');
    
    console.log(chalk.cyan('\n=== Research Results ===\n'));
    console.log(result);
    
    return { result };
  } catch (error) {
    console.error(chalk.red('Error during research:'), error.message);
    process.exit(1);
  }
}

module.exports = { execute };
