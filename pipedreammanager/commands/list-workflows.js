const fs = require('fs').promises;
const path = require('path');
const ini = require('ini');
const https = require('https');
require('dotenv').config();

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
    
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsedData = JSON.parse(responseData);
            resolve(parsedData);
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        } else {
          reject(new Error(`Request failed with status code ${res.statusCode}: ${responseData}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

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
      try {
        const configPath = path.join(process.cwd(), 'config.ini');
        const configContent = await fs.readFile(configPath, 'utf8');
        const config = ini.parse(configContent);
        
        if (config.project && config.project.id) {
          projectId = config.project.id;
          console.log(`Found project ID in config: ${projectId}`);
        }
      } catch (error) {
        console.error('Error reading config.ini file:', error.message);
        console.error('Please provide a project ID with --project option or run this command from a project directory');
        process.exit(1);
      }
    }
    
    if (!projectId) {
      console.error('Error: Project ID is required. Provide via --project option or ensure config.ini contains project.id');
      process.exit(1);
    }
    
    // Get workflows for the project
    console.log(`Fetching workflows for project: ${projectId}`);
    const workflows = await makeApiRequest('GET', `/projects/${projectId}/workflows`, apiKey);
    
    if (!workflows || !workflows.data) {
      console.error('Error: Failed to fetch workflows');
      process.exit(1);
    }
    
    if (workflows.data.length === 0) {
      console.log('No workflows found for this project.');
      return;
    }
    
    // Display workflows
    console.log('\nWorkflows:');
    console.log('-'.repeat(80));
    console.log(`${'ID'.padEnd(20)} | ${'Name'.padEnd(40)} | Status`);
    console.log('-'.repeat(80));
    
    workflows.data.forEach(workflow => {
      const id = workflow.id.padEnd(20);
      const name = (workflow.settings?.name || 'Unnamed Workflow').padEnd(40);
      const status = workflow.settings?.active ? 'Active' : 'Inactive';
      
      console.log(`${id} | ${name} | ${status}`);
    });
    
    console.log('-'.repeat(80));
    console.log(`Total workflows: ${workflows.data.length}`);
    
  } catch (error) {
    console.error('Error listing workflows:', error.message);
    process.exit(1);
  }
}

module.exports = { listWorkflows };