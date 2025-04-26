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

// Also get workflow code - using the steps instead since there's no separate code endpoint
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
    
    // Try both org IDs
    const orgIds = ["o_xeIro4n", "o_PwIjJKm"];
    let workflow = null;
    
    for (const orgId of orgIds) {
      try {
        console.log(`Trying with organization ID: ${orgId}`);
        workflow = await makeApiRequest(workflowId, apiKey, orgId);
        console.log(`Success with organization ID: ${orgId}`);
        break; // Exit the loop if successful
      } catch (error) {
        console.log(`Failed with organization ID ${orgId}: ${error}`);
      }
    }
    
    if (!workflow) {
      throw new Error(`Could not fetch workflow with any organization ID`);
    }
    
    // Extract code from the workflow data (instead of making a separate API call)
    const code = await extractCodeFromWorkflow(workflow);
    
    // Create output directory
    const outputDir = options.outputDir || process.cwd();
    const workflowsDir = path.join(outputDir, 'workflows');
    const workflowDir = path.join(workflowsDir, workflowId);
    
    await ensureDir(workflowsDir);
    await ensureDir(workflowDir);
    
    // Determine the workflow name from the triggers or steps
    let workflowName = `Workflow_${workflowId}`;
    if (workflow.name) {
      workflowName = workflow.name;
    }
    
    // Save workflow details
    const metadata = {
      id: workflowId,
      name: workflowName,
      created_at: new Date().toISOString()
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
    
    return metadata;
  } catch (error) {
    console.error(`Error downloading workflow: ${error}`);
    process.exit(1);
  }
}

module.exports = { download };