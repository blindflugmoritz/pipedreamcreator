const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const http = require('http');
const open = require('open');
const ora = require('ora');

// Mock Pipedream runtime environment
class PipedreamMock {
  constructor(componentPath, options = {}) {
    this.componentPath = componentPath;
    this.options = options;
    this.preview = options.preview || false;
    this.server = null;
    this.component = null;
    this.state = {};
    this.events = [];
  }

  async loadComponent() {
    try {
      // Clear the require cache to reload the component
      delete require.cache[require.resolve(this.componentPath)];
      
      // Import the component
      this.component = require(this.componentPath);
      
      // Basic validation
      if (!this.component) {
        throw new Error('Component not found');
      }
      
      if (!this.component.type) {
        throw new Error('Component missing type');
      }
      
      return this.component;
    } catch (error) {
      console.error(chalk.red('Error loading component:'), error.message);
      throw error;
    }
  }

  async runComponent(event = {}) {
    try {
      if (!this.component) {
        await this.loadComponent();
      }

      const $ = {
        export: (key, value) => {
          this.state[key] = value;
          console.log(chalk.green(`Exported: ${key} = ${JSON.stringify(value)}`));
        },
        respond: (response) => {
          console.log(chalk.cyan('Response:'), response);
          return response;
        }
      };

      // Mock the context for different component types
      let context = { $, steps: {} };

      // Add event and previous steps to context
      context.event = event;
      
      // Mock props
      const mockProps = {};
      if (this.component.props) {
        for (const [key, prop] of Object.entries(this.component.props)) {
          // For app props, mock the app
          if (prop.type === 'app') {
            mockProps[key] = this.mockApp(prop.app);
          } else {
            // For other props, use default value
            mockProps[key] = prop.default || '';
          }
        }
      }

      // Merge mocked props into component for the run
      const runComponent = {
        ...this.component,
        ...mockProps,
        $emit: (data, meta) => {
          console.log(chalk.green('Event emitted:'));
          console.log(data);
          console.log(chalk.yellow('Metadata:'));
          console.log(meta);
          this.events.push({ data, meta });
        }
      };

      console.log(chalk.blue('Running component:'), this.component.name);
      
      // Execute the component's run method
      if (this.component.type === 'action') {
        return await this.component.run.call(runComponent, context);
      } else if (this.component.type === 'source') {
        return await this.component.run.call(runComponent, event);
      }
    } catch (error) {
      console.error(chalk.red('Error running component:'), error.message);
      console.error(error.stack);
      throw error;
    }
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

  async startServer() {
    if (this.server) {
      return;
    }

    const PORT = 3000;
    
    this.server = http.createServer(async (req, res) => {
      if (req.url === '/') {
        // Render component info and UI
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(this.generateUI());
      } else if (req.url === '/run') {
        // Handle component run request
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        
        req.on('end', async () => {
          try {
            const event = body ? JSON.parse(body) : {};
            const result = await this.runComponent(event);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              result,
              events: this.events,
              state: this.state
            }));
            
            // Clear events for next run
            this.events = [];
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
        // Handle component reload request
        try {
          await this.loadComponent();
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            component: {
              name: this.component.name,
              key: this.component.key,
              version: this.component.version,
              description: this.component.description,
              type: this.component.type,
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
        console.log(chalk.green(`Development server running at http://localhost:${PORT}`));
        resolve(PORT);
      });
    });
  }

  generateUI() {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Pipedream Component Dev - ${this.component?.name || 'Component'}</title>
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
        .component-type {
          background: #25B799;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 14px;
          font-weight: bold;
        }
        .container {
          display: flex;
          gap: 20px;
        }
        .panel {
          background: white;
          border-radius: 5px;
          padding: 20px;
          flex: 1;
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
          max-height: 400px;
        }
        label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
        }
        .key {
          color: #888;
          font-family: monospace;
        }
        .description {
          color: #666;
          font-style: italic;
          margin-bottom: 15px;
        }
        #reload {
          background: #e67e22;
        }
        #reload:hover {
          background: #d35400;
        }
        .version {
          color: #888;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <header>
        <div>
          <h1>${this.component?.name || 'Component'}</h1>
          <div class="key">${this.component?.key || 'unknown'}</div>
          <div class="version">v${this.component?.version || '0.0.0'}</div>
        </div>
        <div class="component-type">${this.component?.type?.toUpperCase() || 'UNKNOWN'}</div>
      </header>
      
      <div class="description">${this.component?.description || 'No description provided'}</div>
      
      <div class="container">
        <div class="panel">
          <h2>Test ${this.component?.type === 'source' ? 'Trigger' : 'Action'}</h2>
          <div>
            <label for="event-input">Input Event/Data:</label>
            <textarea id="event-input">{
  "data": "Example input data"
}</textarea>
          </div>
          <div>
            <button id="run">Run Component</button>
            <button id="reload">Reload Component</button>
          </div>
        </div>
        
        <div class="panel">
          <h2>Results</h2>
          <pre id="results">// Results will appear here</pre>
        </div>
      </div>
      
      <script>
        const runButton = document.getElementById('run');
        const reloadButton = document.getElementById('reload');
        const eventInput = document.getElementById('event-input');
        const resultsOutput = document.getElementById('results');
        
        // Run the component
        runButton.addEventListener('click', async () => {
          try {
            resultsOutput.textContent = 'Running...';
            
            let eventData = {};
            try {
              eventData = JSON.parse(eventInput.value);
            } catch (e) {
              resultsOutput.textContent = 'Error parsing input JSON: ' + e.message;
              return;
            }
            
            const response = await fetch('/run', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(eventData)
            });
            
            const result = await response.json();
            
            if (result.success) {
              resultsOutput.textContent = JSON.stringify(result, null, 2);
            } else {
              resultsOutput.textContent = 'Error: ' + result.error + '\\n\\n' + result.stack;
            }
          } catch (e) {
            resultsOutput.textContent = 'Error running component: ' + e.message;
          }
        });
        
