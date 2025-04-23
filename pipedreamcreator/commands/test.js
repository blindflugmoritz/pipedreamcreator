const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');
const http = require('http');
const open = require('open');

class WorkflowTester {
  constructor(workflowPath, options = {}) {
    this.workflowPath = workflowPath;
    this.options = options;
    this.server = null;
    this.workflow = null;
    this.components = [];
    this.state = {};
    this.events = [];
    this.componentsDir = path.join(process.cwd(), 'components');
    this.workflowJsonPath = path.join(workflowPath, 'workflow.json');
    this.workflowCodePath = path.join(workflowPath, 'code.js');
  }

  async loadWorkflow() {
    // Load workflow.json
    if (!fs.existsSync(this.workflowJsonPath)) {
      throw new Error(`Workflow JSON file not found: ${this.workflowJsonPath}`);
    }

    try {
      this.workflow = JSON.parse(fs.readFileSync(this.workflowJsonPath, 'utf8'));
      
      // Check for required fields
      if (!this.workflow.id) {
        this.workflow.id = 'p_' + Math.random().toString(36).substring(2, 8).toUpperCase();
      }
      
      if (!this.workflow.name) {
        this.workflow.name = path.basename(this.workflowPath);
      }

      // Load code.js if it exists
      if (fs.existsSync(this.workflowCodePath)) {
        // Clear require cache
        delete require.cache[require.resolve(this.workflowCodePath)];
        try {
          this.workflowCode = require(this.workflowCodePath);
        } catch (error) {
          console.warn(chalk.yellow(`Warning: Failed to load workflow code.js: ${error.message}`));
        }
      }

      // Load components
      await this.loadComponents();

      return this.workflow;
    } catch (error) {
      console.error(chalk.red('Error loading workflow:'), error.message);
      throw error;
    }
  }

  async loadComponents() {
    this.components = [];
    
    // Check if the workflow has a components array
    if (!this.workflow.components || !Array.isArray(this.workflow.components)) {
      console.warn(chalk.yellow('Warning: Workflow has no components or components is not an array'));
      return;
    }

    for (const component of this.workflow.components) {
      if (!component.key) {
        console.warn(chalk.yellow(`Warning: Component missing key: ${JSON.stringify(component)}`));
        continue;
      }

      // Try to find component in components directory
      try {
        const componentPath = await this.findComponentByKey(component.key);
        if (!componentPath) {
          console.warn(chalk.yellow(`Warning: Could not find component with key: ${component.key}`));
          continue;
        }

        // Load component
        delete require.cache[require.resolve(componentPath)];
        const componentModule = require(componentPath);
        
        // Add component to list
        this.components.push({
          config: component,
          module: componentModule,
          path: componentPath
        });
        
        console.log(chalk.green(`Loaded component: ${component.key} (${componentModule.name})`));
      } catch (error) {
        console.warn(chalk.yellow(`Warning: Failed to load component ${component.key}: ${error.message}`));
      }
    }

    return this.components;
  }

  async findComponentByKey(key) {
    // Check if components directory exists
    if (!fs.existsSync(this.componentsDir)) {
      return null;
    }

    // List all component directories
    const componentDirs = fs.readdirSync(this.componentsDir)
      .filter(dir => fs.statSync(path.join(this.componentsDir, dir)).isDirectory());

    // Try to find a matching component
    for (const dir of componentDirs) {
      const componentPath = path.join(this.componentsDir, dir, 'index.mjs');
      if (fs.existsSync(componentPath)) {
        try {
          delete require.cache[require.resolve(componentPath)];
          const component = require(componentPath);
          if (component.key === key) {
            return componentPath;
          }
        } catch (error) {
          // Skip if there's an error loading the component
        }
      }

      // Alternative: try index.js
      const altComponentPath = path.join(this.componentsDir, dir, 'index.js');
      if (fs.existsSync(altComponentPath)) {
        try {
          delete require.cache[require.resolve(altComponentPath)];
          const component = require(altComponentPath);
          if (component.key === key) {
            return altComponentPath;
          }
        } catch (error) {
          // Skip if there's an error loading the component
        }
      }
    }

    return null;
  }

