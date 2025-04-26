const fs = require('fs').promises;
const path = require('path');
const ini = require('ini');
require('dotenv').config();
const PipedreamApiClient = require('../utils/api-client');

// Get project ID from config.ini
async function getProjectIdFromConfig() {
  try {
    const configPath = path.join(process.cwd(), 'config.ini');
    const configContent = await fs.readFile(configPath, 'utf8');
    const config = ini.parse(configContent);
    
    if (config.project && config.project.id) {
      return config.project.id;
    }
    return null;
  } catch (error) {
    return null;
  }
}

// Get workflow ID from workflow.json
async function getWorkflowIdFromLocal() {
  try {
    // If in a workflow directory, try to read from workflow.json
    const workflowJsonPath = path.join(process.cwd(), 'workflow.json');
    const workflowData = JSON.parse(await fs.readFile(workflowJsonPath, 'utf8'));
    if (workflowData && workflowData.id) {
      return workflowData.id;
    }
  } catch (error) {
    // Not in a workflow directory, that's okay
  }
  
  // If in a workflows/{id} directory
  try {
    const currentDir = process.cwd();
    const dirName = path.basename(currentDir);
    const parentDir = path.basename(path.dirname(currentDir));
    
    if (parentDir === 'workflows') {
      const workflowJsonPath = path.join(currentDir, 'workflow.json');
      try {
        const workflowData = JSON.parse(await fs.readFile(workflowJsonPath, 'utf8'));
        if (workflowData && workflowData.id) {
          return workflowData.id;
        } 
      } catch (e) {
        // workflow.json might not exist or be readable
      }
      
      // Assume the directory name is the workflow ID if it starts with p_
      if (dirName.startsWith('p_')) {
        return dirName;
      }
    }
  } catch (error) {
    // Not in the expected directory structure, that's okay
  }
  
  return null;
}

// Get a nice display name for a component
function getComponentDisplayName(component) {
  if (component.name) {
    return component.name;
  }
  
  if (component.source && component.source.name) {
    return component.source.name;
  }

  if (component.key) {
    return `${component.app || ''} ${component.key}`.trim();
  }
  
  if (component.type === 'source' || component.type === 'trigger') {
    return `${component.app || ''} Trigger`.trim();
  }
  
  if (component.type === 'action') {
    return `${component.app || ''} Action`.trim();
  }
  
  return 'Unnamed Component';
}

// Get component type display
function getComponentTypeDisplay(component) {
  if (component.type === 'source' || component.key === 'trigger') {
    return 'Trigger';
  }
  
  if (component.source) {
    return `Trigger (${component.source.type || 'unknown'})`;
  }
  
  if (component.type === 'action') {
    return 'Action';
  }
  
  if (component.type === 'code') {
    return 'Code';
  }
  
  return component.type || 'Unknown';
}

