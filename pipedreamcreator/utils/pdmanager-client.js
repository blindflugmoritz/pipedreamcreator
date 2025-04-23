const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const util = require('util');
const execPromise = util.promisify(exec);

/**
 * Client for interacting with pdmanager
 */
class PDManagerClient {
  constructor() {
    // Check if pdmanager is installed
    this.checkPDManagerInstallation();
  }

  async checkPDManagerInstallation() {
    try {
      await execPromise('pdmanager --version');
    } catch (error) {
      console.warn(chalk.yellow('Warning: pdmanager is not installed or not in PATH. Deployment functions will not work.'));
      console.warn(chalk.yellow('Install pdmanager with: npm install -g pipedreammanager'));
      this.pdmanagerAvailable = false;
      return;
    }
    
    this.pdmanagerAvailable = true;
  }

  async createWorkflow(options) {
    if (!this.pdmanagerAvailable) {
      throw new Error('pdmanager is not available. Please install it with: npm install -g pipedreammanager');
    }
    
    const {
      project,
      name,
      description = '',
      trigger = 'http',
      triggerPath,
      schedule,
    } = options;
    
    let command = `pdmanager create-workflow --name "${name}"`;
    
    if (project) {
      command += ` --project ${project}`;
    }
    
    if (description) {
      command += ` --description "${description}"`;
    }
    
    if (trigger) {
      command += ` --trigger ${trigger}`;
    }
    
    if (triggerPath && trigger === 'http') {
      command += ` --trigger-path ${triggerPath}`;
    }
    
    if (schedule && trigger === 'schedule') {
      command += ` --schedule "${schedule}"`;
    }
    
    try {
      console.log(chalk.blue(`Creating workflow "${name}" with pdmanager...`));
      const { stdout, stderr } = await execPromise(command);
      
      if (stderr) {
        console.warn(chalk.yellow(`Warning from pdmanager: ${stderr}`));
      }
      
      console.log(chalk.green('Workflow created successfully.'));
      
      // Parse the output to get the workflow ID
      const match = stdout.match(/Workflow created: ([a-zA-Z0-9_]+)/);
      const workflowId = match ? match[1] : null;
      
      return { workflowId, output: stdout };
    } catch (error) {
      console.error(chalk.red('Error creating workflow:'), error.message);
      throw error;
    }
  }

  async deployWorkflow(workflowPath, env = 'dev') {
    if (!this.pdmanagerAvailable) {
      throw new Error('pdmanager is not available. Please install it with: npm install -g pipedreammanager');
    }
    
    if (!fs.existsSync(workflowPath)) {
      throw new Error(`Workflow path does not exist: ${workflowPath}`);
    }
    
    const command = `pdmanager deploy --path "${workflowPath}" --env ${env}`;
    
    try {
      console.log(chalk.blue(`Deploying workflow to ${env} environment...`));
      const { stdout, stderr } = await execPromise(command);
      
      if (stderr) {
        console.warn(chalk.yellow(`Warning from pdmanager: ${stderr}`));
      }
      
      console.log(chalk.green('Workflow deployed successfully.'));
      return { output: stdout };
    } catch (error) {
      console.error(chalk.red('Error deploying workflow:'), error.message);
      throw error;
    }
  }
}

module.exports = new PDManagerClient();