  mockApp(appName) {
    return {
      _client: () => {
        return {
          // Mock API client methods
          request: async (url, data) => {
            console.log(chalk.yellow(`[Mock ${appName} API] Request to ${url}`));
            console.log(data);
            return { data: { success: true, message: 'Mocked API response' } };
          }
        };
      },
      // Common app methods that can be overridden
      createWebhook: async (options) => {
        console.log(chalk.yellow(`[Mock ${appName}] Creating webhook with options:`));
        console.log(options);
        return { id: 'mock-webhook-id-' + Date.now() };
      },
      removeWebhook: async (webhookId) => {
        console.log(chalk.yellow(`[Mock ${appName}] Removing webhook: ${webhookId}`));
        return { success: true };
      }
    };
  }

  async runWorkflow(triggerEvent = {}) {
    if (!this.workflow) {
      await this.loadWorkflow();
    }

    console.log(chalk.blue(`Running workflow: ${this.workflow.name} (${this.workflow.id})`));
    
    // Reset workflow state
    this.state = {
      trigger: {
        event: triggerEvent
      }
    };
    
    // Create steps object with trigger
    const steps = {
      trigger: {
        event: triggerEvent
      }
    };

    try {
      // Run each component in order
      for (let i = 0; i < this.components.length; i++) {
        const component = this.components[i];
        const componentConfig = component.config;
        const componentModule = component.module;
        
        console.log(chalk.cyan(`Running component ${i + 1}/${this.components.length}: ${componentModule.name}`));
        
        // Skip the trigger component if it's the first one
        if (i === 0 && componentModule.type === 'source') {
          console.log(chalk.yellow('Skipping trigger component (using provided trigger event)'));
          continue;
        }
        
        // Prepare component context
        const $ = {
          export: (key, value) => {
            steps[componentConfig.key] = steps[componentConfig.key] || {};
            steps[componentConfig.key][key] = value;
            console.log(chalk.green(`Exported: ${componentConfig.key}.${key} = ${JSON.stringify(value)}`));
          },
          respond: (response) => {
            console.log(chalk.cyan('Response:'), response);
            return response;
          }
        };
        
        // Mock props
        const mockProps = {};
        if (componentModule.props) {
          for (const [key, prop] of Object.entries(componentModule.props)) {
            // For app props, mock the app
            if (prop.type === 'app') {
              mockProps[key] = this.mockApp(prop.app);
            } else {
              // For other props, use value from component config or default
              const configValue = componentConfig.config?.[key];
              mockProps[key] = configValue !== undefined ? configValue : (prop.default || '');
            }
          }
        }
        
        // Create run context
        const context = { $, steps };
        
        // Merge mocked props into component for the run
        const runComponent = {
          ...componentModule,
          ...mockProps,
          $emit: (data, meta) => {
            console.log(chalk.green('Event emitted:'));
            console.log(data);
            console.log(chalk.yellow('Metadata:'));
            console.log(meta);
            this.events.push({ data, meta });
            
            // Store in steps for the next component
            steps[componentConfig.key] = steps[componentConfig.key] || {};
            steps[componentConfig.key].event = data;
          }
        };
        
        // Execute the component's run method
        try {
          let result;
          if (componentModule.type === 'action') {
            result = await componentModule.run.call(runComponent, context);
          } else if (componentModule.type === 'source') {
            result = await componentModule.run.call(runComponent, triggerEvent);
          }
          
          // Store result in steps
          steps[componentConfig.key] = steps[componentConfig.key] || {};
          steps[componentConfig.key].returnValue = result;
          
          console.log(chalk.green(`Component ${componentModule.name} completed successfully`));
        } catch (error) {
          console.error(chalk.red(`Error running component ${componentModule.name}:`), error.message);
          steps[componentConfig.key] = steps[componentConfig.key] || {};
          steps[componentConfig.key].error = error.message;
          
          // Decide whether to continue or abort based on workflow configuration
          if (this.workflow.settings?.continueOnFailure === true) {
            console.log(chalk.yellow('Continuing workflow despite component failure (continueOnFailure=true)'));
          } else {
            throw new Error(`Workflow aborted due to component failure: ${error.message}`);
          }
        }
      }
      
      console.log(chalk.green('Workflow completed successfully'));
      return { success: true, steps, events: this.events };
    } catch (error) {
      console.error(chalk.red('Error running workflow:'), error.message);
      return { success: false, error: error.message, steps, events: this.events };
    }
  }