// Main function to list steps for a workflow
async function listSteps(options) {
  try {
    console.log('Fetching workflow steps...');
    
    // Get API key from options or .env
    const apiKey = options.apiKey || process.env.PIPEDREAM_API_KEY;
    if (!apiKey) {
      console.error('Error: API key is required. Provide via --apiKey option or set PIPEDREAM_API_KEY in .env file');
      process.exit(1);
    }
    
    // Initialize API client
    const apiClient = new PipedreamApiClient(apiKey);
    
    // Get workflow ID
    let workflowId = options.workflow;
    
    // If workflow ID not provided directly, try to read from local directory or options
    if (!workflowId) {
      workflowId = await getWorkflowIdFromLocal();
      
      // If still no workflow ID and project ID provided, list all workflows
      if (!workflowId) {
        // Get user details
        const userDetails = await apiClient.getUserDetails();
        
        // Get project ID from options or config
        let projectId = options.project;
        if (!projectId) {
          projectId = await getProjectIdFromConfig();
        }
        
        if (projectId) {
          console.log(`No workflow ID provided. Listing workflows in project ${projectId}...`);
          
          try {
            // Get project workflows
            const workflows = await apiClient.getProjectWorkflows(projectId);
            
            if (workflows && workflows.data && workflows.data.length > 0) {
              console.log('\nAvailable workflows:');
              workflows.data.forEach((workflow, index) => {
                const name = workflow.name || workflow.settings?.name || 'Unnamed Workflow';
                console.log(`${index + 1}. ${name} (${workflow.id})`);
              });
              
              console.log('\nPlease use --workflow <id> to specify which workflow to retrieve steps for.');
              return;
            } else {
              console.log('No workflows found in the project.');
              return;
            }
          } catch (error) {
            console.error(`Error fetching workflows: ${error.message}`);
            return;
          }
        } else {
          console.error('Error: Workflow ID is required. Please provide --workflow <id> or run this command from a workflow directory.');
          process.exit(1);
        }
      }
    }
    
    if (!workflowId) {
      console.error('Error: Workflow ID is required. Please provide --workflow <id> or run this command from a workflow directory.');
      process.exit(1);
    }
    
    // Fetch workflow details
    console.log(`Fetching details for workflow ${workflowId}...`);
    
    let workflow;
    try {
      workflow = await apiClient.getWorkflow(workflowId);
    } catch (error) {
      console.error(`Error fetching workflow: ${error.message}`);
      process.exit(1);
    }
    
    if (!workflow || !workflow.data) {
      console.error('Error: Failed to fetch workflow details');
      process.exit(1);
    }
    
    const workflowName = workflow.data.name || workflow.data.settings?.name || 'Unnamed Workflow';
    const workflowUrl = `https://pipedream.com/workflows/${workflowId}`;
    console.log(`\nWorkflow: ${workflowName} (${workflowId})`);
    console.log(`URL: ${workflowUrl}`);
    
    // Try to get steps directly
    let components = [];
    
    try {
      // First try to get steps directly via API
      const steps = await apiClient.getWorkflowSteps(workflowId);
      
      if (steps && steps.data) {
        components = steps.data;
      } else if (workflow.data.components) {
        // If direct API fails, use components from workflow data
        components = workflow.data.components;
      }
    } catch (stepsError) {
      console.log(`Note: Could not fetch steps directly: ${stepsError.message}`);
      
      // Fall back to components from workflow
      if (workflow.data.components) {
        components = workflow.data.components;
      }
    }
    
    if (components.length === 0) {
      console.log('\nNo steps found for this workflow.');
      return;
    }
    
    console.log(`\nSteps (${components.length} total):`);
    console.log('-'.repeat(70));
    
    components.forEach((component, index) => {
      const displayName = getComponentDisplayName(component);
      const typeDisplay = getComponentTypeDisplay(component);
      const appName = component.app || '';
      
      console.log(`${index + 1}. ${displayName} [${typeDisplay}]`);
      
      if (appName) {
        console.log(`   App: ${appName}`);
      }
      
      // For triggers, display special info
      if (typeDisplay.includes('Trigger')) {
        if (appName === 'http') {
          const webhookUrl = `https://webhook.pipedream.com/v1/sources/${workflowId}/events`;
          console.log(`   Webhook URL: ${webhookUrl}`);
        } else if (appName === 'schedule' && component.source && component.source.cron) {
          console.log(`   Schedule: ${component.source.cron}`);
        }
      }
      
      // Show more details if requested
      if (options.detailed) {
        console.log('   Details:');
        if (component.source) {
          console.log(`   Source: ${JSON.stringify(component.source, null, 2)}`);
        }
        if (component.options) {
          console.log(`   Options: ${JSON.stringify(component.options, null, 2)}`);
        }
      }
      
      console.log('-'.repeat(70));
    });
    
    return components;
  } catch (error) {
    console.error('Error listing workflow steps:', error.message);
    process.exit(1);
  }
}

module.exports = { listSteps };