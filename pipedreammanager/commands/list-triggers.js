const https = require('https');
const dotenv = require('dotenv');
const fs = require('fs').promises;
const path = require('path');
const ini = require('ini');

// Explicitly configure dotenv to look in the right place
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Helper function to make API requests
async function makeApiRequest(method, endpoint, apiKey, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.pipedream.com',
      port: 443,
      path: `/v1${endpoint}`,
      method: method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    };
    
    // Log the API call for debugging
    console.log(`API Call: ${method} https://api.pipedream.com/v1${endpoint}`);
    
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsedData = JSON.parse(responseData);
            console.log(`API Response (${res.statusCode}): Success`);
            resolve(parsedData);
          } catch (error) {
            console.log(`API Response (${res.statusCode}): Error parsing JSON`);
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        } else {
          console.log(`API Response (${res.statusCode}): ${responseData}`);
          reject(new Error(`Request failed with status code ${res.statusCode}: ${responseData}`));
        }
      });
    });
    
    req.on('error', (error) => {
      console.log(`API Network Error: ${error.message}`);
      reject(error);
    });
    
    if (data) {
      req.write(JSON.stringify(data));
      console.log(`Request Body: ${JSON.stringify(data)}`);
    }
    
    req.end();
  });
}

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
    
    // Get workflow ID
    let workflowId = options.workflow;
    
    // If workflow ID not provided directly, try to read from local directory or options
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
        
        // Check if the directory name matches a workflow ID pattern (may be specific to your naming)
        if (dirName.startsWith('wf_') || dirName.match(/^[a-zA-Z0-9_-]+$/)) {
          console.log(`Trying to use directory name as workflow ID: ${dirName}`);
          workflowId = dirName;
        }
      }
      
      // Get user details to find org ID before listing workflows
      let orgId = null;
      try {
        const userDetails = await makeApiRequest('GET', '/users/me', apiKey);
        
        if (userDetails && userDetails.data && userDetails.data.orgs && userDetails.data.orgs.length > 0) {
          orgId = userDetails.data.orgs[0].id;
          console.log(`Using workspace (org_id): ${orgId}`);
        } else {
          console.error('Error: No workspace found for the user');
          process.exit(1);
        }
      } catch (error) {
        console.error(`Error getting user details: ${error.message}`);
        process.exit(1);
      }
      
      // If still no workflow ID and project ID provided, list all workflows and prompt user
      if (!workflowId && options.project) {
        console.log(`No workflow ID provided. Listing workflows in project ${options.project}...`);
        try {
          const workflows = await makeApiRequest('GET', `/projects/${options.project}/workflows?org_id=${orgId}`, apiKey);
          
          if (workflows && workflows.data && workflows.data.length > 0) {
            console.log('\nAvailable workflows:');
            workflows.data.forEach((workflow, index) => {
              console.log(`${index + 1}. ${workflow.name} (${workflow.id})`);
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
      } else if (!workflowId && !options.project) {
        // Try to get project ID from config.ini
        const projectId = await getProjectIdFromConfig();
        
        if (projectId) {
          console.log(`No workflow ID provided. Listing workflows in project ${projectId}...`);
          try {
            const workflows = await makeApiRequest('GET', `/projects/${projectId}/workflows?org_id=${orgId}`, apiKey);
            
            if (workflows && workflows.data && workflows.data.length > 0) {
              console.log('\nAvailable workflows:');
              workflows.data.forEach((workflow, index) => {
                console.log(`${index + 1}. ${workflow.name} (${workflow.id})`);
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
    }
    
    if (!workflowId) {
      console.error('Error: Workflow ID is required. Please provide --workflow <id> or run this command from a workflow directory.');
      process.exit(1);
    }
    
    // Get user details to find org ID
    console.log('Fetching user details to determine workspace...');
    let orgId = null;
    try {
      const userDetails = await makeApiRequest('GET', '/users/me', apiKey);
      
      if (!userDetails || !userDetails.data || !userDetails.data.id) {
        console.error('Error: Failed to fetch user details');
        process.exit(1);
      }
      
      // Get the first organization (workspace) from the user's details
      if (userDetails.data.orgs && userDetails.data.orgs.length > 0) {
        orgId = userDetails.data.orgs[0].id;
        console.log(`Using workspace (org_id): ${orgId}`);
      } else {
        console.error('Error: No workspace found for the user');
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error getting user details: ${error.message}`);
      process.exit(1);
    }
    
    // Special handling for Pipedream unique IDs (p_*)
    if (workflowId.startsWith('p_')) {
      console.log(`Detected Pipedream ID with p_ prefix: ${workflowId}`);
      
      try {
        // First, try to get components directly - this works for many p_ identifiers
        console.log(`Trying to fetch components for ${workflowId}...`);
        const components = await makeApiRequest('GET', `/components/${workflowId}?org_id=${orgId}`, apiKey);
        
        if (components && components.data) {
          console.log(`\nFound components for: ${workflowId}`);
          console.log(`Name: ${components.data.name || 'Unnamed Component'}`);
          console.log('\nTrigger Information:');
          console.log('-'.repeat(50));
          
          // Display webhook URL if it's HTTP type
          if (components.data.http_url) {
            console.log(`Type: HTTP Webhook`);
            console.log(`Webhook URL: ${components.data.http_url}`);
          } else if (components.data.schedule) {
            console.log(`Type: Schedule`);
            console.log(`Schedule: ${components.data.schedule}`);
          } else {
            console.log(`Type: ${components.data.type || 'Unknown'}`);
          }
          
          // Display full configuration for debugging
          console.log('\nFull Configuration:');
          console.log(JSON.stringify(components.data, null, 2));
          
          console.log('-'.repeat(50));
          process.exit(0);
        }
      } catch (componentsError) {
        console.log(`Note: Could not find components: ${componentsError.message}`);
      }
      
      // Try a different components endpoint format (sometimes needed for HTTP sources)
      try {
        console.log(`Trying alternate component format for ${workflowId}...`);
        const endpoint = `/orgs/${orgId}/components/${workflowId}`;
        const components = await makeApiRequest('GET', endpoint, apiKey);
        
        if (components && components.data) {
          console.log(`\nFound components for: ${workflowId} using alternate endpoint`);
          console.log(`Name: ${components.data.name || 'Unnamed Component'}`);
          console.log('\nTrigger Information:');
          console.log('-'.repeat(50));
          
          // Display webhook URL if it's HTTP type
          if (components.data.http_url) {
            console.log(`Type: HTTP Webhook`);
            console.log(`Webhook URL: ${components.data.http_url}`);
          } else if (components.data.schedule) {
            console.log(`Type: Schedule`);
            console.log(`Schedule: ${components.data.schedule}`);
          } else {
            console.log(`Type: ${components.data.type || 'Unknown'}`);
          }
          
          // Display full configuration for debugging
          console.log('\nFull Configuration:');
          console.log(JSON.stringify(components.data, null, 2));
          
          console.log('-'.repeat(50));
          process.exit(0);
        }
      } catch (alternateError) {
        console.log(`Note: Could not find components with alternate endpoint: ${alternateError.message}`);
      }
      
      // Also try the HTTP triggers endpoint for p_* IDs
      try {
        console.log(`Trying HTTP triggers endpoint for ${workflowId}...`);
        const endpoint = `/users/me/http_endpoints/${workflowId}?org_id=${orgId}`;
        const httpTrigger = await makeApiRequest('GET', endpoint, apiKey);
        
        if (httpTrigger && httpTrigger.data) {
          console.log(`\nFound HTTP trigger for: ${workflowId}`);
          console.log(`Name: ${httpTrigger.data.name || 'Unnamed HTTP Trigger'}`);
          console.log('\nTrigger Information:');
          console.log('-'.repeat(50));
          
          console.log(`Type: HTTP Webhook`);
          const webhookUrl = httpTrigger.data.url || `https://webhook.pipedream.com/v1/sources/${workflowId}/events`;
          console.log(`Webhook URL: ${webhookUrl}`);
          
          // Display full configuration for debugging
          console.log('\nFull Configuration:');
          console.log(JSON.stringify(httpTrigger.data, null, 2));
          
          console.log('-'.repeat(50));
          process.exit(0);
        }
      } catch (httpError) {
        console.log(`Note: Could not find HTTP trigger: ${httpError.message}`);
      }
      
      try {
        // Next, try the sources endpoint
        console.log(`Trying sources endpoint for ${workflowId}...`);
        const source = await makeApiRequest('GET', `/sources/${workflowId}?org_id=${orgId}`, apiKey);
        
        if (!source || !source.data) {
          console.error('Error: Failed to fetch source details - No data returned');
          
          // Try to get the project data instead
          console.log('\nTrying to get project information instead...');
          try {
            // Determine the project directory (go up one level if in workflow dir)
            const currentDir = process.cwd();
            const dirName = path.basename(currentDir);
            let projectDir = currentDir;
            
            // If current directory is a workflow directory, go up one level
            if (dirName === workflowId || dirName.startsWith('wf_') || dirName.startsWith('p_')) {
              projectDir = path.dirname(currentDir);
              console.log(`Detected workflow directory, using parent directory: ${projectDir}`);
            }
            
            // Try to get project ID from workflow.json first
            let projectId = null;
            try {
              // Check current directory for workflow.json
              let workflowJsonPath = path.join(currentDir, 'workflow.json');
              let exists = await fs.access(workflowJsonPath).then(() => true).catch(() => false);
              
              if (exists) {
                const workflowContent = await fs.readFile(workflowJsonPath, 'utf8');
                const workflowData = JSON.parse(workflowContent);
                
                if (workflowData && workflowData.project_id) {
                  projectId = workflowData.project_id;
                  console.log(`Found project ID in workflow.json: ${projectId}`);
                }
              }
            } catch (e) {
              console.log(`Note: Error reading workflow.json: ${e.message}`);
            }
            
            // Try to get project ID from config.ini if not found in workflow.json
            if (!projectId) {
              try {
                // First try config.ini in current directory 
                let configPath = path.join(currentDir, 'config.ini');
                let exists = await fs.access(configPath).then(() => true).catch(() => false);
                
                // If not found and we're in a workflow directory, check parent directory
                if (!exists && currentDir !== projectDir) {
                  configPath = path.join(projectDir, 'config.ini');
                  exists = await fs.access(configPath).then(() => true).catch(() => false);
                }
                
                if (exists) {
                  const configContent = await fs.readFile(configPath, 'utf8');
                  const config = ini.parse(configContent);
                  
                  if (config.project && config.project.id) {
                    projectId = config.project.id;
                    console.log(`Found project ID in config.ini: ${projectId}`);
                  }
                }
              } catch (e) {
                console.log(`Note: Error reading config.ini: ${e.message}`);
              }
            }
            
            // Last resort: try to check if the ID itself is potentially a workflow ID
            // instead of a source ID by checking if the second character is a different letter
            if (!projectId && workflowId.startsWith('p_')) {
              // If it matches p_* pattern but might be a direct workflow ID,
              // try extracting project ID directly from API
              try {
                console.log(`Trying alternate API endpoint for ${workflowId}...`);
                const workflowDetails = await makeApiRequest('GET', `/workflows/${workflowId}?org_id=${orgId}`, apiKey);
                
                if (workflowDetails && workflowDetails.data && workflowDetails.data.project_id) {
                  projectId = workflowDetails.data.project_id;
                  console.log(`Found project ID from API: ${projectId}`);
                }
              } catch (apiError) {
                console.log(`Note: Could not get project ID from API: ${apiError.message}`);
              }
            }
            
            if (projectId) {
              let projectWorkflows = null;
              
              // Try different endpoint formats - sometimes the API requires different path structures
              try {
                console.log(`Trying standard project workflows endpoint...`);
                const workflows = await makeApiRequest('GET', `/projects/${projectId}/workflows?org_id=${orgId}`, apiKey);
                
                if (workflows && workflows.data) {
                  projectWorkflows = workflows;
                  console.log(`Success with standard endpoint!`);
                }
              } catch (e) {
                console.log(`Standard endpoint failed: ${e.message}`);
              }
              
              // If first attempt failed, try alternative endpoint
              if (!projectWorkflows) {
                try {
                  console.log(`Trying alternative project endpoint...`);
                  const workflows = await makeApiRequest('GET', `/orgs/${orgId}/projects/${projectId}/workflows`, apiKey);
                  
                  if (workflows && workflows.data) {
                    projectWorkflows = workflows;
                    console.log(`Success with alternative endpoint!`);
                  }
                } catch (e) {
                  console.log(`Alternative endpoint failed: ${e.message}`);
                }
              }
              
              // If both previous attempts failed, try listing all workflows and filtering
              if (!projectWorkflows) {
                try {
                  console.log(`Trying general workflows endpoint...`);
                  const allWorkflows = await makeApiRequest('GET', `/workflows?org_id=${orgId}`, apiKey);
                  
                  if (allWorkflows && allWorkflows.data) {
                    // Filter to only include workflows for this project
                    const filteredWorkflows = allWorkflows.data.filter(w => 
                      w.project_id === projectId || 
                      w.project === projectId
                    );
                    
                    projectWorkflows = { data: filteredWorkflows };
                    console.log(`Found ${filteredWorkflows.length} workflows for project ${projectId} using general endpoint`);
                  }
                } catch (e) {
                  console.log(`General endpoint failed: ${e.message}`);
                }
              }
              
              // Last attempt - try pulling specific endpoints by project name
              if (!projectWorkflows) {
                try {
                  console.log(`Trying to directly fetch project details...`);
                  const projectDetails = await makeApiRequest('GET', `/projects/${projectId}?org_id=${orgId}`, apiKey);
                  
                  if (projectDetails && projectDetails.data) {
                    console.log(`Project details retrieved: ${projectDetails.data.name}`);
                    // The API might provide the workflows URL or other details we can use
                  }
                } catch (e) {
                  console.log(`Project details endpoint failed: ${e.message}`);
                }
                
                // Set empty results if all attempts failed
                if (!projectWorkflows) {
                  projectWorkflows = { data: [] };
                }
              }
              
              // Display the workflows found (if any)
              if (projectWorkflows.data && projectWorkflows.data.length > 0) {
                console.log('\nWorkflows in this project:');
                projectWorkflows.data.forEach((workflow, index) => {
                  console.log(`${index + 1}. ${workflow.name || 'Unnamed Workflow'} (${workflow.id})`);
                });
                
                console.log('\nPlease use one of these workflow IDs with --workflow option.');
                process.exit(0);
              } else {
                console.log('No workflows found in this project. The API key may not have sufficient permissions or the project may be empty.');
                console.log(`Project ID used: ${projectId}`);
                console.log(`Organization ID used: ${orgId}`);
                process.exit(0);
              }
            } else {
              console.error('Could not determine project ID');
              process.exit(1);
            }
          } catch (projectError) {
            console.error(`Error fetching project information: ${projectError.message}`);
            process.exit(1);
          }
        }
        
        // If we successfully got the source data, show trigger information
        console.log(`\nSource: ${source.data.name || 'Unnamed Source'} (${workflowId})`);
        console.log('\nTrigger Information:');
        console.log('-'.repeat(50));
        
        const sourceData = source.data;
        
        if (sourceData.type === 'http') {
          console.log(`Type: HTTP Webhook`);
          
          // Extract webhook URL from data
          const webhookUrl = sourceData.webhook_url || `https://webhook.pipedream.com/v1/sources/${workflowId}/events`;
          console.log(`Webhook URL: ${webhookUrl}`);
          
          if (sourceData.path) {
            console.log(`Path: ${sourceData.path}`);
          }
        } else if (sourceData.type === 'schedule') {
          console.log(`Type: Schedule`);
          
          if (sourceData.schedule) {
            console.log(`Schedule: ${sourceData.schedule}`);
          }
        } else {
          console.log(`Type: ${sourceData.type || 'Unknown'}`);
        }
        
        // Display full configuration for debugging
        console.log('\nFull Configuration:');
        console.log(JSON.stringify(sourceData, null, 2));
        
        console.log('-'.repeat(50));
        process.exit(0);
      } catch (error) {
        console.error(`Error fetching source details: ${error.message}`);
        
        // Try to list workflows in a project
        console.log('\nTrying to list project workflows instead...');
        
        try {
          // Determine the project directory (go up one level if in workflow dir)
          const currentDir = process.cwd();
          const dirName = path.basename(currentDir);
          let projectDir = currentDir;
          
          // If current directory is a workflow directory, go up one level
          if (dirName === workflowId || dirName.startsWith('wf_') || dirName.startsWith('p_')) {
            projectDir = path.dirname(currentDir);
            console.log(`Detected workflow directory, using parent directory: ${projectDir}`);
          }
          
          // Try to get project ID from config.ini in the project directory
          let projectId = null;
          try {
            // First check in current directory
            let configPath = path.join(currentDir, 'config.ini');
            let exists = await fs.access(configPath).then(() => true).catch(() => false);
            
            // If not found and not already in project dir, check parent directory
            if (!exists && currentDir !== projectDir) {
              configPath = path.join(projectDir, 'config.ini');
              exists = await fs.access(configPath).then(() => true).catch(() => false);
            }
            
            if (exists) {
              const configContent = await fs.readFile(configPath, 'utf8');
              const config = ini.parse(configContent);
              
              if (config.project && config.project.id) {
                projectId = config.project.id;
                console.log(`Found project ID in config.ini: ${projectId}`);
              }
            }
          } catch (e) {
            console.log(`Error reading config.ini: ${e.message}`);
          }
          
          // If still no project ID, try to extract from workflow.json
          if (!projectId) {
            try {
              // Use workflow.json in current directory if available
              let workflowJsonPath = path.join(currentDir, 'workflow.json');
              let exists = await fs.access(workflowJsonPath).then(() => true).catch(() => false);
              
              if (exists) {
                const workflowContent = await fs.readFile(workflowJsonPath, 'utf8');
                const workflowData = JSON.parse(workflowContent);
                
                if (workflowData && workflowData.project_id) {
                  projectId = workflowData.project_id;
                  console.log(`Found project ID in workflow.json: ${projectId}`);
                }
              }
            } catch (e) {
              console.log(`Error reading workflow.json: ${e.message}`);
            }
          }
          
          if (projectId) {
            let projectWorkflows = null;
            
            // Try different API endpoints - Pipedream API can be inconsistent
            try {
              console.log(`Trying standard project workflows endpoint...`);
              const workflows = await makeApiRequest('GET', `/projects/${projectId}/workflows?org_id=${orgId}`, apiKey);
              
              if (workflows && workflows.data) {
                projectWorkflows = workflows;
                console.log(`Success with standard endpoint!`);
              }
            } catch (e) {
              console.log(`Standard endpoint failed: ${e.message}`);
            }
            
            // Try alternative endpoint if first attempt failed
            if (!projectWorkflows) {
              try {
                console.log(`Trying alternative project endpoint...`);
                const workflows = await makeApiRequest('GET', `/orgs/${orgId}/projects/${projectId}/workflows`, apiKey);
                
                if (workflows && workflows.data) {
                  projectWorkflows = workflows;
                  console.log(`Success with alternative endpoint!`);
                }
              } catch (e) {
                console.log(`Alternative endpoint failed: ${e.message}`);
              }
            }
            
            // Try general endpoint and filter results if needed
            if (!projectWorkflows) {
              try {
                console.log(`Trying general workflows endpoint...`);
                const allWorkflows = await makeApiRequest('GET', `/workflows?org_id=${orgId}`, apiKey);
                
                if (allWorkflows && allWorkflows.data) {
                  // Filter to only include workflows from this project
                  const filteredWorkflows = allWorkflows.data.filter(w => 
                    w.project_id === projectId || 
                    w.project === projectId
                  );
                  
                  projectWorkflows = { data: filteredWorkflows };
                  console.log(`Found ${filteredWorkflows.length} workflows for project ${projectId} using general endpoint`);
                }
              } catch (e) {
                console.log(`General endpoint failed: ${e.message}`);
              }
            }
            
            // Create empty data array if all attempts failed
            if (!projectWorkflows) {
              projectWorkflows = { data: [] };
            }
            
            // Display the workflows found (if any)
            if (projectWorkflows.data && projectWorkflows.data.length > 0) {
              console.log('\nWorkflows in this project:');
              projectWorkflows.data.forEach((workflow, index) => {
                console.log(`${index + 1}. ${workflow.name || 'Unnamed Workflow'} (${workflow.id})`);
              });
              
              console.log('\nPlease use one of these workflow IDs with --workflow option.');
              process.exit(0);
            } else {
              console.log('No workflows found in this project. The API key may not have sufficient permissions or the project may be empty.');
              console.log(`Project ID used: ${projectId}`);
              console.log(`Organization ID used: ${orgId}`);
              process.exit(0);
            }
          } else {
            console.error('Could not determine project ID');
            console.log('\nPossible solutions:');
            console.log('1. Run this command from the project root directory where config.ini is located');
            console.log('2. Specify a valid workflow ID with --workflow option');
            console.log('3. Specify a valid project ID with --project option');
            console.log('4. Check that your API key has the correct permissions');
            console.log('5. Verify that workflow.json contains a project_id field');
            console.log('\nAPI Key being used:', apiKey ? apiKey.substring(0, 6) + '...' : 'none');
            process.exit(1);
          }
        } catch (projectError) {
          console.error(`Error fetching project workflows: ${projectError.message}`);
          process.exit(1);
        }
      }
    } else {
      // Standard workflow ID handling (wf_*)
      console.log(`Fetching details for workflow ${workflowId}...`);
      let workflow;
      try {
        workflow = await makeApiRequest('GET', `/workflows/${workflowId}?org_id=${orgId}`, apiKey);
        
        if (!workflow || !workflow.data) {
          console.error('Error: Failed to fetch workflow details - No data returned');
          process.exit(1);
        }
        
        const workflowName = workflow.data.name || 'Unnamed Workflow';
        console.log(`\nWorkflow: ${workflowName} (${workflowId})`);
        
        // Extract triggers from components
        const components = workflow.data.components || [];
        const triggers = components.filter(component => 
          component.type === 'source' || 
          component.type === 'trigger' || 
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
          
          if (triggerApp === 'http') {
            // For HTTP webhook, display the URL
            const webhookUrl = `https://webhook.pipedream.com/v1/sources/${workflowId}/events`;
            console.log(`Webhook URL: ${webhookUrl}`);
          } else if (triggerApp === 'schedule') {
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
          }
          
          console.log('-'.repeat(50));
        });
        
        // Make sure to exit the process after returning data
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