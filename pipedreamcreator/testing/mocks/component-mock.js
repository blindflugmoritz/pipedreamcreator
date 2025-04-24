const vm = require('vm');
const EventEmitter = require('events');

/**
 * Mock Pipedream component environment
 * A simple mock of the Pipedream component runtime for testing
 */
class PipedreamComponentMock {
  constructor(componentCode) {
    this.componentCode = componentCode;
    this.eventEmitter = new EventEmitter();
    this.exports = {};
    this.events = [];
  }
  
  /**
   * Create the context object for the component
   */
  createContext(inputData) {
    // Create steps object with any previous step data
    const steps = {
      trigger: {
        event: inputData
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
      steps,
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
   * Execute the component with given input data
   */
  async executeComponent(inputData) {
    try {
      // Create sandbox context
      const context = this.createContext(inputData);
      
      // Create a sandbox with the context
      const sandbox = vm.createContext(context);
      
      // Modify the component code to export the component
      const modifiedCode = `
        ${this.componentCode}
        
        // If using export default {...}, export it as component
        if (exports.default) {
          exports._component = exports.default;
        }
      `;
      
      // Prepare the script
      const script = new vm.Script(modifiedCode);
      
      // Execute the code in the sandbox
      script.runInContext(sandbox);
      
      // Get the component from exports
      const component = sandbox.exports._component || sandbox.exports;
      
      // Check if we got a component
      if (!component) {
        throw new Error('No component exported from code');
      }
      
      // Create a mock props object based on the component's props definition
      const props = this._createMockProps(component.props);
      
      // Check if this is a source or action
      const isSource = component.type === 'source';
      
      let result;
      
      if (isSource) {
        // Execute source component's run method
        if (typeof component.run === 'function') {
          result = await component.run.call({ ...component, ...props, $emit: sandbox.$emit }, inputData);
        } else {
          throw new Error('Source component missing run method');
        }
      } else {
        // Execute action component's run method
        if (typeof component.run === 'function') {
          result = await component.run.call(
            { ...component, ...props }, 
            { steps: sandbox.steps, $: sandbox.$ }
          );
        } else {
          throw new Error('Action component missing run method');
        }
      }
      
      return {
        success: true,
        component,
        output: result,
        events: this.events,
        exports: this.exports,
        response: this.response
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stack: error.stack
      };
    }
  }
  
  /**
   * Create mock props based on the component's props definition
   */
  _createMockProps(propsDefinition) {
    const mockProps = {};
    
    // Handle null/undefined props
    if (!propsDefinition) {
      return mockProps;
    }
    
    // Create mock implementations for common prop types
    Object.keys(propsDefinition).forEach(propName => {
      const propDef = propsDefinition[propName];
      
      if (propDef === 'string') {
        mockProps[propName] = 'mock-string';
      } else if (propDef === 'boolean') {
        mockProps[propName] = true;
      } else if (propDef === 'integer' || propDef === 'number') {
        mockProps[propName] = 123;
      } else if (propDef === 'object') {
        mockProps[propName] = { mock: true };
      } else if (propDef === 'array') {
        mockProps[propName] = [1, 2, 3];
      } else if (propDef === '$.interface.http') {
        mockProps[propName] = {
          respond: (response) => {
            this.response = response;
          }
        };
      } else if (propDef === '$.interface.timer') {
        mockProps[propName] = {};
      } else if (propDef === '$.service.db') {
        mockProps[propName] = this._createMockDb();
      } else if (typeof propDef === 'object') {
        // Handle more complex prop definitions
        if (propDef.type === 'string') {
          mockProps[propName] = propDef.default || 'mock-string';
        } else if (propDef.type === 'boolean') {
          mockProps[propName] = propDef.default !== undefined ? propDef.default : true;
        } else if (propDef.type === 'integer' || propDef.type === 'number') {
          mockProps[propName] = propDef.default || 123;
        } else if (propDef.type === 'object') {
          mockProps[propName] = propDef.default || { mock: true };
        } else if (propDef.type === 'array') {
          mockProps[propName] = propDef.default || [1, 2, 3];
        } else if (propDef.type === '$.interface.http') {
          mockProps[propName] = {
            respond: (response) => {
              this.response = response;
            }
          };
        } else if (propDef.type === '$.interface.timer') {
          mockProps[propName] = {
            interval: propDef.default?.intervalSeconds || 300
          };
        } else if (propDef.type === '$.service.db') {
          mockProps[propName] = this._createMockDb();
        } else {
          // Default mock for unknown types
          mockProps[propName] = propDef.default || null;
        }
      } else {
        // Default handling for unknown prop types
        mockProps[propName] = null;
      }
    });
    
    return mockProps;
  }
  
  /**
   * Get the emitted events
   */
  getEmittedEvents() {
    return this.events;
  }
}

module.exports = PipedreamComponentMock;