const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const pdManagerClient = require('../utils/pdmanager-client');

async function execute(options) {
  try {
    const { path: componentPath, env = 'dev' } = options;
    
    if (!componentPath) {
      console.error(chalk.red('Error: Component path is required'));
      console.log(chalk.yellow('Example: pdcreator deploy --path ./components/my-component'));
      process.exit(1);
    }
    
    if (!fs.existsSync(componentPath)) {
      console.error(chalk.red(`Error: Path does not exist: ${componentPath}`));
      process.exit(1);
    }
    
    console.log(chalk.blue(`Deploying component to ${env} environment...`));
    
    // Call pdmanager to deploy the component
    try {
      await pdManagerClient.deployWorkflow(componentPath, env);
      console.log(chalk.green('Component deployed successfully!'));
      
      return { status: 'success' };
    } catch (error) {
      console.error(chalk.red('Error deploying component:'), error.message);
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red('Error during deployment:'), error.message);
    process.exit(1);
  }
}

module.exports = { execute };
