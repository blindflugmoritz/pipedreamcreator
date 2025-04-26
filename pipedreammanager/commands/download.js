const fs = require('fs').promises;
const path = require('path');
const url = require('url');
const ini = require('ini');
require('dotenv').config();
const PipedreamApiClient = require('../utils/api-client');

// Helper function to ensure directory exists
async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

// Function to parse Pipedream URLs
function parsePipedreamUrl(inputUrl) {
  try {
    const parsedUrl = new URL(inputUrl);
    
    // Ensure it's a Pipedream URL
    if (!parsedUrl.hostname.includes('pipedream.com')) {
      throw new Error('Not a valid Pipedream URL');
    }
    
    console.log(`Parsing URL: ${inputUrl}`);
    
    const pathParts = parsedUrl.pathname.split('/').filter(part => part);
    console.log(`Path parts: ${pathParts.join(', ')}`);
    
    // Look for username in path parts (starts with @)
    let username = null;
    for (const part of pathParts) {
      if (part.startsWith('@')) {
        username = part.substring(1); // remove the @ symbol
        console.log(`Found username in URL: ${username}`);
        break;
      }
    }
    
    // Try to detect resource IDs directly in the URL
    // Project IDs typically start with "proj_"
    // Workflow IDs typically start with "p_"
    for (const part of pathParts) {
      if (part.startsWith('proj_')) {
        console.log(`Found project ID directly in URL: ${part}`);
        return {
          type: 'project',
          projectId: part,
          username: username
        };
      } else if (part.startsWith('p_')) {
        console.log(`Found workflow ID directly in URL: ${part}`);
        return {
          type: 'workflow',
          workflowId: part,
          username: username
        };
      }
    }
    
    // If we can't detect IDs directly, assume standard format
    if (pathParts.length >= 3) {
      if (pathParts.includes('projects')) {
        const projectsIndex = pathParts.indexOf('projects');
        if (projectsIndex + 1 < pathParts.length) {
          const possibleProjectId = pathParts[projectsIndex + 1];
          if (possibleProjectId.startsWith('proj_')) {
            console.log(`Parsed project ID: ${possibleProjectId}`);
            return {
              type: 'project',
              projectId: possibleProjectId,
              username: username
            };
          }
        }
      } else if (pathParts.includes('workflows')) {
        const workflowsIndex = pathParts.indexOf('workflows');
        if (workflowsIndex + 1 < pathParts.length) {
          const possibleWorkflowId = pathParts[workflowsIndex + 1];
          if (possibleWorkflowId.startsWith('p_')) {
            console.log(`Parsed workflow ID: ${possibleWorkflowId}`);
            return {
              type: 'workflow',
              workflowId: possibleWorkflowId,
              username: username
            };
          }
        }
      }
    }
    
    console.error('URL format not recognized, parts:', pathParts);
    throw new Error('Could not extract project or workflow ID from URL');
  } catch (error) {
    console.error(`URL parsing error:`, error);
    throw new Error(`Failed to parse Pipedream URL: ${error.message}`);
  }
}

