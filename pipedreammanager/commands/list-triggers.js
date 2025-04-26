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

// Main function to list triggers for a workflow
async function listTriggers(options) {
  try {
    console.log('Fetching workflow triggers...');
    
    // Get API key from options or .env
    let apiKey = options.apiKey || process.env.PIPEDREAM_API_KEY;
    
    // If API key still not found, try to load from config.ini
    if (!apiKey) {
      try {
        const configPath = path.join(process.cwd(), 'config.ini');
        const exists = await fs.access(configPath).then(() => true).catch(() => false);
        if (exists) {
          const configContent = await fs.readFile(configPath, 'utf8');
          const config = ini.parse(configContent);
          
          if (config.api && config.api.key) {
            apiKey = config.api.key;
            console.log('Using API key from config.ini');
          }
        }
      } catch (error) {
        // Silently continue if config.ini reading fails
      }
    }
    
    if (!apiKey) {
      console.error('Error: API key is required. Provide via --apiKey option or set PIPEDREAM_API_KEY in .env file');
      process.exit(1);
    }
    
    // Initialize API client
    const apiClient = new PipedreamApiClient(apiKey);
    
    // Get workflow ID
    let workflowId = options.workflow;
    
    // If workflow ID not provided directly, try to read from local directory
    if (!workflowId) {
      // Check if we're in a workflow directory by looking for workflow.json
      try {
        const workflowJsonPath = path.join(process.cwd(), 'workflow.json');
        const exists = await fs.access(workflowJsonPath).then(() => true).catch(() => false);
        
        if (exists) {
          const workflowContent = await fs.readFile(workflowJsonPath, 'utf8');
          const workflowData = JSON.parse(workflowContent);
          
          if (workflowData && workflowData.id) {
            workflowId = workflowData.id;
            console.log(`Found workflow ID in workflow.json: ${workflowId}`);
          }
        }
      } catch (error) {
        console.log(`Note: Could not read workflow.json: ${error.message}`);
      }
      
      // Try to detect if we're in a workflow subdirectory
      if (!workflowId) {
        const currentDir = process.cwd();
        const dirName = path.basename(currentDir);
        
        // Check if the directory name matches a workflow ID pattern
        if (dirName.startsWith('p_') || dirName.match(/^[a-zA-Z0-9_-]+$/)) {
          console.log(`Trying to use directory name as workflow ID: ${dirName}`);
          workflowId = dirName;
        }
      }
    }
    
    // If still no workflow ID, try to list workflows in the project
    if (!workflowId) {
      // Get user details
      console.log('Fetching user details...');
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
            
            console.log('\nPlease use --workflow <id> to specify which workflow to retrieve triggers for.');
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
    
    if (!workflowId) {
      console.error('Error: Workflow ID is required. Please provide --workflow <id> or run this command from a workflow directory.');
      process.exit(1);
    }
    
    // Special handling for Pipedream IDs that start with p_
    if (workflowId.startsWith('p_')) {
      console.log(`Detected Pipedream ID with p_ prefix: ${workflowId}`);
      
      try {
        // First try to get the workflow details directly
        const workflow = await apiClient.getWorkflow(workflowId);
        
        if (workflow && workflow.data) {
          const workflowName = workflow.data.name || workflow.data.settings?.name || 'Unnamed Workflow';
          console.log(`\nWorkflow: ${workflowName} (${workflowId})`);
          
          // Extract triggers from components
          const components = workflow.data.components || [];
          const triggers = components.filter(component => 
            component.type === 'source' || 
            component.type === 'trigger' || 
            component.key === 'trigger' ||
            (component.source && component.source.type)
          );
          
          if (triggers.length === 0) {
            console.log('No triggers found for this workflow.');
            process.exit(0);
          }
          
          console.log('\nTriggers:');
          console.log('-'.repeat(50));
          
          triggers.forEach((trigger, index) => {
            const triggerType = trigger.source?.type || trigger.type;
            const triggerApp = trigger.app || 'unknown';
            
            console.log(`Trigger #${index + 1}: ${triggerApp} (${triggerType})`);
            
            if (triggerApp === 'http' || triggerType === 'webhook') {
              // For HTTP webhook, display the URL
              const webhookUrl = `https://webhook.pipedream.com/v1/sources/${workflowId}/events`;
              console.log(`Webhook URL: ${webhookUrl}`);
            } else if (triggerApp === 'schedule' || triggerType === 'cron') {
              // For schedule trigger, display the cron expression
              const cronExpression = trigger.source?.cron || trigger.options?.cron || 'unknown';
              console.log(`Schedule: ${cronExpression}`);
            }
            
            // Display all options/configuration for debugging
            console.log('Configuration:');
            if (trigger.source) {
              console.log(JSON.stringify(trigger.source, null, 2));
            } else if (trigger.options) {
              console.log(JSON.stringify(trigger.options, null, 2));
            } else {
              console.log(JSON.stringify(trigger, null, 2));
            }
            
            console.log('-'.repeat(50));
          });
          
          process.exit(0);
        }
      } catch (error) {
        console.log(`Failed to get workflow directly: ${error.message}`);
        
        // Try to get triggers specifically
        try {
          console.log('Attempting to fetch workflow triggers directly...');
          const triggers = await apiClient.getWorkflowTriggers(workflowId);
          
          if (triggers && (triggers.data || triggers.extracted)) {
            console.log(`\nTriggers for workflow: ${workflowId}`);
            console.log('-'.repeat(50));
            
            const triggerData = triggers.data || [];
            
            if (triggerData.length === 0) {
              console.log('No triggers found for this workflow.');
              process.exit(0);
            }
            
            triggerData.forEach((trigger, index) => {
              const triggerType = trigger.source?.type || trigger.type;
              const triggerApp = trigger.app || 'unknown';
              
              console.log(`Trigger #${index + 1}: ${triggerApp} (${triggerType})`);
              
              if (triggerApp === 'http' || triggerType === 'webhook') {
                // For HTTP webhook, display the URL
                const webhookUrl = `https://webhook.pipedream.com/v1/sources/${workflowId}/events`;
                console.log(`Webhook URL: ${webhookUrl}`);
              } else if (triggerApp === 'schedule' || triggerType === 'cron') {
                // For schedule trigger, display the cron expression
                const cronExpression = trigger.source?.cron || trigger.options?.cron || 'unknown';
                console.log(`Schedule: ${cronExpression}`);
              }
              
              // Display all options/configuration for debugging
              console.log('Configuration:');
              console.log(JSON.stringify(trigger, null, 2));
              
              console.log('-'.repeat(50));
            });
            
            process.exit(0);
          }
        } catch (triggersError) {
          console.log(`Failed to get triggers: ${triggersError.message}`);
        }
        
        // Try to get HTTP source details if it's a direct source ID
        try {
          console.log('Trying to get source details directly...');
          const sourceData = await apiClient.makeRequest(
            'GET', 
            `/sources/${workflowId}`, 
            null, 
            { rawEndpoint: true }
          );
          
          if (sourceData && sourceData.data) {
            console.log(`\nSource: ${sourceData.data.name || 'Unnamed Source'} (${workflowId})`);
            console.log('\nTrigger Information:');
            console.log('-'.repeat(50));
            
            const source = sourceData.data;
            
            if (source.type === 'http') {
              console.log(`Type: HTTP Webhook`);
              
              // Extract webhook URL from data
              const webhookUrl = source.webhook_url || `https://webhook.pipedream.com/v1/sources/${workflowId}/events`;
              console.log(`Webhook URL: ${webhookUrl}`);
              
              if (source.path) {
                console.log(`Path: ${source.path}`);
              }
            } else if (source.type === 'schedule') {
              console.log(`Type: Schedule`);
              
              if (source.schedule) {
                console.log(`Schedule: ${source.schedule}`);
              }
            } else {
              console.log(`Type: ${source.type || 'Unknown'}`);
            }
            
            // Display full configuration for debugging
            console.log('\nFull Configuration:');
            console.log(JSON.stringify(source, null, 2));
            
            console.log('-'.repeat(50));
            process.exit(0);
          }
        } catch (sourceError) {
          console.log(`Failed to get source details: ${sourceError.message}`);
        }
        
        // If all attempts failed, try to list all project workflows
        console.log('Failed to get trigger details. Looking for project information...');
        
        // Try to get project ID from workflow.json or config.ini
        const projectId = await getProjectIdFromConfig();
        
        if (projectId) {
          console.log(`Found project ID: ${projectId}. Listing all workflows...`);
          
          try {
            const workflows = await apiClient.getProjectWorkflows(projectId);
            
            if (workflows && workflows.data && workflows.data.length > 0) {
              console.log('\nWorkflows in this project:');
              workflows.data.forEach((workflow, index) => {
                const name = workflow.name || workflow.settings?.name || 'Unnamed Workflow';
                console.log(`${index + 1}. ${name} (${workflow.id})`);
              });
              
              console.log('\nPlease use one of these workflow IDs with --workflow option.');
              process.exit(0);
            } else {
              console.log('No workflows found in this project.');
              process.exit(1);
            }
          } catch (projectWorkflowsError) {
            console.error(`Error fetching project workflows: ${projectWorkflowsError.message}`);
            process.exit(1);
          }
        } else {
          console.error('Could not determine project ID or find workflow/trigger details.');
          process.exit(1);
        }
      }
    } else {
      // Standard workflow ID handling
      console.log(`Fetching details for workflow ${workflowId}...`);
      
      try {
        const workflow = await apiClient.getWorkflow(workflowId);
        
        if (!workflow || !workflow.data) {
          console.error('Error: Failed to fetch workflow details - No data returned');
          process.exit(1);
        }
        
        const workflowName = workflow.data.name || workflow.data.settings?.name || 'Unnamed Workflow';
        console.log(`\nWorkflow: ${workflowName} (${workflowId})`);
        
        // Extract triggers from components
        const components = workflow.data.components || [];
        const triggers = components.filter(component => 
          component.type === 'source' || 
          component.type === 'trigger' || 
          component.key === 'trigger' ||
          (component.source && component.source.type)
        );
        
        if (triggers.length === 0) {
          console.log('No triggers found for this workflow.');
          process.exit(0);
        }
        
        console.log('\nTriggers:');
        console.log('-'.repeat(50));
        
        triggers.forEach((trigger, index) => {
          const triggerType = trigger.source?.type || trigger.type;
          const triggerApp = trigger.app || 'unknown';
          
          console.log(`Trigger #${index + 1}: ${triggerApp} (${triggerType})`);
          
          if (triggerApp === 'http' || triggerType === 'webhook') {
            // For HTTP webhook, display the URL
            const webhookUrl = `https://webhook.pipedream.com/v1/sources/${workflowId}/events`;
            console.log(`Webhook URL: ${webhookUrl}`);
          } else if (triggerApp === 'schedule' || triggerType === 'cron') {
            // For schedule trigger, display the cron expression
            const cronExpression = trigger.source?.cron || trigger.options?.cron || 'unknown';
            console.log(`Schedule: ${cronExpression}`);
          }
          
          // Display all options/configuration for debugging
          console.log('Configuration:');
          if (trigger.source) {
            console.log(JSON.stringify(trigger.source, null, 2));
          } else if (trigger.options) {
            console.log(JSON.stringify(trigger.options, null, 2));
          } else {
            console.log(JSON.stringify(trigger, null, 2));
          }
          
          console.log('-'.repeat(50));
        });
        
        process.exit(0);
      } catch (error) {
        console.error(`Error fetching workflow details: ${error.message}`);
        process.exit(1);
      }
    }
  } catch (error) {
    console.error('Error listing triggers:', error.message);
    process.exit(1);
  }
}

module.exports = { listTriggers };