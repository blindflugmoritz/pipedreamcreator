const fs = require('fs').promises;
const path = require('path');
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

// Helper function to parse Pipedream URLs
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
    
    // Look for project or workflow IDs in the path
    for (const part of pathParts) {
      if (part.startsWith('proj_')) {
        console.log(`Found project ID: ${part}`);
        return {
          type: 'project',
          projectId: part
        };
      } else if (part.startsWith('p_')) {
        console.log(`Found workflow ID: ${part}`);
        return {
          type: 'workflow',
          workflowId: part
        };
      }
    }
    
    console.error('Could not find project or workflow ID in URL');
    throw new Error('Invalid Pipedream URL format');
  } catch (error) {
    console.error(`URL parsing error:`, error);
    throw new Error(`Failed to parse Pipedream URL: ${error.message}`);
  }
}

// Download a single workflow
async function downloadWorkflow(workflowId, apiClient, outputDir, orgId = null) {
  try {
    console.log(`Downloading workflow: ${workflowId}`);
    
    // Get workflow details
    const workflow = await apiClient.getWorkflow(workflowId, orgId);
    
    if (!workflow || !workflow.data) {
      throw new Error(`Failed to fetch workflow: ${workflowId}`);
    }
    
    // Get workflow code
    let workflowCode;
    try {
      workflowCode = await apiClient.getWorkflowCode(workflowId, orgId);
    } catch (codeError) {
      console.warn(`Could not fetch workflow code: ${codeError.message}`);
      // Create placeholder code
      workflowCode = {
        data: {
          code: `// Placeholder for workflow: ${workflowId}\n// Code could not be fetched\n`
        }
      };
    }
    
    // Create workflow directory
    const workflowDir = path.join(outputDir, 'workflows', workflowId);
    await ensureDir(workflowDir);
    
    // Save workflow metadata
    const metadata = {
      id: workflowId,
      name: workflow.data.name || workflow.data.settings?.name || 'Unnamed Workflow',
      description: workflow.data.description || workflow.data.settings?.description || '',
      active: workflow.data.active || workflow.data.settings?.active || false,
      created_at: workflow.data.created_at || new Date().toISOString(),
      updated_at: workflow.data.updated_at,
      project_id: workflow.data.project_id
    };
    
    // Handle trigger information
    const components = workflow.data.components || [];
    const trigger = components.find(c => c.key === 'trigger' || c.type === 'source');
    
    if (trigger) {
      if (trigger.app === 'http') {
        metadata.trigger = {
          type: 'http'
        };
        metadata.webhook_url = `https://webhook.pipedream.com/v1/sources/${workflowId}/events`;
      } else if (trigger.app === 'schedule' && trigger.source?.cron) {
        metadata.trigger = {
          type: 'schedule',
          schedule: trigger.source.cron
        };
      }
    }
    
    // Save workflow files
    await fs.writeFile(
      path.join(workflowDir, 'workflow.json'),
      JSON.stringify(metadata, null, 2)
    );
    
    await fs.writeFile(
      path.join(workflowDir, 'code.js'),
      workflowCode.data.code || '// Empty workflow code'
    );
    
    console.log(`✅ Downloaded workflow: ${metadata.name} (${workflowId})`);
    return metadata;
  } catch (error) {
    console.error(`Error downloading workflow ${workflowId}:`, error.message);
    return null;
  }
}

// Download all workflows in a project
async function downloadProject(projectId, apiClient, outputDir, orgId = null) {
  try {
    console.log(`Downloading project: ${projectId}`);
    
    // Get workflows in project
    const projectWorkflows = await apiClient.getProjectWorkflows(projectId, orgId);
    
    if (!projectWorkflows || !projectWorkflows.data) {
      throw new Error(`Failed to fetch workflows for project: ${projectId}`);
    }
    
    if (projectWorkflows.data.length === 0) {
      console.log(`No workflows found in project: ${projectId}`);
      return {
        projectId,
        workflows: []
      };
    }
    
    // Create project directory
    const projectName = `Project_${projectId}`;
    const projectDir = path.join(outputDir);
    await ensureDir(projectDir);
    await ensureDir(path.join(projectDir, 'workflows'));
    
    // Create config.ini
    const configContent = `[project]
name = ${projectName}
id = ${projectId}
downloaded_at = ${new Date().toISOString()}
workflow_count = ${projectWorkflows.data.length}
`;
    
    await fs.writeFile(path.join(projectDir, 'config.ini'), configContent);
    
    // Download each workflow
    console.log(`Downloading ${projectWorkflows.data.length} workflows...`);
    const downloadedWorkflows = [];
    
    for (const workflow of projectWorkflows.data) {
      const workflowMetadata = await downloadWorkflow(workflow.id, apiClient, projectDir, orgId);
      if (workflowMetadata) {
        downloadedWorkflows.push(workflowMetadata);
      }
    }
    
    console.log(`\nProject download complete!`);
    console.log(`- Workflows downloaded: ${downloadedWorkflows.length}/${projectWorkflows.data.length}`);
    console.log(`- Project directory: ${projectDir}`);
    
    return {
      projectId,
      projectName,
      workflows: downloadedWorkflows
    };
  } catch (error) {
    console.error(`Error downloading project ${projectId}:`, error.message);
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
    
    // Get organization ID
    let orgId = null;
    try {
      const userDetails = await apiClient.getUserDetails();
      if (userDetails?.data?.orgs && userDetails.data.orgs.length > 0) {
        orgId = userDetails.data.orgs[0].id;
        console.log(`Using organization ID: ${orgId}`);
      }
    } catch (error) {
      console.error('Warning: Could not determine organization ID:', error.message);
    }
    
    // Determine resource type (project or workflow)
    let resourceType, resourceId;
    
    if (urlOrId.startsWith('http')) {
      // Parse URL to get resource type and ID
      const parsed = parsePipedreamUrl(urlOrId);
      resourceType = parsed.type;
      resourceId = parsed.projectId || parsed.workflowId;
    } else if (urlOrId.startsWith('proj_')) {
      resourceType = 'project';
      resourceId = urlOrId;
    } else if (urlOrId.startsWith('p_')) {
      resourceType = 'workflow';
      resourceId = urlOrId;
    } else {
      console.error('Error: Invalid input format. Provide a Pipedream URL or resource ID (proj_* or p_*)');
      process.exit(1);
    }
    
    // Create output directory if specified
    const outputDir = options.outputDir || process.cwd();
    await ensureDir(outputDir);
    
    // Download resource
    if (resourceType === 'project') {
      await downloadProject(resourceId, apiClient, outputDir, orgId);
    } else {
      await downloadWorkflow(resourceId, apiClient, outputDir, orgId);
    }
    
    console.log('Download completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error during download:', error.message);
    process.exit(1);
  }
}

module.exports = { download };