// Function to download a single workflow
async function downloadWorkflow(workflowId, apiClient, outputDir) {
  try {
    console.log(`Fetching workflow: ${workflowId}`);
    
    // First get user details to determine workspace/org if needed
    console.log("Fetching user details...");
    const userDetails = await apiClient.getUserDetails();
    
    if (!userDetails || !userDetails.data) {
      throw new Error('Failed to fetch user details');
    }
    
    // Try to fetch workflow details using API client
    let workflow = null;
    try {
      workflow = await apiClient.getWorkflow(workflowId);
    } catch (error) {
      console.error(`Failed to fetch workflow: ${error.message}`);
      throw error;
    }
    
    if (!workflow || !workflow.data) {
      throw new Error(`Failed to fetch workflow: ${workflowId}`);
    }
    
    // Create workflow directory
    const workflowDir = path.join(outputDir, 'workflows', workflowId);
    console.log(`Creating workflow directory: ${workflowDir}`);
    await ensureDir(workflowDir);
    
    // Fetch workflow code
    console.log(`Fetching code for workflow: ${workflowId}`);
    let workflowCode = null;
    
    try {
      workflowCode = await apiClient.getWorkflowCode(workflowId);
    } catch (error) {
      console.warn(`Could not fetch workflow code: ${error.message}`);
      
      // Create a placeholder for the code
      workflowCode = { 
        data: { 
          code: `// Placeholder for workflow: ${workflowId}\n// Downloaded on: ${new Date().toISOString()}\n// NOTE: Actual code could not be fetched via API\n\nexport default defineComponent({\n  async run({steps, $}) {\n    // Code unavailable - please edit manually\n    return $.export("result", { success: true });\n  },\n});\n`
        } 
      };
    }
    
    // Save workflow metadata
    const workflowMetadata = {
      id: workflow.data.id,
      name: workflow.data.name || workflow.data.settings?.name || 'Unnamed Workflow',
      description: workflow.data.description || workflow.data.settings?.description || '',
      active: workflow.data.active || workflow.data.settings?.active || false,
      created_at: workflow.data.created_at,
      updated_at: workflow.data.updated_at,
      project_id: workflow.data.project_id,
      components: workflow.data.components || []
    };
    
    // Extract trigger information if it exists
    if (workflow.data.components && workflow.data.components.length > 0) {
      const trigger = workflow.data.components.find(comp => comp.key === 'trigger');
      if (trigger) {
        workflowMetadata.trigger = {
          type: trigger.app,
          source_type: trigger.source?.type,
          source_key: trigger.source?.key
        };
        
        // Add webhook URL for HTTP triggers
        if (trigger.app === 'http' && trigger.source?.type === 'webhook') {
          workflowMetadata.webhook_url = `https://webhook.pipedream.com/v1/sources/${workflowId}/events`;
        }
        
        // Add schedule for cron triggers
        if (trigger.app === 'schedule' && trigger.source?.type === 'cron') {
          workflowMetadata.trigger.schedule = trigger.source.cron;
        }
      }
    }
    
    // Save workflow metadata
    await fs.writeFile(
      path.join(workflowDir, 'workflow.json'),
      JSON.stringify(workflowMetadata, null, 2)
    );
    
    // Save workflow code
    await fs.writeFile(
      path.join(workflowDir, 'code.js'),
      workflowCode.data.code || '// Empty workflow code'
    );
    
    // Create test directory and fixtures
    const testsDir = path.join(workflowDir, 'tests');
    const fixturesDir = path.join(testsDir, 'fixtures');
    await ensureDir(fixturesDir);
    
    // Create sample test fixtures
    const sampleInput = {
      timestamp: new Date().toISOString(),
      event: {
        type: 'test',
        data: {
          message: 'Test event for workflow',
          workflow_id: workflowId
        }
      }
    };
    
    await fs.writeFile(
      path.join(fixturesDir, 'input.json'),
      JSON.stringify(sampleInput, null, 2)
    );
    
    await fs.writeFile(
      path.join(fixturesDir, 'expected_output.json'),
      JSON.stringify({ success: true }, null, 2)
    );
    
    console.log(`✅ Downloaded workflow: ${workflowMetadata.name} (${workflowId})`);
    console.log(`   - Workflow directory: ${workflowDir}`);
    
    // Add directory to the returned metadata
    workflowMetadata.directory = workflowDir;
    return workflowMetadata;
  } catch (error) {
    console.error(`Error downloading workflow ${workflowId}:`, error.message);
    return null;
  }
}

