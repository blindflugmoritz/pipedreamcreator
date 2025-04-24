const fs = require('fs-extra');
const path = require('path');

class Validation {
  // Validate workflow ID format
  isValidWorkflowId(id) {
    return /^p_[A-Za-z0-9]{6,}$/.test(id);
  }
  
  // Validate project ID format
  isValidProjectId(id) {
    return /^proj_[A-Za-z0-9]{6,}$/.test(id);
  }
  
  // Ensure a directory path exists
  ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirpSync(dirPath);
    }
    return dirPath;
  }
  
  // Validate workflow.json structure
  validateWorkflowJson(workflowJson) {
    const errors = [];
    
    // Check required top-level fields
    const requiredFields = ['id', 'name'];
    for (const field of requiredFields) {
      if (!workflowJson[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }
    
    // Validate ID format
    if (workflowJson.id && !this.isValidWorkflowId(workflowJson.id)) {
      errors.push(`Invalid workflow ID format: ${workflowJson.id}`);
    }
    
    // More validation as needed...
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  // Validate code.js structure
  validateCodeJs(codeJs) {
    // This would need to parse and validate JavaScript code
    // For now, just do basic checks
    if (!codeJs || typeof codeJs !== 'string') {
      return {
        valid: false,
        errors: ['Code.js content is empty or invalid']
      };
    }
    
    const errors = [];
    
    // Check for common required patterns
    if (!codeJs.includes('export default')) {
      errors.push('Missing export default statement');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  // Check if a path is a valid workflow directory
  isWorkflowDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
      return false;
    }
    
    const workflowJsonPath = path.join(dirPath, 'workflow.json');
    const codeJsPath = path.join(dirPath, 'code.js');
    
    return fs.existsSync(workflowJsonPath) && fs.existsSync(codeJsPath);
  }
  
  // Check if a path points to a component
  isComponentPath(filePath) {
    if (!fs.existsSync(filePath)) {
      return false;
    }
    
    if (fs.statSync(filePath).isDirectory()) {
      // Check if it's a component directory
      const indexPath = path.join(filePath, 'index.js');
      return fs.existsSync(indexPath);
    } else {
      // Check if it's a direct component file
      return filePath.endsWith('.js');
    }
  }
}

module.exports = new Validation();