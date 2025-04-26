const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const ini = require('ini');
require('dotenv').config();

// Simple function to ensure a directory exists
async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

// Parse a Pipedream URL to extract workflow or project ID
function extractIdFromUrl(url) {
  try {
    // Check if it's a URL
    if (!url.startsWith('http')) {
      // If it's just an ID, return it directly
      if (url.startsWith('p_')) {
        return { type: 'workflow', id: url };
      } else if (url.startsWith('proj_')) {
        return { type: 'project', id: url };
      } else {
        return { type: 'unknown', id: url };
      }
    }
    
    console.log(`Parsing URL: ${url}`);
    
    // Simple URL parsing to extract IDs
    const parts = url.split('/');
    
    // Look for workflow or project IDs in the parts
    for (const part of parts) {
      if (part.startsWith('p_')) {
        console.log(`Found workflow ID in URL: ${part}`);
        return { type: 'workflow', id: part };
      }
      if (part.startsWith('proj_')) {
        console.log(`Found project ID in URL: ${part}`);
        return { type: 'project', id: part };
      }
    }
    
    console.log(`Could not find workflow or project ID in URL.`);
    return null;
  } catch (error) {
    console.error(`Error parsing URL: ${error.message}`);
    return null;
  }
}

/**
 * Make a GraphQL request to Pipedream API to get project workflows
 * @param {string} projectId The project ID
 * @param {string} apiKey Pipedream API key
 * @param {number} first Number of items to fetch (pagination)
 * @param {string} after Cursor for pagination
 * @returns {Promise<Object>} GraphQL response data
 */
async function makeGraphQLRequest(projectId, apiKey, first = 50, after = null) {
  return new Promise((resolve, reject) => {
    // Create the GraphQL query exactly matching Pipedream's UI query structure
    const variables = {
      "filesystemEntriesAfter": 0,
      "filesystemEntriesFirst": 50,
      "filesystemEntriesOrderBy": [],
      "filesystemEntriesPath": "/",
      "id": projectId,
      "withFilesystemEntries": true
    };
    
    // Create the request payload with persisted query hash
    const payload = {
      operationName: "project",
      variables: variables,
      extensions: {
        persistedQuery: {
          sha256Hash: "c63f9b48253705e21613676bac9271286e0fb7f01bb009d5829c00e60623055c",
          version: 1
        }
      }
    };

    // URL encode the variables and extensions
    const queryParams = `operationName=project&variables=${encodeURIComponent(JSON.stringify(variables))}&extensions=${encodeURIComponent(JSON.stringify(payload.extensions))}`;

    // Prepare the request options
    const options = {
      hostname: 'api.pipedream.com',
      port: 443,
      path: `/graphql?${queryParams}`,
      method: 'GET', // Pipedream UI uses GET for this query
      headers: {
        'Accept': 'application/graphql-response+json, application/graphql+json, application/json, text/event-stream, multipart/mixed',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'pdmanager-cli',
        'Origin': 'https://pipedream.com',
        'Referer': `https://pipedream.com/@/projects/${projectId}/tree`,
        'X-Pd-Ajax': '1'
      }
    };

    console.log(`Making GraphQL request for project: ${projectId}`);
    
    // Send the request
    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          
          if (res.statusCode !== 200) {
            reject(new Error(`API returned status ${res.statusCode}: ${JSON.stringify(jsonData)}`));
            return;
          }

          if (jsonData.errors) {
            reject(new Error(`GraphQL errors: ${JSON.stringify(jsonData.errors)}`));
            return;
          }

          resolve(jsonData);
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });

    // No body for GET request
    req.end();
  });
}

/**
 * Extract workflows from GraphQL response
 * @param {Object} data GraphQL response data
 * @returns {Array} Array of workflow objects
 */
function extractWorkflowsFromGraphQL(data) {
  const workflows = [];
  
  // Check if we have the project data
  if (!data.data?.project) {
    return workflows;
  }
  
  // Check for filesystemEntries array (the structure used in the API)
  if (Array.isArray(data.data.project.filesystemEntries)) {
    for (const entry of data.data.project.filesystemEntries) {
      // Look for entries with pipeline property which contains workflow info
      if (entry.pipeline) {
        const workflow = {
          id: entry.pipeline.id || 'unknown',
          name: entry.pipeline.name || 'Unnamed Workflow',
          active: !(entry.pipeline.inactive || entry.pipeline.archived),
          updated_at: entry.mtime ? new Date(entry.mtime * 1000).toISOString() : new Date().toISOString(),
          path: entry.dirname
        };
        
        workflows.push(workflow);
      }
    }
  }
  
  return workflows;
}