// Function to download workflows by project ID
async function downloadWorkflowsByProjectId(projectId, apiClient, outputDir) {
  try {
    console.log(`Looking for workflows in project: ${projectId}`);
    
    // Get user details
    console.log("Fetching user details...");
    const userDetails = await apiClient.getUserDetails();
    
    if (!userDetails || !userDetails.data) {
      throw new Error('Failed to fetch user details');
    }
    
    console.log("Fetching workflows for project...");
    let allWorkflows = { data: [] };
    let projectWorkflows = [];
    
    try {
      // Try to get project workflows directly
      const projectWorkflowsResult = await apiClient.getProjectWorkflows(projectId);
      if (projectWorkflowsResult && projectWorkflowsResult.data) {
        console.log(`Found ${projectWorkflowsResult.data.length} workflows directly for project`);
        allWorkflows.data = [...allWorkflows.data, ...projectWorkflowsResult.data];
        projectWorkflows = [...projectWorkflowsResult.data];
      }
    } catch (error) {
      console.log(`Failed to get project workflows directly: ${error.message}`);
      
      // Try fetching all workflows and filtering by project ID
      try {
        console.log("Fetching all user workflows...");
        const userWorkflows = await apiClient.makeRequest('GET', '/users/me/workflows');
        
        if (userWorkflows && userWorkflows.data) {
          console.log(`Found ${userWorkflows.data.length} workflows for user`);
          
          // Filter for this project
          const matchingWorkflows = userWorkflows.data.filter(workflow => 
            workflow.project_id === projectId || 
            workflow.project?.id === projectId ||
            workflow.settings?.project_id === projectId ||
            workflow.settings?.projectId === projectId
          );
          
          if (matchingWorkflows.length > 0) {
            console.log(`Found ${matchingWorkflows.length} workflows for project from user workflows`);
            allWorkflows.data = [...allWorkflows.data, ...matchingWorkflows];
            projectWorkflows = [...projectWorkflows, ...matchingWorkflows];
          }
        }
      } catch (userWorkflowsError) {
        console.log(`Failed to fetch user workflows: ${userWorkflowsError.message}`);
      }
      
      // Try organization workflows
      if (userDetails.data.orgs) {
        for (const org of userDetails.data.orgs) {
          try {
            console.log(`Checking org ${org.name} for project workflows...`);
            
            // Try each org project endpoint
            try {
              console.log(`Fetching projects for org ${org.name}...`);
              const orgProjects = await apiClient.makeRequest(
                'GET', 
                `/organizations/${org.id}/projects`
              );
              
              if (orgProjects && orgProjects.data) {
                // Find matching project
                const matchingProject = orgProjects.data.find(p => p.id === projectId);
                
                if (matchingProject) {
                  console.log(`Found project ${matchingProject.name} in org ${org.name}`);
                  
                  // Get workflows for this project
                  try {
                    const orgProjectWorkflows = await apiClient.makeRequest(
                      'GET',
                      `/organizations/${org.id}/projects/${projectId}/workflows`
                    );
                    
                    if (orgProjectWorkflows && orgProjectWorkflows.data) {
                      console.log(`Found ${orgProjectWorkflows.data.length} workflows for project in org ${org.name}`);
                      allWorkflows.data = [...allWorkflows.data, ...orgProjectWorkflows.data];
                      projectWorkflows = [...projectWorkflows, ...orgProjectWorkflows.data];
                    }
                  } catch (orgProjectWorkflowsError) {
                    console.log(`Failed to get org project workflows: ${orgProjectWorkflowsError.message}`);
                  }
                }
              }
            } catch (orgProjectsError) {
              console.log(`Failed to get org projects: ${orgProjectsError.message}`);
            }
            
            // Try workspace approach
            try {
              console.log(`Trying workspace approach for org ${org.name}...`);
              const workspaceProjects = await apiClient.makeRequest(
                'GET',
                `/workspaces/${org.id}/projects`
              );
              
              if (workspaceProjects && workspaceProjects.data) {
                // Find matching project
                const matchingProject = workspaceProjects.data.find(p => p.id === projectId);
                
                if (matchingProject) {
                  console.log(`Found project ${matchingProject.name} in workspace ${org.name}`);
                  
                  // Get workflows for this project
                  try {
                    const workspaceProjectWorkflows = await apiClient.makeRequest(
                      'GET',
                      `/workspaces/${org.id}/projects/${projectId}/workflows`
                    );
                    
                    if (workspaceProjectWorkflows && workspaceProjectWorkflows.data) {
                      console.log(`Found ${workspaceProjectWorkflows.data.length} workflows for project in workspace ${org.name}`);
                      allWorkflows.data = [...allWorkflows.data, ...workspaceProjectWorkflows.data];
                      projectWorkflows = [...projectWorkflows, ...workspaceProjectWorkflows.data];
                    }
                  } catch (workspaceProjectWorkflowsError) {
                    console.log(`Failed to get workspace project workflows: ${workspaceProjectWorkflowsError.message}`);
                  }
                }
              }
            } catch (workspaceProjectsError) {
              console.log(`Failed to get workspace projects: ${workspaceProjectsError.message}`);
            }
          } catch (orgError) {
            console.log(`Error processing org ${org.name}: ${orgError.message}`);
          }
        }
      }
    }
    
    // Check if we found any workflows
    if (projectWorkflows.length === 0) {
      console.log(`No workflows found for project ID: ${projectId}`);
      
      // Check all workflows for any mention of this project
      console.log('Checking all workflows for any mention of this project ID...');
      const foundInAny = allWorkflows.data.filter(workflow => 
        JSON.stringify(workflow).includes(projectId)
      );
      
      if (foundInAny.length > 0) {
        console.log(`Found ${foundInAny.length} workflows that mention this project ID somewhere in their data`);
        projectWorkflows = foundInAny;
      } else {
        console.log(`No workflows found that mention project ID: ${projectId}`);
        
        // Set up a default location and download all workflows
        console.log('Downloading all workflows instead');
        
        // Create project directory
        let projectDir;
        if (outputDir) {
          projectDir = outputDir;
        } else {
          const defaultDirName = `All_Workflows_${new Date().toISOString().split('T')[0]}`;
          projectDir = path.join(process.cwd(), defaultDirName);
        }
        
        console.log(`Creating directory for all workflows: ${projectDir}`);
        await ensureDir(projectDir);
        await ensureDir(path.join(projectDir, 'workflows'));
        
        // Download all workflows
        console.log(`Downloading all ${allWorkflows.data.length} workflows...`);
        const downloadedWorkflows = [];
        
        for (const workflow of allWorkflows.data) {
          const workflowMetadata = await downloadWorkflow(workflow.id, apiClient, projectDir);
          if (workflowMetadata) {
            downloadedWorkflows.push(workflowMetadata);
          }
        }
        
        return {
          projectId: 'all_workflows',
          projectName: 'All Workflows',
          projectDir,
          workflows: downloadedWorkflows
        };
      }
    }
    
    console.log(`Found ${projectWorkflows.length} workflows for project: ${projectId}`);
    
    // Try to get project name from any workflow
    let projectName = `Project_${projectId}`;
    if (projectWorkflows.length > 0 && projectWorkflows[0].project) {
      projectName = projectWorkflows[0].project.name || projectName;
    }
    
    // Create project directory with safe name
    const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const projectDir = outputDir || path.join(process.cwd(), safeName);
    console.log(`Creating project directory: ${projectDir}`);
    await ensureDir(projectDir);
    await ensureDir(path.join(projectDir, 'workflows'));
    await ensureDir(path.join(projectDir, 'design'));
    
    // Create a file with API diagnostic information
    const diagnosticInfo = {
      project_id: projectId,
      project_name: projectName,
      timestamp: new Date().toISOString(),
      total_workflows_found: projectWorkflows.length,
      project_metadata: {
        id: projectId,
        name: projectName
      }
    };
    
    await fs.writeFile(
      path.join(projectDir, 'api_diagnostics.json'),
      JSON.stringify(diagnosticInfo, null, 2)
    );
    
    // Create config.ini with project metadata
    const configContent = `[project]
name = ${projectName}
id = ${projectId}
downloaded_at = ${new Date().toISOString()}
workflow_count = ${projectWorkflows.length}
`;
    
    await fs.writeFile(path.join(projectDir, 'config.ini'), configContent);
    
    // Download each workflow
    console.log(`Downloading ${projectWorkflows.length} workflows...`);
    const downloadedWorkflows = [];
    
    for (const workflow of projectWorkflows) {
      const workflowMetadata = await downloadWorkflow(workflow.id, apiClient, projectDir);
      if (workflowMetadata) {
        downloadedWorkflows.push(workflowMetadata);
      }
    }
    
    const result = {
      projectId,
      projectName,
      projectDir,
      workflows: downloadedWorkflows
    };
    
    console.log(`\nProject download details:
- Project name: ${projectName}
- Project ID: ${projectId}
- Project directory: ${projectDir}
- Downloaded workflows: ${downloadedWorkflows.length}
`);
    
    return result;
  } catch (error) {
    console.error(`Error downloading workflows for project ${projectId}:`, error.message);
    throw error;
  }
}

