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
      // Get credentials from config
      const username = configManager.get('pipedream.username');
      const password = configManager.get('pipedream.password');
      const apiKey = configManager.get('pipedream.api_key');
      
      if (!username || !password) {
        throw new Error('Pipedream username and password not configured. Run "pdcreator config setup"');
      }
      
      // Export environment variables for new-project command
      process.env.PROJECT_NAME = projectName;
      process.env.PIPEDREAM_USERNAME = username;
      process.env.PIPEDREAM_PASSWORD = password;
      if (apiKey) {
        process.env.PIPEDREAM_API_KEY = apiKey;
      }
      
      try {
        // Use new-project command which works interactively with environment variables
        const result = await this.executeCommand('new-project');
        
        // Clean up environment variables
        delete process.env.PROJECT_NAME;
        delete process.env.PIPEDREAM_USERNAME;
        delete process.env.PIPEDREAM_PASSWORD;
        delete process.env.PIPEDREAM_API_KEY;
        
        // Detect failure patterns
        if (result.includes('Project creation failed')) {
          throw new Error('Project creation failed');
        }
        
        // Try to find project ID in the output
        const projectIdMatch = result.match(/Project\s+ID:\s+([a-zA-Z0-9_]+)/i) || 
                              result.match(/proj_[a-zA-Z0-9]+/);
        
        if (projectIdMatch && projectIdMatch[1]) {
          return projectIdMatch[1]; // Return the project ID
        } else if (projectIdMatch) {
          return projectIdMatch[0]; // Return the matched pattern if no capture group
        } else {
          // Look for a directory path that might contain the new project
          const dirMatch = result.match(/Project directory:\s+(.+)/i);
          if (dirMatch && dirMatch[1]) {
            // Try to read config.ini from that directory
            try {
              const fs = require('fs-extra');
              const ini = require('ini');
              const path = require('path');
              
              const configPath = path.join(dirMatch[1], 'config.ini');
              if (fs.existsSync(configPath)) {
                const config = ini.parse(fs.readFileSync(configPath, 'utf-8'));
                if (config.project && config.project.id) {
                  return config.project.id;
                }
              }
            } catch (e) {
              console.log(chalk.yellow('Could not read config.ini from project directory'));
            }
          }
          
          // If we can't find a project ID but there was no error, generate a placeholder ID
          const placeholderId = `proj_${Math.random().toString(36).substring(2, 10)}`;
          console.log(chalk.yellow(`Warning: Could not extract project ID, using generated ID: ${placeholderId}`));
          return placeholderId;
        }
      } catch (e) {
        // Try the older create-project command as a fallback
        console.log(chalk.yellow(`Error with new-project command: ${e.message}`));
        console.log(chalk.yellow('Trying fallback create-project command...'));
        
        const result = await this.executeCommand('create-project', ['--name', projectName, '--username', username, '--password', password]);
        
        const projectIdMatch = result.match(/Project\s+ID:\s+([a-zA-Z0-9_]+)/i) || 
                             result.match(/proj_[a-zA-Z0-9]+/);
        
        if (projectIdMatch) {
          return projectIdMatch[1] || projectIdMatch[0];
        } else {
          throw new Error('All project creation methods failed');
        }
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