const https = require('https');
require('dotenv').config();

/**
 * Pipedream API client for consistent API interactions
 * Handles multiple API versions, authentication, and error handling
 */
class PipedreamApiClient {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.PIPEDREAM_API_KEY;
    this.apiBaseUrl = 'api.pipedream.com';
    this.debugMode = process.env.DEBUG_API === 'true';
  }

  /**
   * Make an API request to the Pipedream API
   * 
   * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
   * @param {string} endpoint - API endpoint path
   * @param {Object} data - Request body data for POST/PUT requests
   * @param {Object} options - Additional options
   * @param {boolean} options.useV2 - Force using V2 API
   * @param {boolean} options.useV1 - Force using V1 API
   * @param {boolean} options.rawEndpoint - Use endpoint as-is without version prefix
   * @returns {Promise<Object>} - API response data
   */
  async makeRequest(method, endpoint, data = null, options = {}) {
    // Determine API version to use
    let apiPath = this._buildApiPath(endpoint, options);
    
    if (this.debugMode) {
      console.log(`API Request: ${method} ${apiPath}`);
    }

    return new Promise((resolve, reject) => {
      const requestOptions = {
        hostname: this.apiBaseUrl,
        port: 443,
        path: apiPath,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      };
      
      const req = https.request(requestOptions, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsedData = JSON.parse(responseData);
              if (this.debugMode) {
                console.log(`API request successful: ${method} ${apiPath}`);
              }
              resolve(parsedData);
            } catch (error) {
              reject(new Error(`Failed to parse response: ${error.message}`));
            }
          } else {
            const errorMessage = `Request failed with status code ${res.statusCode}: ${responseData}`;
            if (this.debugMode) {
              console.error(`API request failed: ${method} ${apiPath} - Status: ${res.statusCode}`);
              console.error(`Response: ${responseData}`);
            }
            reject(new Error(errorMessage));
          }
        });
      });
      
      req.on('error', (error) => {
        if (this.debugMode) {
          console.error(`API request error: ${method} ${apiPath}`, error);
        }
        reject(error);
      });
      
      if (data) {
        req.write(JSON.stringify(data));
      }
      
      req.end();
    });
  }

  /**
   * Build the API path with appropriate version prefix
   * 
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Options for path building
   * @returns {string} - Complete API path
   */
  _buildApiPath(endpoint, options = {}) {
    // If the endpoint already includes a version, use it as is
    if (endpoint.startsWith('/v1/') || endpoint.startsWith('/v2/')) {
      return endpoint;
    }
    
    // If the endpoint should be used without version prefix
    if (options.rawEndpoint) {
      return endpoint;
    }
    
    // Force specific API version if requested
    if (options.useV2) {
      return `/v2${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    }
    
    if (options.useV1) {
      return `/v1${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    }
    
    // Default to v1 if no version is specified
    return `/v1${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  }

  /**
   * Get user details from the API
   * 
   * @returns {Promise<Object>} - User details
   */
  async getUserDetails() {
    try {
      return await this.makeRequest('GET', '/users/me');
    } catch (error) {
      console.error('Failed to fetch user details:', error.message);
      throw error;
    }
  }

  /**
   * Try both V1 and V2 APIs, returning the first successful response
   * 
   * @param {string} method - HTTP method
   * @param {string} endpointV1 - V1 API endpoint
   * @param {string} endpointV2 - V2 API endpoint (default adds v2 prefix to v1)
   * @param {Object} data - Request data
   * @returns {Promise<Object>} - API response data
   */
  async tryBothVersions(method, endpointV1, endpointV2 = null, data = null) {
    const v2Endpoint = endpointV2 || endpointV1;
    
    try {
      // Try V2 first (newer API)
      console.log(`Trying V2 API: ${v2Endpoint}`);
      return await this.makeRequest(method, v2Endpoint, data, { useV2: true });
    } catch (v2Error) {
      console.log(`V2 API failed (${v2Error.message}), trying V1...`);
      try {
        // Fall back to V1
        return await this.makeRequest(method, endpointV1, data, { useV1: true });
      } catch (v1Error) {
        console.error(`Both V1 and V2 API requests failed`);
        console.error(`- V2 error: ${v2Error.message}`);
        console.error(`- V1 error: ${v1Error.message}`);
        throw new Error(`API request failed on both V1 and V2: ${v1Error.message}`);
      }
    }
  }

  /**
   * Get projects for the current user or organization
   * 
   * @param {string} orgId - Optional organization ID
   * @returns {Promise<Object>} - Projects data
   */
  async getProjects(orgId = null) {
    if (orgId) {
      try {
        // Try org endpoint first
        return await this.makeRequest('GET', `/organizations/${orgId}/projects`);
      } catch (orgError) {
        // Fall back to workspace endpoint
        console.log(`Organization projects endpoint failed, trying workspace endpoint...`);
        return await this.makeRequest('GET', `/workspaces/${orgId}/projects`);
      }
    } else {
      // Get user projects
      return await this.makeRequest('GET', '/users/me/projects');
    }
  }

  /**
   * Get workflows for a specific project
   * 
   * @param {string} projectId - Project ID
   * @returns {Promise<Object>} - Workflows data
   */
  async getProjectWorkflows(projectId) {
    try {
      // Try direct projects endpoint
      return await this.makeRequest('GET', `/projects/${projectId}/workflows`);
    } catch (error) {
      console.log(`Direct project workflows endpoint failed: ${error.message}`);
      
      // Get user details to try org-specific endpoints
      const userDetails = await this.getUserDetails();
      
      if (userDetails?.data?.orgs && userDetails.data.orgs.length > 0) {
        // Try each organization
        for (const org of userDetails.data.orgs) {
          try {
            console.log(`Trying organization ${org.name} (${org.id}) endpoint...`);
            return await this.makeRequest(
              'GET', 
              `/organizations/${org.id}/projects/${projectId}/workflows`
            );
          } catch (orgError) {
            console.log(`Organization endpoint failed: ${orgError.message}`);
            
            // Try workspace endpoint
            try {
              console.log(`Trying workspace endpoint for ${org.name}...`);
              return await this.makeRequest(
                'GET',
                `/workspaces/${org.id}/projects/${projectId}/workflows`
              );
            } catch (workspaceError) {
              console.log(`Workspace endpoint failed: ${workspaceError.message}`);
            }
          }
        }
      }
      
      // If all else fails, try the components API
      console.log(`Trying components API as fallback...`);
      return await this.makeRequest('GET', `/components/workflows?project_id=${projectId}`);
    }
  }

  /**
   * Get workflow details
   * 
   * @param {string} workflowId - Workflow ID
   * @returns {Promise<Object>} - Workflow details
   */
  async getWorkflow(workflowId) {
    try {
      return await this.tryBothVersions(
        'GET',
        `/workflows/${workflowId}`,
        `/workflows/${workflowId}`
      );
    } catch (error) {
      console.log(`Direct workflow endpoint failed: ${error.message}`);
      
      // Get user details to try user-specific endpoint
      try {
        // Try user-specific endpoint
        return await this.makeRequest('GET', `/users/me/workflows/${workflowId}`);
      } catch (userError) {
        console.log(`User-specific workflow endpoint failed: ${userError.message}`);
        
        // Get user details to try org-specific endpoints
        const userDetails = await this.getUserDetails();
        
        if (userDetails?.data?.orgs && userDetails.data.orgs.length > 0) {
          // Try first organization
          const orgId = userDetails.data.orgs[0].id;
          return await this.makeRequest('GET', `/organizations/${orgId}/workflows/${workflowId}`);
        }
        
        // If we get here, all attempts failed
        throw new Error(`Failed to get workflow ${workflowId} after trying multiple endpoints`);
      }
    }
  }

  /**
   * Get workflow code
   * 
   * @param {string} workflowId - Workflow ID
   * @returns {Promise<Object>} - Workflow code
   */
  async getWorkflowCode(workflowId) {
    try {
      return await this.tryBothVersions(
        'GET',
        `/workflows/${workflowId}/code`,
        `/workflows/${workflowId}/code`
      );
    } catch (error) {
      console.log(`Direct workflow code endpoint failed: ${error.message}`);
      
      // Try user-specific endpoint
      try {
        return await this.makeRequest('GET', `/users/me/workflows/${workflowId}/code`);
      } catch (userError) {
        console.log(`User-specific workflow code endpoint failed: ${userError.message}`);
        
        // Get user details to try org-specific endpoints
        const userDetails = await this.getUserDetails();
        
        if (userDetails?.data?.orgs && userDetails.data.orgs.length > 0) {
          // Try first organization
          const orgId = userDetails.data.orgs[0].id;
          return await this.makeRequest('GET', `/organizations/${orgId}/workflows/${workflowId}/code`);
        }
        
        // If we get here, all attempts failed
        throw new Error(`Failed to get workflow code ${workflowId} after trying multiple endpoints`);
      }
    }
  }
  
  /**
   * Get workflow triggers
   * 
   * @param {string} workflowId - Workflow ID
   * @returns {Promise<Object>} - Workflow triggers
   */
  async getWorkflowTriggers(workflowId) {
    try {
      return await this.tryBothVersions(
        'GET',
        `/workflows/${workflowId}/triggers`,
        `/workflows/${workflowId}/triggers`
      );
    } catch (error) {
      console.log(`Direct workflow triggers endpoint failed: ${error.message}`);
      
      // Try user-specific endpoint
      try {
        return await this.makeRequest('GET', `/users/me/workflows/${workflowId}/triggers`);
      } catch (userError) {
        console.log(`User-specific triggers endpoint failed: ${userError.message}`);
        
        // As a last resort, get the workflow and extract trigger info
        try {
          const workflow = await this.getWorkflow(workflowId);
          
          if (workflow?.data?.components) {
            const triggers = workflow.data.components.filter(
              comp => comp.key === 'trigger' || comp.type === 'trigger'
            );
            
            return {
              data: triggers,
              extracted: true
            };
          }
        } catch (workflowError) {
          console.log(`Failed to extract triggers from workflow: ${workflowError.message}`);
        }
        
        throw new Error(`Failed to get workflow triggers after trying multiple endpoints`);
      }
    }
  }
  
  /**
   * Get workflow steps
   * 
   * @param {string} workflowId - Workflow ID
   * @returns {Promise<Object>} - Workflow steps
   */
  async getWorkflowSteps(workflowId) {
    try {
      return await this.tryBothVersions(
        'GET',
        `/workflows/${workflowId}/steps`,
        `/workflows/${workflowId}/steps`
      );
    } catch (error) {
      console.log(`Direct workflow steps endpoint failed: ${error.message}`);
      
      // Try user-specific endpoint
      try {
        return await this.makeRequest('GET', `/users/me/workflows/${workflowId}/steps`);
      } catch (userError) {
        console.log(`User-specific steps endpoint failed: ${userError.message}`);
        
        // As a last resort, get the workflow and extract steps info
        try {
          const workflow = await this.getWorkflow(workflowId);
          
          if (workflow?.data?.components) {
            const steps = workflow.data.components.filter(
              comp => comp.key !== 'trigger' && comp.type !== 'trigger'
            );
            
            return {
              data: steps,
              extracted: true
            };
          }
        } catch (workflowError) {
          console.log(`Failed to extract steps from workflow: ${workflowError.message}`);
        }
        
        throw new Error(`Failed to get workflow steps after trying multiple endpoints`);
      }
    }
  }
}

module.exports = PipedreamApiClient;