// API request function for individual workflow details
function makeWorkflowApiRequest(workflowId, apiKey, orgId) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.pipedream.com',
      port: 443,
      path: `/v1/workflows/${workflowId}?org_id=${orgId}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    };
    
    console.log(`Making API request: GET https://api.pipedream.com${options.path}`);
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          console.error(`API request failed with status ${res.statusCode}: ${data}`);
          reject(`Failed with status ${res.statusCode}: ${data}`);
        }
      });
    });
    
    req.on('error', (e) => {
      console.error(`Request error: ${e.message}`);
      reject(e);
    });
    req.end();
  });
}

// Extract code from the workflow data
async function extractCodeFromWorkflow(workflow) {
  // The code is typically in the steps array, in a CodeCell component
  if (workflow && workflow.steps) {
    for (const step of workflow.steps) {
      if (step.type === 'CodeCell' && step.savedComponent && step.savedComponent.code) {
        return step.savedComponent.code;
      }
    }
  }
  
  // Default code if none found
  return `// No code found for this workflow\n// Created: ${new Date().toISOString()}\n`;
}

/**
 * Download a single workflow by ID
 * @param {string} workflowId The workflow ID to download
 * @param {string} apiKey The Pipedream API key
 * @param {Object} options Download options
 * @param {string} [projectDir=null] Optional project directory when downloading as part of a project
 * @returns {Promise<Object>} Result with success status and information
 */
async function downloadSingleWorkflow(workflowId, apiKey, options = {}, projectDir = null) {
  try {
    console.log(`\nDownloading workflow: ${workflowId}`);
    
    // Try both org IDs
    const orgIds = ["o_xeIro4n", "o_PwIjJKm"];
    let workflow = null;
    let successOrgId = null;
    
    for (const orgId of orgIds) {
      try {
        console.log(`Trying with organization ID: ${orgId}`);
        workflow = await makeWorkflowApiRequest(workflowId, apiKey, orgId);
        
        // Show verbose response if option enabled
        if (options.verbose) {
          console.log('API Response:', JSON.stringify(workflow, null, 2));
        }
        
        console.log(`Success with organization ID: ${orgId}`);
        successOrgId = orgId;
        break; // Exit the loop if successful
      } catch (error) {
        console.log(`Failed with organization ID ${orgId}: ${error}`);
      }
    }
    
    if (!workflow) {
      throw new Error(`Could not fetch workflow with any organization ID`);
    }
    
    // Extract code from the workflow data
    const code = await extractCodeFromWorkflow(workflow);
    
    // Determine the base directory to save files
    let outputDir;
    if (projectDir) {
      // If downloading as part of a project, use project directory
      outputDir = projectDir;
    } else {
      // Otherwise use specified outputDir or current directory
      outputDir = options.outputDir || process.cwd();
    }
    
    const workflowsDir = path.join(outputDir, 'workflows');
    const workflowDir = path.join(workflowsDir, workflowId);
    
    await ensureDir(workflowsDir);
    await ensureDir(workflowDir);
    
    // Determine the workflow name
    let workflowName = `Workflow_${workflowId}`;
    if (workflow.name) {
      workflowName = workflow.name;
    }
    
    // Save workflow details
    const metadata = {
      id: workflowId,
      name: workflowName,
      created_at: workflow.created_at || new Date().toISOString(),
      updated_at: workflow.updated_at || new Date().toISOString(),
      project_id: workflow.project_id,
      description: workflow.description || "",
      org_id: successOrgId
    };
    
    // Extract trigger information if available
    if (workflow.triggers && workflow.triggers.length > 0) {
      const trigger = workflow.triggers[0];
      if (trigger.endpoint_url) {
        metadata.trigger = { type: 'http' };
        metadata.webhook_url = trigger.endpoint_url;
      }
    }
    
    // Save files
    await fs.writeFile(
      path.join(workflowDir, 'workflow.json'),
      JSON.stringify(metadata, null, 2)
    );
    
    await fs.writeFile(
      path.join(workflowDir, 'code.js'),
      code
    );
    
    console.log(`✅ Successfully downloaded workflow: ${workflowName} (${workflowId})`);
    console.log(`   - Saved to: ${workflowDir}`);
    
    return {
      success: true,
      id: workflowId,
      name: workflowName,
      path: workflowDir
    };
  } catch (error) {
    console.error(`❌ Error downloading workflow ${workflowId}: ${error}`);
    return {
      success: false,
      id: workflowId,
      error: error.message
    };
  }
}