// Main download function
async function download(urlOrId, options = {}) {
  try {
    console.log('Starting download process...');
    
    // Get API key from options or .env
    const apiKey = options.apiKey || process.env.PIPEDREAM_API_KEY;
    if (!apiKey) {
      console.error('Error: API key is required. Provide via --apiKey option or set PIPEDREAM_API_KEY in .env file');
      process.exit(1);
    }
    
    // Initialize API client
    const apiClient = new PipedreamApiClient(apiKey);
    
    // Determine if input is a URL or direct ID
    let resourceType, resourceId;
    
    if (urlOrId.startsWith('http')) {
      // Parse URL to extract resource type and ID
      try {
        const parsedUrl = parsePipedreamUrl(urlOrId);
        resourceType = parsedUrl.type;
        
        if (resourceType === 'project') {
          resourceId = parsedUrl.projectId;
        } else if (resourceType === 'workflow') {
          resourceId = parsedUrl.workflowId;
        }
      } catch (error) {
        console.error(`Error parsing URL: ${error.message}`);
        process.exit(1);
      }
    } else if (urlOrId.startsWith('proj_')) {
      // Direct project ID
      resourceType = 'project';
      resourceId = urlOrId;
    } else if (urlOrId.startsWith('p_')) {
      // Direct workflow ID
      resourceType = 'workflow';
      resourceId = urlOrId;
    } else {
      console.error('Error: Invalid input format. Provide a Pipedream URL or resource ID');
      process.exit(1);
    }
    
    // Create output directory if specified
    let outputDir = process.cwd();
    if (options.outputDir) {
      outputDir = options.outputDir;
      await ensureDir(outputDir);
    }
    
    // Download based on resource type
    if (resourceType === 'project') {
      console.log(`Downloading project: ${resourceId}`);
      
      // Download by filtering workflows by project ID
      const projectResult = await downloadWorkflowsByProjectId(resourceId, apiClient, outputDir);
      
      console.log('\n' + '-'.repeat(50));
      console.log(`✅ Project download complete!`);
      console.log(`   - Project: ${projectResult.projectName}`);
      console.log(`   - ID: ${projectResult.projectId}`);
      console.log(`   - Workflows downloaded: ${projectResult.workflows.length}`);
      console.log(`   - Download location: ${projectResult.projectDir}`);
      console.log('-'.repeat(50) + '\n');
      
      // Create API diagnostics file
      try {
        const diagnosticInfo = {
          project_id: projectResult.projectId || 'all_workflows',
          project_name: projectResult.projectName || 'All Workflows',
          timestamp: new Date().toISOString(),
          total_workflows_found: projectResult.workflows ? projectResult.workflows.length : 0,
          project_metadata: {
            id: projectResult.projectId || 'all_workflows',
            name: projectResult.projectName || 'All Workflows'
          }
        };
        
        await fs.writeFile(
          path.join(projectResult.projectDir, 'api_diagnostics.json'),
          JSON.stringify(diagnosticInfo, null, 2)
        );
      } catch (e) {
        console.log(`Warning: Could not write API diagnostics file: ${e.message}`);
      }
      
    } else if (resourceType === 'workflow') {
      console.log(`Downloading workflow: ${resourceId}`);
      
      // Create workflow directory structure
      const workflowsDir = path.join(outputDir, 'workflows');
      await ensureDir(workflowsDir);
      
      const workflowMetadata = await downloadWorkflow(resourceId, apiClient, outputDir);
      
      if (workflowMetadata) {
        console.log('\n' + '-'.repeat(50));
        console.log(`✅ Workflow download complete!`);
        console.log(`   - Workflow: ${workflowMetadata.name}`);
        console.log(`   - ID: ${workflowMetadata.id}`);
        console.log(`   - Download location: ${workflowMetadata.directory}`);
        console.log('-'.repeat(50) + '\n');
      } else {
        console.error('Failed to download workflow');
        process.exit(1);
      }
    }
    
    console.log('Download completed successfully!');
    // Explicitly exit with success code
    process.exit(0);
  } catch (error) {
    console.error('Error downloading from Pipedream:', error.message);
    process.exit(1);
  }
}

module.exports = { download };