  async startServer() {
    if (this.server) {
      return;
    }

    const PORT = 3030; // Use a different port than the develop command
    
    this.server = http.createServer(async (req, res) => {
      if (req.url === '/') {
        // Render workflow info and UI
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(this.generateUI());
      } else if (req.url === '/run') {
        // Handle workflow run request
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        
        req.on('end', async () => {
          try {
            const triggerEvent = body ? JSON.parse(body) : {};
            const result = await this.runWorkflow(triggerEvent);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: error.message,
              stack: error.stack
            }));
          }
        });
      } else if (req.url === '/reload') {
        // Handle workflow reload request
        try {
          await this.loadWorkflow();
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            workflow: {
              id: this.workflow.id,
              name: this.workflow.name,
              components: this.components.length
            }
          }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: error.message
          }));
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    });

    return new Promise((resolve) => {
      this.server.listen(PORT, () => {
        console.log(chalk.green(`Workflow test server running at http://localhost:${PORT}`));
        resolve(PORT);
      });
    });
  }

  generateUI() {
    // Create component list for UI
    const componentsList = this.components.map((component, index) => {
      return `
        <div class="component-card">
          <div class="component-header">
            <h3>${component.module.name}</h3>
            <span class="component-type">${component.module.type.toUpperCase()}</span>
          </div>
          <div class="component-meta">
            <div class="key">${component.module.key}</div>
            <div class="version">v${component.module.version || '0.0.0'}</div>
          </div>
          <p class="description">${component.module.description || 'No description provided'}</p>
        </div>
      `;
    }).join('');

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Pipedream Workflow Tester - ${this.workflow?.name || 'Workflow'}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
          background: #f5f5f7;
          color: #333;
        }
        header {
          background: #34455E;
          color: white;
          padding: 15px 20px;
          border-radius: 5px;
          margin-bottom: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        h1 { margin: 0; }
        .container {
          display: flex;
          gap: 20px;
        }
        .left-panel {
          flex: 2;
        }
        .right-panel {
          flex: 3;
        }
        .panel {
          background: white;
          border-radius: 5px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        button {
          background: #25B799;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }
        button:hover {
          background: #1c9178;
        }
        textarea {
          width: 100%;
          min-height: 150px;
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 8px;
          font-family: monospace;
          margin-bottom: 10px;
        }
        pre {
          background: #f1f1f1;
          padding: 10px;
          border-radius: 4px;
          overflow: auto;
          max-height: 500px;
        }
        label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
        }
        .component-card {
          background: #f9f9f9;
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 10px;
          margin-bottom: 10px;
        }
        .component-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .component-header h3 {
          margin: 0;
        }
        .component-type {
          background: #25B799;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: bold;
          color: white;
        }
        .component-meta {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          margin: 5px 0;
        }
        .key {
          color: #888;
          font-family: monospace;
        }
        .description {
          color: #666;
          font-style: italic;
          margin: 5px 0 0 0;
          font-size: 14px;
        }
        .version {
          color: #888;
          font-size: 12px;
        }
        .workflow-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        #reload {
          background: #e67e22;
        }
        #reload:hover {
          background: #d35400;
        }
        .step-results {
          display: none;
          margin-top: 20px;
        }
        .step-nav {
          display: flex;
          margin-bottom: 10px;
          border-bottom: 1px solid #ddd;
        }
        .step-tab {
          padding: 8px 16px;
          cursor: pointer;
          background: #f1f1f1;
          border-radius: 4px 4px 0 0;
          margin-right: 5px;
        }
        .step-tab.active {
          background: #25B799;
          color: white;
        }
        #workflow-diagram {
          margin-top: 20px;
          padding: 15px;
          background: white;
          border-radius: 5px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        .flow-step {
          display: flex;
          align-items: center;
          margin-bottom: 15px;
        }
        .flow-number {
          width: 24px;
          height: 24px;
          border-radius: 12px;
          background: #25B799;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-right: 10px;
          font-weight: bold;
        }
        .flow-details {
          border-left: 2px solid #25B799;
          padding-left: 10px;
          padding-bottom: 15px;
        }
        .flow-arrow {
          margin-left: 12px;
          margin-bottom: 5px;
          color: #25B799;
        }
      </style>
    </head>
    <body>
      <header>
        <div>
          <h1>${this.workflow?.name || 'Workflow'}</h1>
          <div class="key">${this.workflow?.id || 'unknown'}</div>
        </div>
      </header>
      
      <div class="container">
        <div class="left-panel">
          <div class="panel">
            <div class="workflow-header">
              <h2>Workflow Components</h2>
              <button id="reload">Reload Workflow</button>
            </div>
            <div id="components-list">
              ${componentsList || 'No components found in this workflow'}
            </div>
          </div>
          
          <div id="workflow-diagram" class="panel">
            <h2>Workflow Diagram</h2>
            <div class="flow-container">
              ${this.generateWorkflowDiagram()}
            </div>
          </div>
        </div>
        
        <div class="right-panel">
          <div class="panel">
            <h2>Test Workflow</h2>
            <div>
              <label for="trigger-input">Trigger Event/Data:</label>
              <textarea id="trigger-input">{
  "body": {
    "action": "opened",
    "issue": {
      "number": 123,
      "title": "Test Issue",
      "body": "This is a test issue"
    },
    "repository": {
      "full_name": "user/repo"
    }
  },
  "headers": {
    "x-github-event": "issues"
  }
}</textarea>
            </div>
            <div>
              <button id="run">Run Workflow</button>
            </div>
          </div>
          
          <div class="panel">
            <h2>Results</h2>
            <div id="step-results" class="step-results">
              <div class="step-nav" id="step-nav"></div>
              <div id="step-content"></div>
            </div>
            <pre id="results">// Results will appear here</pre>
          </div>
        </div>
      </div>
      
      <script>
        const runButton = document.getElementById('run');
        const reloadButton = document.getElementById('reload');
        const triggerInput = document.getElementById('trigger-input');
        const resultsOutput = document.getElementById('results');
        const stepResults = document.getElementById('step-results');
        const stepNav = document.getElementById('step-nav');
        const stepContent = document.getElementById('step-content');
        
        // Run the workflow
        runButton.addEventListener('click', async () => {
          try {
            resultsOutput.textContent = 'Running workflow...';
            stepResults.style.display = 'none';
            
            let triggerEvent = {};
            try {
              triggerEvent = JSON.parse(triggerInput.value);
            } catch (e) {
              resultsOutput.textContent = 'Error parsing input JSON: ' + e.message;
              return;
            }
            
            const response = await fetch('/run', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(triggerEvent)
            });
            
            const result = await response.json();
            
            if (result.success) {
              resultsOutput.textContent = JSON.stringify(result, null, 2);
              
              // Create step navigation
              if (result.steps) {
                stepResults.style.display = 'block';
                stepNav.innerHTML = '';
                stepContent.innerHTML = '';
                
                const steps = result.steps;
                let firstTab = null;
                
                // Add trigger tab
                const triggerTab = document.createElement('div');
                triggerTab.className = 'step-tab';
                triggerTab.textContent = 'Trigger';
                triggerTab.addEventListener('click', () => {
                  document.querySelectorAll('.step-tab').forEach(tab => tab.classList.remove('active'));
                  triggerTab.classList.add('active');
                  stepContent.innerHTML = '<pre>' + JSON.stringify(steps.trigger, null, 2) + '</pre>';
                });
                stepNav.appendChild(triggerTab);
                
                if (!firstTab) firstTab = triggerTab;
                
                // Add other step tabs
                for (const [key, step] of Object.entries(steps)) {
                  if (key === 'trigger') continue;
                  
                  const tab = document.createElement('div');
                  tab.className = 'step-tab';
                  tab.textContent = key;
                  tab.addEventListener('click', () => {
                    document.querySelectorAll('.step-tab').forEach(tab => tab.classList.remove('active'));
                    tab.classList.add('active');
                    stepContent.innerHTML = '<pre>' + JSON.stringify(step, null, 2) + '</pre>';
                  });
                  stepNav.appendChild(tab);
                  
                  if (!firstTab) firstTab = tab;
                }
                
                // Activate first tab
                if (firstTab) {
                  firstTab.click();
                }
              }
            } else {
              resultsOutput.textContent = 'Error: ' + result.error + '\\n\\n' + JSON.stringify(result, null, 2);
            }
          } catch (e) {
            resultsOutput.textContent = 'Error running workflow: ' + e.message;
          }
        });
        
        // Reload the workflow
        reloadButton.addEventListener('click', async () => {
          try {
            resultsOutput.textContent = 'Reloading workflow...';
            
            const response = await fetch('/reload');
            const result = await response.json();
            
            if (result.success) {
              resultsOutput.textContent = 'Workflow reloaded successfully:\\n' + JSON.stringify(result.workflow, null, 2);
              // Reload the page to refresh workflow info
              setTimeout(() => window.location.reload(), 1000);
            } else {
              resultsOutput.textContent = 'Error reloading workflow: ' + result.error;
            }
          } catch (e) {
            resultsOutput.textContent = 'Error reloading workflow: ' + e.message;
          }
        });
      </script>
    </body>
    </html>
    `;
  }

  generateWorkflowDiagram() {
    if (!this.components || this.components.length === 0) {
      return '<p>No components to display</p>';
    }

    let diagram = '';
    
    this.components.forEach((component, index) => {
      const isLast = index === this.components.length - 1;
      
      diagram += `
        <div class="flow-step">
          <div class="flow-number">${index + 1}</div>
          <div>
            <strong>${component.module.name}</strong>
            <div class="key">${component.module.key}</div>
          </div>
        </div>
      `;
      
      if (!isLast) {
        diagram += `
          <div class="flow-arrow">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 4L12 20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <path d="M18 14L12 20L6 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        `;
      }
    });
    
    return diagram;
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
      console.log(chalk.green('Workflow test server stopped'));
    }
  }
}