/**
 * Create a project config file
 * @param {string} projectDir Directory to create the config file in
 * @param {Object} projectData Project data
 * @param {string} apiKey Pipedream API key
 * @returns {Promise<void>}
 */
async function createProjectConfig(projectDir, projectData, apiKey) {
  try {
    const configData = {
      project: {
        name: projectData.name,
        id: projectData.id,
        created_at: new Date().toISOString()
      },
      pipedream: {
        apikey: apiKey
      }
    };
    
    const configPath = path.join(projectDir, 'config.ini');
    const configContent = ini.stringify(configData);
    
    await fs.writeFile(configPath, configContent);
    console.log(`✅ Created project configuration file: ${configPath}`);
  } catch (error) {
    console.error(`❌ Error creating project config: ${error.message}`);
  }
}

/**
 * Download a project and all its workflows
 * @param {string} projectId The project ID
 * @param {string} apiKey The Pipedream API key
 * @param {Object} options Download options
 * @returns {Promise<void>}
 */
async function downloadProject(projectId, apiKey, options = {}) {
  try {
    console.log(`\n📁 Downloading project: ${projectId}`);
    
    // Get project data using GraphQL
    const graphqlResponse = await makeGraphQLRequest(projectId, apiKey);
    
    // Show verbose response if option enabled
    if (options.verbose) {
      console.log('GraphQL Response:', JSON.stringify(graphqlResponse, null, 2));
    }
    
    if (!graphqlResponse.data?.project) {
      throw new Error(`Could not fetch project data for ${projectId}`);
    }
    
    const projectData = graphqlResponse.data.project;
    console.log(`Found project: ${projectData.name}`);
    
    // Extract workflows
    const workflows = extractWorkflowsFromGraphQL(graphqlResponse);
    console.log(`Found ${workflows.length} workflows in project`);
    
    if (workflows.length === 0) {
      console.log(`No workflows found in project ${projectId}`);
      return;
    }
    
    // Create project directory
    const outputBaseDir = options.outputDir || process.cwd();
    const projectDirName = projectData.name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const projectDir = path.join(outputBaseDir, projectDirName);
    
    await ensureDir(projectDir);
    console.log(`Created project directory: ${projectDir}`);
    
    // Create project config file
    await createProjectConfig(projectDir, projectData, apiKey);
    
    // Download each workflow
    console.log(`Downloading ${workflows.length} workflows...`);
    
    const results = {
      success: 0,
      failed: 0,
      workflows: []
    };
    
    for (const workflow of workflows) {
      const result = await downloadSingleWorkflow(workflow.id, apiKey, options, projectDir);
      results.workflows.push(result);
      
      if (result.success) {
        results.success++;
      } else {
        results.failed++;
      }
    }
    
    console.log('\n📊 Download Summary:');
    console.log(`Total workflows: ${workflows.length}`);
    console.log(`Successfully downloaded: ${results.success}`);
    console.log(`Failed: ${results.failed}`);
    console.log(`Project directory: ${projectDir}`);
    
    return results;
  } catch (error) {
    console.error(`\n❌ Error downloading project: ${error.message}`);
    process.exit(1);
  }
}

// Main download function
async function download(idOrUrl, options = {}) {
  try {
    console.log(`Starting download for: ${idOrUrl}`);
    
    // Get API key from options or .env
    const apiKey = options.apiKey || process.env.PIPEDREAM_API_KEY;
    if (!apiKey) {
      console.error('Error: API key is required. Provide via --apiKey option or set PIPEDREAM_API_KEY in .env file');
      process.exit(1);
    }
    
    // Extract workflow or project ID from URL if needed
    const result = extractIdFromUrl(idOrUrl);
    
    if (!result) {
      console.error(`Could not determine ID from input. Please provide a valid workflow ID (p_XXXXX), project ID (proj_XXXXX), or URL.`);
      process.exit(1);
    }
    
    // Handle based on type
    if (result.type === 'workflow') {
      console.log(`Processing as workflow ID: ${result.id}`);
      await downloadSingleWorkflow(result.id, apiKey, options);
    } else if (result.type === 'project') {
      console.log(`Processing as project ID: ${result.id}`);
      await downloadProject(result.id, apiKey, options);
    } else {
      console.error(`Unknown ID type: ${result.id}. Please use a workflow ID (p_XXXXX) or project ID (proj_XXXXX).`);
      process.exit(1);
    }
    
    // Explicitly exit with success code
    console.log('\n✅ Download completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Error downloading: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { download };