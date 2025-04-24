const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const configManager = require('./config-manager');

class PdManagerClient {
  constructor() {
    this.pdManagerPath = 'pdmanager'; // Assumes pdmanager is in PATH
  }

  // Execute pdmanager command and return promise with result
  async executeCommand(command, args = []) {
    return new Promise((resolve, reject) => {
      const fullArgs = [command, ...args];
      console.log(chalk.dim(`Executing: pdmanager ${fullArgs.join(' ')}`));
      
      const process = spawn(this.pdManagerPath, fullArgs);
      
      let stdout = '';
      let stderr = '';
      
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`pdmanager exited with code ${code}: ${stderr}`));
        }
      });
      
      process.on('error', (err) => {
        reject(new Error(`Failed to execute pdmanager: ${err.message}`));
      });
    });
  }

  // Create a new project in Pipedream
  async createProject(projectName) {
    try {
      const result = await this.executeCommand('create-project', [projectName]);
      
      // Extract project ID from the output
      const match = result.match(/Project created with ID: ([a-zA-Z0-9_]+)/);
      if (match && match[1]) {
        return match[1]; // Return the project ID
      } else {
        throw new Error('Could not parse project ID from pdmanager output');
      }
    } catch (error) {
      console.error(chalk.red('Error creating project:'), error.message);
      throw error;
    }
  }

  // Create a new workflow in Pipedream
  async createWorkflow(workflowName, projectId = null) {
    const args = [workflowName];
    if (projectId) {
      args.push('--project', projectId);
    }
    
    try {
      const result = await this.executeCommand('create-workflow', args);
      
      // Extract workflow ID from the output
      const match = result.match(/Workflow created with ID: ([a-zA-Z0-9_]+)/);
      if (match && match[1]) {
        return match[1]; // Return the workflow ID
      } else {
        throw new Error('Could not parse workflow ID from pdmanager output');
      }
    } catch (error) {
      console.error(chalk.red('Error creating workflow:'), error.message);
      throw error;
    }
  }

  // List existing workflows
  async listWorkflows() {
    try {
      const result = await this.executeCommand('list-workflows');
      return this._parseListOutput(result);
    } catch (error) {
      console.error(chalk.red('Error listing workflows:'), error.message);
      throw error;
    }
  }

  // Parse list output into structured data
  _parseListOutput(output) {
    const lines = output.split('\n');
    const items = [];
    
    for (const line of lines) {
      // Extract ID and name from lines like "p_abc123 - My Workflow"
      const match = line.match(/^([a-zA-Z0-9_]+)\s+-\s+(.+)$/);
      if (match) {
        items.push({
          id: match[1],
          name: match[2]
        });
      }
    }
    
    return items;
  }

  // Update a workflow
  async updateWorkflow(workflowId, workflowJsonPath, codeJsPath) {
    try {
      return await this.executeCommand('update-workflow', [
        '--id', workflowId,
        '--workflow-json', workflowJsonPath,
        '--code-js', codeJsPath
      ]);
    } catch (error) {
      console.error(chalk.red('Error updating workflow:'), error.message);
      throw error;
    }
  }

  // Check if pdmanager is installed and accessible
  async checkInstallation() {
    try {
      await this.executeCommand('--version');
      return true;
    } catch (error) {
      console.error(chalk.red('pdmanager not found:'), error.message);
      console.log(chalk.yellow('Make sure pdmanager is installed and in your PATH'));
      return false;
    }
  }
}

module.exports = new PdManagerClient();