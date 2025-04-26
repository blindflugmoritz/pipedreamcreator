const fs = require('fs').promises;
const path = require('path');
const ini = require('ini');
const https = require('https');
require('dotenv').config();
const { Table } = require('console-table-printer');

/**
 * Make a GraphQL request to Pipedream API
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
          updated_at: entry.mtime ? new Date(entry.mtime * 1000).toLocaleString() : 'Unknown',
          path: entry.dirname
        };
        
        workflows.push(workflow);
      }
    }
  }
  
  return workflows;
}

/**
 * Get project ID from config.ini file
 * @returns {Promise<string|null>} Project ID or null if not found
 */
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

/**
 * List workflows for a Pipedream project
 * @param {Object} options Command options
 */
async function listWorkflows(options) {
  try {
    // Get API key from options or .env
    const apiKey = options.apiKey || process.env.PIPEDREAM_API_KEY;
    if (!apiKey) {
      console.error('Error: API key is required. Provide via --apiKey option or set PIPEDREAM_API_KEY in .env file');
      process.exit(1);
    }
    
    // Get project information
    let projectId = options.project;
    
    // If project ID is not provided directly, try to read from config.ini
    if (!projectId) {
      projectId = await getProjectIdFromConfig();
      if (projectId) {
        console.log(`Found project ID in config: ${projectId}`);
      }
    }
    
    if (!projectId) {
      console.error('Error: Project ID is required. Provide via --project option or ensure config.ini contains project.id');
      process.exit(1);
    }
    
    // Get workflows for the project using GraphQL
    console.log(`Fetching workflows for project: ${projectId}`);
    
    let graphqlResponse;
    try {
      graphqlResponse = await makeGraphQLRequest(projectId, apiKey);
      
      // Add debug logging if verbose option is enabled
      if (options.verbose) {
        console.log('GraphQL Response:', JSON.stringify(graphqlResponse, null, 2));
      }
    } catch (error) {
      console.error(`Failed to fetch workflows: ${error.message}`);
      process.exit(1);
    }
    
    const workflows = extractWorkflowsFromGraphQL(graphqlResponse);
    
    // If no workflows were found and verbose is enabled, show the raw response
    if (workflows.length === 0 && options.verbose) {
      console.log('Raw response data:', JSON.stringify(graphqlResponse?.data, null, 2));
    }
    
    if (workflows.length === 0) {
      console.log('No workflows found for this project.');
      process.exit(0);
    }
    
    // Display workflows in a table
    const table = new Table({
      columns: [
        { name: 'id', title: 'ID', alignment: 'left' },
        { name: 'name', title: 'Name', alignment: 'left' },
        { name: 'active', title: 'Status', alignment: 'left', formatter: (value) => value ? 'Active' : 'Inactive' },
        { name: 'updated_at', title: 'Last Updated', alignment: 'left' }
      ]
    });
    
    workflows.forEach(workflow => {
      table.addRow(workflow);
    });
    
    table.printTable();
    console.log(`Total workflows: ${workflows.length}`);
    
    // Exit successfully
    process.exit(0);
  } catch (error) {
    console.error('Error listing workflows:', error.message);
    process.exit(1);
  }
}

module.exports = { listWorkflows };