const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

/**
 * Validates a component structure according to Pipedream standards
 */
class ValidationUtil {
  validateComponent(componentPath) {
    if (!fs.existsSync(componentPath)) {
      throw new Error(`Component file not found: ${componentPath}`);
    }
    
    try {
      // Dynamically load the component module
      const component = require(componentPath);
      const errors = [];
      const warnings = [];
      
      // Check required fields
      this.validateRequiredFields(component, errors);
      
      // Check version format
      this.validateVersion(component, errors, warnings);
      
      // Check description length
      this.validateDescription(component, errors, warnings);
      
      // Check props structure if present
      if (component.props) {
        this.validateProps(component.props, errors, warnings);
      }
      
      // Check methods if present
      if (component.methods) {
        this.validateMethods(component.methods, errors, warnings);
      }
      
      return {
        valid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      throw new Error(`Error validating component: ${error.message}`);
    }
  }
  
  validateRequiredFields(component, errors) {
    const requiredFields = ['key', 'name', 'version', 'type', 'description'];
    
    for (const field of requiredFields) {
      if (!component[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }
    
    // Validate component type
    if (component.type && !['source', 'action'].includes(component.type)) {
      errors.push(`Invalid component type: ${component.type}. Must be 'source' or 'action'.`);
    }
  }
  
  validateVersion(component, errors, warnings) {
    if (!component.version) return;
    
    const versionRegex = /^\\d+\\.\\d+\\.\\d+$/;
    if (!versionRegex.test(component.version)) {
      warnings.push(`Version format should follow semantic versioning (e.g., "1.0.0"), found: ${component.version}`);
    }
  }
  
  validateDescription(component, errors, warnings) {
    if (!component.description) return;
    
    if (component.description.length < 10) {
      warnings.push('Description is too short. Consider providing a more descriptive explanation.');
    }
    
    if (component.description.length > 300) {
      warnings.push('Description is very long. Consider making it more concise.');
    }
  }
  
  validateProps(props, errors, warnings) {
    // Check that all props have required fields
    for (const [propName, propConfig] of Object.entries(props)) {
      if (typeof propConfig === 'object' && !propConfig.type) {
        warnings.push(`Prop "${propName}" is missing a type definition.`);
      }
      
      if (typeof propConfig === 'object' && !propConfig.label) {
        warnings.push(`Prop "${propName}" is missing a label.`);
      }
    }
  }
  
  validateMethods(methods, errors, warnings) {
    // Check that all methods are functions
    for (const [methodName, method] of Object.entries(methods)) {
      if (typeof method !== 'function') {
        warnings.push(`Method "${methodName}" is not a function.`);
      }
    }
  }
  
  validateWorkflowJson(workflowPath) {
    if (!fs.existsSync(workflowPath)) {
      throw new Error(`Workflow JSON file not found: ${workflowPath}`);
    }
    
    try {
      const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
      const errors = [];
      const warnings = [];
      
      // Check required fields
      const requiredFields = ['id', 'name'];
      for (const field of requiredFields) {
        if (!workflow[field]) {
          errors.push(`Missing required field in workflow.json: ${field}`);
        }
      }
      
      // Validate trigger if present
      if (workflow.trigger) {
        if (!workflow.trigger.type) {
          errors.push('Trigger is missing a type');
        }
        
        // Validate trigger type-specific fields
        if (workflow.trigger.type === 'http' && !workflow.trigger.path) {
          warnings.push('HTTP trigger is missing a path');
        }
        
        if (workflow.trigger.type === 'schedule' && !workflow.trigger.schedule) {
          errors.push('Schedule trigger is missing a cron expression');
        }
      } else {
        errors.push('Workflow is missing a trigger');
      }
      
      return {
        valid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      throw new Error(`Error validating workflow.json: ${error.message}`);
    }
  }
}

module.exports = new ValidationUtil();