        // Reload the component
        reloadButton.addEventListener('click', async () => {
          try {
            resultsOutput.textContent = 'Reloading component...';
            
            const response = await fetch('/reload');
            const result = await response.json();
            
            if (result.success) {
              resultsOutput.textContent = 'Component reloaded successfully:\\n' + JSON.stringify(result.component, null, 2);
              // Reload the page to refresh component info
              setTimeout(() => window.location.reload(), 1000);
            } else {
              resultsOutput.textContent = 'Error reloading component: ' + result.error;
            }
          } catch (e) {
            resultsOutput.textContent = 'Error reloading component: ' + e.message;
          }
        });
      </script>
    </body>
    </html>
    `;
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
      console.log(chalk.green('Development server stopped'));
    }
  }
}

async function findComponentPath(path) {
  // If path is a directory, look for index.mjs or index.js
  if (fs.existsSync(path) && fs.statSync(path).isDirectory()) {
    const indexMjs = path.join(path, 'index.mjs');
    const indexJs = path.join(path, 'index.js');
    
    if (fs.existsSync(indexMjs)) {
      return indexMjs;
    } else if (fs.existsSync(indexJs)) {
      return indexJs;
    }
  }
  
  // Return the path as is if it's a file
  return path;
}

async function execute(options) {
  try {
    let componentPath = options.path;
    
    // If no path provided, prompt the user
    if (!componentPath) {
      // Look for components in the components directory
      const componentsDir = path.join(process.cwd(), 'components');
      
      if (fs.existsSync(componentsDir)) {
        // Get all component directories
        const componentDirs = fs.readdirSync(componentsDir)
          .filter(dir => fs.statSync(path.join(componentsDir, dir)).isDirectory());
        
        if (componentDirs.length === 0) {
          console.error(chalk.red('No components found in the components directory'));
          console.log(chalk.yellow('Create a component first with:'));
          console.log(chalk.blue('  pdcreator scaffold --type source --name "My Component"'));
          process.exit(1);
        }
        
        // Prompt the user to select a component
        const answer = await inquirer.prompt([
          {
            type: 'list',
            name: 'component',
            message: 'Select a component to develop:',
            choices: componentDirs
          }
        ]);
        
        componentPath = path.join(componentsDir, answer.component);
      } else {
        console.error(chalk.red('No components directory found'));
        console.log(chalk.yellow('Create a component first with:'));
        console.log(chalk.blue('  pdcreator scaffold --type source --name "My Component"'));
        process.exit(1);
      }
    }
    
    // Resolve the component path
    const resolvedPath = path.resolve(componentPath);
    
    if (!fs.existsSync(resolvedPath)) {
      console.error(chalk.red(`Component path not found: ${resolvedPath}`));
      process.exit(1);
    }
    
    console.log(chalk.blue(`Starting development server for component: ${resolvedPath}`));
    
    // Create the development environment
    const devEnv = new PipedreamMock(resolvedPath, {
      preview: options.preview || false
    });
    
    // Load the component
    await devEnv.loadComponent();
    console.log(chalk.green('Component loaded:'), devEnv.component.name);
    
    // Start the development server
    const port = await devEnv.startServer();
    
    // Open the browser if preview is enabled
    if (options.preview) {
      console.log(chalk.blue('Opening browser preview...'));
      await open(`http://localhost:${port}`);
    }
    
    console.log(chalk.yellow('Press Ctrl+C to stop the development server'));
    
    // Keep the process running
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\nStopping development server...'));
      devEnv.stop();
      process.exit(0);
    });
    
    return {
      componentPath: resolvedPath,
      devServerPort: port
    };
  } catch (error) {
    console.error(chalk.red('Error during development:'), error.message);
    process.exit(1);
  }
}

module.exports = { execute };