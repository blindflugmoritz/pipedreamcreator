const vm = require('vm');
const EventEmitter = require('events');

/**
 * Mock Pipedream runtime environment
 * A simple mock of the Pipedream runtime for testing workflows
 */
class PipedreamMock {
  constructor(workflowJson, codeJs) {
    this.workflowJson = workflowJson;
    this.codeJs = codeJs;
    this.eventEmitter = new EventEmitter();
    this.steps = {};
    this.exports = {};
    this.events = [];
  }
  
  /**
   * Create the context object for the workflow
   */
  createContext(triggerEvent) {
    // Create steps object with the trigger event
    this.steps = {
      trigger: {
        event: triggerEvent
      }
    };
    
    // Create $ object with common utilities
    const $ = {
      export: (key, value) => {
        this.exports[key] = value;
      },
      respond: (response) => {
        this.response = response;
      },
      flow: {},
      http: {
        respond: (response) => {
          this.response = response;
        }
      },
      interface: {
        http: {
          respond: (response) => {
            this.response = response;
          }
        },
        timer: {}
      },
      service: {
        db: this._createMockDb()
      }
    };
    
    // Create context object
    return {
      steps: this.steps,
      $,
      console,
      exports: {},
      require: (module) => this._mockRequire(module),
      setTimeout, // Pass through setTimeout
      setInterval, // Pass through setInterval
      clearTimeout, // Pass through clearTimeout
      clearInterval, // Pass through clearInterval
      Buffer, // Pass through Buffer
      process, // Pass through process
      $emit: (event, meta) => {
        this.events.push({ event, meta });
      }
    };
  }
  
  /**
   * Create a mock db for Pipedream's $.service.db
   */
  _createMockDb() {
    const mockDb = {
      _data: {},
      get: (key) => mockDb._data[key],
      set: (key, value) => {
        mockDb._data[key] = value;
      },
      has: (key) => key in mockDb._data,
      delete: (key) => {
        delete mockDb._data[key];
      },
      clear: () => {
        mockDb._data = {};
      }
    };
    
    return mockDb;
  }
  
  /**
   * Mock require function
   */
  _mockRequire(module) {
    // Handle common modules
    if (module === 'axios') {
      return {
        get: async () => ({ data: { success: true, mock: true } }),
        post: async () => ({ data: { success: true, mock: true } }),
        put: async () => ({ data: { success: true, mock: true } }),
        delete: async () => ({ data: { success: true, mock: true } })
      };
    }
    
    if (module === 'crypto') {
      return require('crypto');
    }
    
    // Return a mock for any other module
    return {
      __mock: true,
      mock: true,
      default: { mock: true }
    };
  }
  
  /**
   * Execute the workflow with given trigger event
   */
  async executeWorkflow(triggerEvent) {
    try {
      // Create sandbox context
      const context = this.createContext(triggerEvent);
      
      // Create a sandbox with the context
      const sandbox = vm.createContext(context);
      
      // Prepare the script
      const script = new vm.Script(this.codeJs);
      
      // Execute the code in the sandbox
      script.runInContext(sandbox);
      
      // Process exports
      Object.assign(this.steps.trigger, this.exports);
      
      // Simulate executing all steps in the workflow
      const workflowSteps = (this.workflowJson.components || []).slice();
      
      // Add the trigger as first step
      workflowSteps.unshift({
        id: 'trigger',
        key: 'trigger',
        name: 'Trigger'
      });
      
      // Track step results
      const stepResults = {
        trigger: {
          success: true,
          output: this.steps.trigger
        }
      };
      
      // Execute each step (simplified mock execution)
      for (let i = 1; i < workflowSteps.length; i++) {
        const step = workflowSteps[i];
        const stepKey = step.key || `step${i}`;
        
        try {
          // In a real implementation, this would actually execute the component code
          // Here we just simulate success for simplicity
          this.steps[stepKey] = {
            ...this.exports,
            success: true,
            step: step,
            returnValue: { result: `Executed step ${stepKey}` }
          };
          
          stepResults[stepKey] = {
            success: true,
            output: this.steps[stepKey]
          };
        } catch (error) {
          stepResults[stepKey] = {
            success: false,
            error: error.message
          };
        }
      }
      
      return {
        success: true,
        steps: stepResults,
        events: this.events,
        response: this.response
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Get the emitted events
   */
  getEmittedEvents() {
    return this.events;
  }
}

module.exports = PipedreamMock;