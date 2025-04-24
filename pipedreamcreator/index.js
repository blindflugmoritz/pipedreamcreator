#!/usr/bin/env node

const { program } = require('commander');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

// Import commands
const brainstorm = require('./commands/brainstorm');
const develop = require('./commands/develop');
const test = require('./commands/test');
const config = require('./commands/config');

// Ensure config directory exists
const configDir = path.join(require('os').homedir(), '.pdcreator');
fs.ensureDirSync(configDir);
fs.ensureDirSync(path.join(configDir, 'templates'));

// Set up CLI
program
  .name('pdcreator')
  .description('Pipedream Component Creator - AI-assisted workflow generation')
  .version('1.0.0');

// Config command
program
  .command('config')
  .description('Manage pdcreator configuration and credentials')
  .addCommand(
    program.createCommand('setup')
      .description('Interactive setup of all credentials')
      .action(config.setup)
  )
  .addCommand(
    program.createCommand('list')
      .description('List current configuration')
      .action(config.list)
  )
  .addCommand(
    program.createCommand('set')
      .description('Set a configuration value')
      .argument('<key>', 'Configuration key (e.g., claude.api_key)')
      .argument('<value>', 'Configuration value')
      .action(config.set)
  )
  .addCommand(
    program.createCommand('get')
      .description('Get a configuration value')
      .argument('<key>', 'Configuration key (e.g., claude.api_key)')
      .action(config.get)
  );

// Brainstorm command
program
  .command('brainstorm')
  .description('Generate workflow ideas with Claude AI')
  .argument('<description>', 'Description of the workflow you want to create')
  .option('-o, --output <file>', 'Output file for the brainstorming results')
  .action(brainstorm);

// Develop command
program
  .command('develop')
  .description('Generate code for workflows or components')
  .requiredOption('-w, --workflow <path>', 'Path to the workflow directory')
  .option('-s, --step <name>', 'Generate code for a specific step')
  .option('--prompt <text>', 'Additional prompt for better specification')
  .action(develop);

// Test command
program
  .command('test')
  .description('Test a component or workflow')
  .requiredOption('-p, --path <path>', 'Path to the component or workflow directory')
  .option('-w, --watch', 'Watch for changes and re-run tests', false)
  .action(test);

// Error handling
program.showHelpAfterError('(add --help for additional information)');

// Display ASCII art banner
const displayBanner = () => {
  console.log(chalk.cyan(`
   _____  _____    _____                _             
  |  __ \\|  __ \\  / ____|              | |            
  | |__) | |  | || |     _ __ ___  __ _| |_ ___  _ __ 
  |  ___/| |  | || |    | '__/ _ \\/ _\` | __/ _ \\| '__|
  | |    | |__| || |____| | |  __/ (_| | || (_) | |   
  |_|    |_____/ \\_____|_|  \\___|\\__,_|\\__\\___/|_|   
                                                      
  ${chalk.yellow('Pipedream Component Creator')} - AI-assisted workflow builder
  `));
};

// Process command line arguments
const run = () => {
  displayBanner();
  program.parse(process.argv);
};

// Run the program
run();