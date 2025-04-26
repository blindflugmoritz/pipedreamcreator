const https = require('https');
require('dotenv').config();

/**
 * Simple Pipedream API client focused on reliability
 */
class PipedreamApiClient {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.PIPEDREAM_API_KEY;
    this.apiBaseUrl = 'api.pipedream.com';
  }

  /**
   * Make a simple API request to Pipedream
   * 
   * @param {string} method - HTTP method (GET, POST, etc)
   * @param {string} endpoint - API endpoint (should start with /)
   * @param {Object} data - Request body for POST/PUT requests
   * @param {string} orgId - Organization ID for scoped requests
   * @returns {Promise<Object>} - API response
   */
  async makeRequest(method, endpoint, data = null, orgId = null) {
    return new Promise((resolve, reject) => {
      // Add org_id parameter if provided
      let path = endpoint;
      if (orgId) {
        path += path.includes('?') ? `&org_id=${orgId}` : `?org_id=${orgId}`;
      }
      
      // Add API version if not included
      if (!path.startsWith('/v1/') && !path.startsWith('/v2/')) {
        path = `/v1${path.startsWith('/') ? path : '/' + path}`;
      }
      
      const options = {
        hostname: this.apiBaseUrl,
        port: 443,
        path: path,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      };
      
      console.log(`API Request: ${method} ${path}`);
      
      const req = https.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsedData = JSON.parse(responseData);
              console.log(`API request successful: ${res.statusCode}`);
              resolve(parsedData);
            } catch (error) {
              console.error(`Failed to parse response: ${error.message}`);
              reject(new Error(`Failed to parse response: ${error.message}`));
            }
          } else {
            console.error(`API request failed: ${res.statusCode}`);
            console.error(`Response: ${responseData}`);
            reject(new Error(`Request failed with status code ${res.statusCode}: ${responseData}`));
          }
        });
      });
      
      req.on('error', (error) => {
        console.error(`API request error: ${error.message}`);
        reject(error);
      });
      
      if (data) {
        req.write(JSON.stringify(data));
      }
      
      req.end();
    });
  }

  /**
   * Get user details
   * 
   * @returns {Promise<Object>} User data
   */
  async getUserDetails() {
    try {
      return await this.makeRequest('GET', '/users/me');
    } catch (error) {
      console.error('Failed to get user details:', error.message);
      throw error;
    }
  }

  /**
   * Get workflow by ID
   * 
   * @param {string} workflowId - Workflow ID
   * @param {string} orgId - Organization ID (optional)
   * @returns {Promise<Object>} Workflow data
   */
  async getWorkflow(workflowId, orgId = null) {
    if (!orgId) {
      try {
        // First get user details to find org ID
        const userDetails = await this.getUserDetails();
        
        if (userDetails?.data?.orgs && userDetails.data.orgs.length > 0) {
          orgId = userDetails.data.orgs[0].id;
          console.log(`Using organization ID: ${orgId}`);
        }
      } catch (error) {
        console.error('Failed to get organization ID:', error.message);
      }
    }
    
    // Direct API call with orgId if available
    try {
      return await this.makeRequest('GET', `/workflows/${workflowId}`, null, orgId);
    } catch (error) {
      console.error(`Failed to get workflow ${workflowId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get a list of workflows for a project
   * 
   * @param {string} projectId - Project ID
   * @param {string} orgId - Organization ID (optional)
   * @returns {Promise<Object>} List of workflows
   */
  async getProjectWorkflows(projectId, orgId = null) {
    if (!orgId) {
      try {
        // First get user details to find org ID
        const userDetails = await this.getUserDetails();
        
        if (userDetails?.data?.orgs && userDetails.data.orgs.length > 0) {
          orgId = userDetails.data.orgs[0].id;
          console.log(`Using organization ID: ${orgId}`);
        }
      } catch (error) {
        console.error('Failed to get organization ID:', error.message);
      }
    }
    
    // Direct API call with orgId if available
    try {
      return await this.makeRequest('GET', `/projects/${projectId}/workflows`, null, orgId);
    } catch (error) {
      console.error(`Failed to get workflows for project ${projectId}:`, error.message);
      
      // Try alternate endpoint format
      try {
        console.log('Trying alternate endpoint...');
        if (orgId) {
          return await this.makeRequest('GET', `/organizations/${orgId}/projects/${projectId}/workflows`);
        }
      } catch (altError) {
        console.error('Alternate endpoint also failed.');
      }
      
      throw error;
    }
  }

  /**
   * Get workflow code
   * 
   * @param {string} workflowId - Workflow ID
   * @param {string} orgId - Organization ID (optional)
   * @returns {Promise<Object>} Workflow code
   */
  async getWorkflowCode(workflowId, orgId = null) {
    if (!orgId) {
      try {
        // First get user details to find org ID
        const userDetails = await this.getUserDetails();
        
        if (userDetails?.data?.orgs && userDetails.data.orgs.length > 0) {
          orgId = userDetails.data.orgs[0].id;
          console.log(`Using organization ID: ${orgId}`);
        }
      } catch (error) {
        console.error('Failed to get organization ID:', error.message);
      }
    }
    
    // Direct API call with orgId if available
    try {
      return await this.makeRequest('GET', `/workflows/${workflowId}/code`, null, orgId);
    } catch (error) {
      console.error(`Failed to get workflow code ${workflowId}:`, error.message);
      throw error;
    }
  }
  
  /**
   * Create a new workflow
   * 
   * @param {Object} workflowData - Workflow data 
   * @param {string} orgId - Organization ID (optional)
   * @returns {Promise<Object>} Created workflow
   */
  async createWorkflow(workflowData, orgId = null) {
    if (!orgId && workflowData.org_id) {
      orgId = workflowData.org_id;
    }
    
    try {
      return await this.makeRequest('POST', '/workflows', workflowData, orgId);
    } catch (error) {
      console.error('Failed to create workflow:', error.message);
      throw error;
    }
  }
}

module.exports = PipedreamApiClient;