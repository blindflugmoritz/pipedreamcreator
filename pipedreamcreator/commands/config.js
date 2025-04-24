const chalk = require('chalk');
const inquirer = require('inquirer');
const configManager = require('../utils/config-manager');

// Interactive setup of all credentials
const setup = async () => {
  console.log(chalk.cyan('🔧 Setting up pdcreator configuration...\n'));
  
  const credentials = [
    {
      name: 'claude.api_key',
      message: 'Claude API Key:',
      type: 'password',
      validate: input => input.length > 0 ? true : 'API key is required'
    },
    {
      name: 'github.token',
      message: 'GitHub API Token:',
      type: 'password',
      validate: input => input.length > 0 ? true : 'GitHub token is required'
    },
    {
      name: 'pipedream.api_key',
      message: 'Pipedream API Key:',
      type: 'password',
      validate: input => input.startsWith('pd_') ? true : 'Pipedream API keys typically start with "pd_"'
    },
    {
      name: 'pipedream.username',
      message: 'Pipedream Username:',
      validate: input => /^.+@.+\..+$/.test(input) ? true : 'Please enter a valid email address'
    },
    {
      name: 'pipedream.password',
      message: 'Pipedream Password:',
      type: 'password',
      validate: input => input.length > 0 ? true : 'Password is required'
    }
  ];
  
  // Get current values
  const currentValues = {};
  credentials.forEach(cred => {
    const value = configManager.get(cred.name);
    if (value) {
      currentValues[cred.name] = value;
    }
  });
  
  // Ask for credentials
  for (const cred of credentials) {
    const { value } = await inquirer.prompt([
      {
        type: cred.type || 'input',
        name: 'value',
        message: cred.message,
        default: currentValues[cred.name] || '',
        validate: cred.validate
      }
    ]);
    
    if (value) {
      configManager.set(cred.name, value);
    }
  }
  
  console.log(chalk.green('\n🔐 Credentials stored securely in ~/.pdcreator/config.json'));
  console.log(chalk.green('✅ Configuration complete! pdcreator is ready to use'));
};

// List all configuration values
const list = () => {
  const config = configManager.list();
  console.log(chalk.cyan('Current pdcreator configuration:'));
  console.log(JSON.stringify(config, null, 2));
};

// Get a specific configuration value
const get = (key) => {
  const value = configManager.get(key);
  
  if (value === null) {
    console.log(chalk.yellow(`Configuration key '${key}' not found`));
    return;
  }
  
  // Check if it's a sensitive value
  const shouldHide = configManager._shouldEncrypt(key);
  
  if (shouldHide) {
    console.log(`${key}: ********`);
  } else if (typeof value === 'object') {
    console.log(`${key}:`, JSON.stringify(value, null, 2));
  } else {
    console.log(`${key}: ${value}`);
  }
};

// Set a configuration value
const set = (key, value) => {
  configManager.set(key, value);
  console.log(chalk.green(`Configuration key '${key}' has been set`));
};

module.exports = {
  setup,
  list,
  get,
  set
};