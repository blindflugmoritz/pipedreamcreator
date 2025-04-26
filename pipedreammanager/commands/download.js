const fs = require('fs').promises;
const path = require('path');
const https = require('https');
require('dotenv').config();

// Simple function to ensure a directory exists
async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

// Very simple API request function - directly mimics the curl command that works
function makeApiRequest(workflowId, apiKey, orgId) {
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

// Also get workflow code with similar direct approach
function getWorkflowCode(workflowId, apiKey, orgId) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.pipedream.com',
      port: 443, 
      path: `/v1/workflows/${workflowId}/code?org_id=${orgId}`,
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

// Simple function to download a workflow - does exactly what's needed, no more
async function download(workflowId, options = {}) {
  try {
    console.log(`Starting download for workflow: ${workflowId}`);
    
    // Get API key from options or .env
    const apiKey = options.apiKey || process.env.PIPEDREAM_API_KEY;
    if (!apiKey) {
      console.error('Error: API key is required. Provide via --apiKey option or set PIPEDREAM_API_KEY in .env file');
      process.exit(1);
    }
    
    // Use hard-coded org ID that we know works
    const orgId = "o_xeIro4n";
    console.log(`Using organization ID: ${orgId}`);
    
    // Get workflow details with direct API call
    const workflow = await makeApiRequest(workflowId, apiKey, orgId);
    
    // Get workflow code
    let workflowCode;
    try {
      workflowCode = await getWorkflowCode(workflowId, apiKey, orgId);
    } catch (error) {
      console.warn(`Could not fetch workflow code: ${error}`);
      workflowCode = { data: { code: `// Placeholder for workflow: ${workflowId}\n// Code could not be fetched\n` } };
    }
    
    // Create output directory
    const outputDir = options.outputDir || process.cwd();
    const workflowsDir = path.join(outputDir, 'workflows');
    const workflowDir = path.join(workflowsDir, workflowId);
    
    await ensureDir(workflowsDir);
    await ensureDir(workflowDir);
    
    // Save workflow details
    const metadata = {
      id: workflowId,
      name: workflow.data.name || 'Unnamed Workflow',
      description: workflow.data.description || '',
      created_at: workflow.data.created_at || new Date().toISOString(),
      project_id: workflow.data.project_id || ''
    };
    
    // Extract trigger information if available
    const components = workflow.data.components || [];
    const trigger = components.find(c => c.key === 'trigger');
    
    if (trigger) {
      if (trigger.app === 'http') {
        metadata.trigger = { type: 'http' };
        metadata.webhook_url = `https://webhook.pipedream.com/v1/sources/${workflowId}/events`;
      } else if (trigger.app === 'schedule' && trigger.source?.cron) {
        metadata.trigger = { 
          type: 'schedule',
          schedule: trigger.source.cron
        };
      }
    }
    
    // Save files
    await fs.writeFile(
      path.join(workflowDir, 'workflow.json'),
      JSON.stringify(metadata, null, 2)
    );
    
    await fs.writeFile(
      path.join(workflowDir, 'code.js'),
      workflowCode.data.code || '// Empty workflow code'
    );
    
    console.log(`✅ Successfully downloaded workflow: ${metadata.name} (${workflowId})`);
    console.log(`   - Saved to: ${workflowDir}`);
    
    return metadata;
  } catch (error) {
    console.error(`Error downloading workflow: ${error}`);
    process.exit(1);
  }
}

module.exports = { download };