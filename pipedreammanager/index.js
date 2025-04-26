#!/usr/bin/env node

const { program } = require('commander');
const { open } = require('./commands/open');
const { newProject } = require('./commands/new-project');
const { login } = require('./commands/login');
const { createWorkflow } = require('./commands/create-workflow');
const { listTriggers } = require('./commands/list-triggers');
const { listSteps } = require('./commands/list-steps');
const { listWorkflows } = require('./commands/list-workflows');
const { download } = require('./commands/download');

program
  .version('1.0.0')
  .description('CLI tool for managing Pipedream workflows');

program
  .command('open')
  .description('Open a Pipedream project in the browser')
  .option('-k, --apiKey <apiKey>', 'Pipedream API key')
  .option('-p, --project <id>', 'Project ID to open')
  .option('-u, --username <username>', 'Pipedream username/email (fallback if API key fails)')
  .option('-w, --password <password>', 'Pipedream password (fallback if API key fails)')
  .action(open);

program
  .command('new-project')
  .description('Create a new Pipedream project')
  .option('-n, --name <n>', 'Project name')
  .option('-u, --username <username>', 'Pipedream username/email')
  .option('-p, --password <password>', 'Pipedream password')
  .option('-k, --apiKey <key>', 'Pipedream API key (optional)')
  .option('--path <path>', 'Project directory path (default: current directory)')
  .option('--non-interactive', 'Skip all interactive prompts')
  .action(newProject);

program
  .command('login')
  .description('Login to Pipedream (for testing credentials)')
  .option('-u, --username <username>', 'Pipedream username/email')
  .option('-p, --password <password>', 'Pipedream password')
  .action(login);

program
  .command('create-workflow')
  .description('Create a new workflow in a Pipedream project')
  .option('-p, --project <id>', 'Project ID (optional if in project directory)')
  .option('-n, --name <n>', 'Workflow name')
  .option('-t, --template <id>', 'Template ID to use (optional)')
  .option('-d, --description <desc>', 'Workflow description (optional)')
  .option('-k, --apiKey <key>', 'Pipedream API key (optional if in .env)')
  .option('--trigger <type>', 'Trigger type (http, schedule, etc.)')
  .option('--trigger-path <path>', 'Custom path for HTTP trigger (optional)')
  .option('--schedule <cron>', 'Cron expression for schedule trigger (optional)')
  .action(createWorkflow);
  
program
  .command('list-triggers')
  .description('List all triggers for a workflow')
  .option('-w, --workflow <id>', 'Workflow ID')
  .option('-p, --project <id>', 'Project ID (to list all workflows)')
  .option('-k, --apiKey <key>', 'Pipedream API key (optional if in .env)')
  .action(listTriggers);

program
  .command('list-steps')
  .description('List all steps in a workflow')
  .option('-w, --workflow <id>', 'Workflow ID')
  .option('-p, --project <id>', 'Project ID (to list all workflows)')
  .option('-k, --apiKey <key>', 'Pipedream API key (optional if in .env)')
  .option('-d, --detailed', 'Show detailed component information')
  .action(listSteps);

program
  .command('list-workflows')
  .description('List all workflows in a project')
  .option('-p, --project <id>', 'Project ID (optional if in project directory)')
  .option('-k, --apiKey <key>', 'Pipedream API key (optional if in .env)')
  .option('-v, --verbose', 'Show verbose debug information')
  .action(listWorkflows);

program
  .command('download')
  .description('Download a Pipedream workflow')
  .argument('<id-or-url>', 'Workflow ID (p_XXXXX) or a Pipedream URL')
  .option('-k, --apiKey <key>', 'Pipedream API key (optional if in .env)')
  .option('-o, --outputDir <dir>', 'Output directory (default: current directory)')
  .action(download);

program.parse(process.argv);