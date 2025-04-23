#!/usr/bin/env node

require('dotenv').config();
const { program } = require('commander');
const brainstorm = require('./commands/brainstorm');
const scaffold = require('./commands/scaffold');
const research = require('./commands/research');
const develop = require('./commands/develop');
const test = require('./commands/test');
const build = require('./commands/build');
const deploy = require('./commands/deploy');

program
  .version('0.1.0')
  .description('Pipedream Component Creator - Create, test, and deploy Pipedream components');

program
  .command('brainstorm [description]')
  .description('Generate workflow ideas with Claude AI')
  .option('-o, --output <path>', 'Output file path')
  .action(brainstorm.execute);

program
  .command('scaffold')
  .description('Generate component templates')
  .option('-t, --type <type>', 'Component type (source or action)', 'source')
  .option('-n, --name <name>', 'Component name')
  .option('-d, --description <description>', 'Component description')
  .option('-a, --app <app>', 'App name (e.g., github, slack)')
  .option('-f, --from-brainstorm <id>', 'Use output from brainstorm command')
  .action(scaffold.execute);

program
  .command('research')
  .description('Research Pipedream apps and suggest integrations')
  .option('-q, --query <query>', 'Search query')
  .option('-a, --app <app>', 'Specific app to research')
  .option('--action <action>', 'Specific action to research')
  .action(research.execute);

program
  .command('develop')
  .description('Local development environment for components')
  .option('-p, --path <path>', 'Path to component directory')
  .option('--preview', 'Enable live preview')
  .action(develop.execute);

program
  .command('test')
  .description('Test component functionality')
  .option('-p, --path <path>', 'Path to component directory')
  .option('-m, --method <method>', 'Test specific method')
  .option('-c, --coverage', 'Generate test coverage')
  .option('-w, --watch', 'Watch mode')
  .action(test.execute);

program
  .command('build')
  .description('Build/package components')
  .option('-p, --path <path>', 'Path to component directory')
  .option('-o, --output <path>', 'Output directory')
  .action(build.execute);

program
  .command('deploy')
  .description('Deploy components to Pipedream (via pdmanager)')
  .option('-p, --path <path>', 'Path to component directory')
  .option('-e, --env <env>', 'Environment (dev, prod)')
  .action(deploy.execute);

program.parse(process.argv);

// Show help if no arguments provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}