class WorkflowComposer {
  constructor(options = {}) {
    this.options = options;
    this.componentsDir = path.join(process.cwd(), 'components');
    this.workflowsDir = path.join(process.cwd(), 'workflows');
  }

  async createWorkflow() {
    // Ensure workflows directory exists
    if (!fs.existsSync(this.workflowsDir)) {
      fs.mkdirSync(this.workflowsDir, { recursive: true });
    }

    // Get workflow details
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Workflow name:',
        validate: (input) => input.length > 0 || 'Workflow name is required'
      },
      {
        type: 'input',
        name: 'description',
        message: 'Workflow description (optional):',
        default: ''
      },
      {
        type: 'list',
        name: 'triggerType',
        message: 'Trigger type:',
        choices: [
          { name: 'HTTP Webhook', value: 'http' },
          { name: 'Schedule', value: 'schedule' },
          { name: 'Component Trigger', value: 'component' }
        ]
      }
    ]);

    // Get trigger details based on type
    let triggerConfig = {};
    let scheduleExpression = '';
    
    if (answers.triggerType === 'http') {
      triggerConfig = {
        type: 'http',
        path: Math.random().toString(36).substring(2, 16)
      };
    } else if (answers.triggerType === 'schedule') {
      const scheduleAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'schedule',
          message: 'Cron schedule expression (e.g. 0 0 * * * for daily at midnight):',
          default: '0 0 * * *',
          validate: (input) => {
            // Basic cron validation
            const cronParts = input.split(' ');
            return cronParts.length === 5 || 'Invalid cron expression. Use 5 space-separated values.';
          }
        }
      ]);
      
      scheduleExpression = scheduleAnswer.schedule;
      triggerConfig = {
        type: 'schedule',
        schedule: scheduleExpression
      };
    } else if (answers.triggerType === 'component') {
      // Let user select a component as trigger
      const componentOptions = await this.getAvailableComponents('source');
      
      if (componentOptions.length === 0) {
        console.error(chalk.red('No source/trigger components found. Create one first with pdcreator scaffold.'));
        process.exit(1);
      }
      
      const componentAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'component',
          message: 'Select trigger component:',
          choices: componentOptions
        }
      ]);
      
      triggerConfig = {
        type: 'component',
        component: componentAnswer.component
      };
    }

    // Generate workflow ID
    const workflowId = 'p_' + Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Create workflow directory
    const workflowDir = path.join(this.workflowsDir, workflowId);
    fs.mkdirSync(workflowDir, { recursive: true });
    
    // Build workflow components
    const components = [];
    
    // If using component trigger, add it to components
    if (answers.triggerType === 'component') {
      components.push({
        key: triggerConfig.component,
        type: 'source',
        config: {}
      });
    }

    // Select action components
    const continueAddingComponents = await this.selectWorkflowComponents(components);
    
    if (!continueAddingComponents) {
      console.log(chalk.yellow('Workflow creation canceled'));
      return;
    }

    // Create workflow.json
    const workflow = {
      id: workflowId,
      name: answers.name,
      created_at: new Date().toISOString(),
      description: answers.description,
      trigger: triggerConfig,
      components: components,
      settings: {
        continueOnFailure: false
      }
    };
    
    // Add webhook URL if using HTTP trigger
    if (answers.triggerType === 'http') {
      workflow.webhook_url = `https://pipedream.com/webhooks/${workflowId}/${triggerConfig.path}`;
    }
    
    fs.writeFileSync(
      path.join(workflowDir, 'workflow.json'),
      JSON.stringify(workflow, null, 2),
      'utf8'
    );
    
    // Create code.js file with placeholder
    fs.writeFileSync(
      path.join(workflowDir, 'code.js'),
      `// Workflow code for ${answers.name} (${workflowId})
// This file contains any custom code for the workflow

module.exports = {
  // Add custom functions here
  async processData(data) {
    // Process data between steps
    return data;
  }
};
`,
      'utf8'
    );
    
    console.log(chalk.green(`\nWorkflow created successfully: ${workflowId}`));
    console.log(chalk.blue(`Workflow directory: ${workflowDir}`));
    
    return { workflowId, workflowDir };
  }

  async getAvailableComponents(type = null) {
    // Check if components directory exists
    if (!fs.existsSync(this.componentsDir)) {
      return [];
    }

    // List all component directories
    const componentDirs = fs.readdirSync(this.componentsDir)
      .filter(dir => fs.statSync(path.join(this.componentsDir, dir)).isDirectory());
    
    const components = [];
    
    // Check each directory for component files
    for (const dir of componentDirs) {
      const componentPath = path.join(this.componentsDir, dir, 'index.mjs');
      const altComponentPath = path.join(this.componentsDir, dir, 'index.js');
      
      let componentFile = null;
      if (fs.existsSync(componentPath)) {
        componentFile = componentPath;
      } else if (fs.existsSync(altComponentPath)) {
        componentFile = altComponentPath;
      }
      
      if (componentFile) {
        try {
          delete require.cache[require.resolve(componentFile)];
          const component = require(componentFile);
          
          // Filter by type if specified
          if (!type || component.type === type) {
            components.push({
              name: `${component.name} (${component.key})`,
              value: component.key,
              description: component.description
            });
          }
        } catch (error) {
          // Skip if there's an error loading the component
        }
      }
    }
    
    return components;
  }

  async selectWorkflowComponents(components) {
    const actionComponents = await this.getAvailableComponents('action');
    
    if (actionComponents.length === 0) {
      console.error(chalk.red('No action components found. Create one first with pdcreator scaffold.'));
      return false;
    }
    
    let addingComponents = true;
    
    while (addingComponents) {
      const componentAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: `Select action component ${components.length + 1}:`,
          choices: [
            ...actionComponents,
            { name: 'Done adding components', value: 'done' }
          ]
        }
      ]);
      
      if (componentAnswer.action === 'done') {
        addingComponents = false;
      } else {
        // Add component to workflow
        components.push({
          key: componentAnswer.action,
          type: 'action',
          config: {}
        });
        
        console.log(chalk.green(`Added component: ${componentAnswer.action}`));
      }
    }
    
    return components.length > 0;
  }
}

async function execute(options) {
  try {
    const spinner = ora('Initializing test environment...').start();
    
    // Handle workflow creation
    if (options.create) {
      spinner.stop();
      console.log(chalk.blue('Creating new workflow...'));
      
      const composer = new WorkflowComposer();
      const result = await composer.createWorkflow();
      
      if (result) {
        console.log(chalk.green('\nWorkflow created successfully!'));
        console.log(chalk.yellow('\nTest the workflow with:'));
        console.log(chalk.blue(`  pdcreator test --path ${result.workflowDir} --watch`));
      }
      
      return { status: 'created', workflowId: result?.workflowId };
    }
    
    // Handle workflow testing
    const workflowPath = options.path;
    
    if (!workflowPath) {
      spinner.stop();
      console.error(chalk.red('Error: Workflow path is required'));
      console.log(chalk.yellow('Example: pdcreator test --path ./workflows/my-workflow'));
      process.exit(1);
    }
    
    const resolvedPath = path.resolve(workflowPath);
    
    if (!fs.existsSync(resolvedPath)) {
      spinner.stop();
      console.error(chalk.red(`Error: Workflow path not found: ${resolvedPath}`));
      process.exit(1);
    }
    
    spinner.text = 'Loading workflow...';
    
    // Create the workflow tester
    const tester = new WorkflowTester(resolvedPath, {
      watch: options.watch || false
    });
    
    // Load the workflow
    await tester.loadWorkflow();
    
    spinner.succeed(`Workflow loaded: ${tester.workflow.name}`);
    
    if (options.watch) {
      // Start the test server for interactive testing
      console.log(chalk.blue('Starting workflow test server...'));
      const port = await tester.startServer();
      
      console.log(chalk.green(`Workflow test server running at http://localhost:${port}`));
      
      // Open the browser
      if (!options.noOpen) {
        console.log(chalk.blue('Opening browser...'));
        await open(`http://localhost:${port}`);
      }
      
      console.log(chalk.yellow('Press Ctrl+C to stop the test server'));
      
      // Keep the process running
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\nStopping test server...'));
        tester.stop();
        process.exit(0);
      });
      
      return {
        status: 'running',
        workflowId: tester.workflow.id,
        port
      };
    } else {
      // Run the workflow once with default trigger data
      console.log(chalk.blue('Running workflow...'));
      
      const result = await tester.runWorkflow({
        body: {
          test: true,
          timestamp: Date.now()
        },
        headers: {
          'x-test': 'true'
        }
      });
      
      if (result.success) {
        spinner.succeed('Workflow executed successfully!');
      } else {
        spinner.fail(`Workflow execution failed: ${result.error}`);
      }
      
      return {
        status: result.success ? 'success' : 'error',
        result
      };
    }
  } catch (error) {
    console.error(chalk.red('Error during workflow testing:'), error.message);
    process.exit(1);
  }
}

module.exports = { execute };