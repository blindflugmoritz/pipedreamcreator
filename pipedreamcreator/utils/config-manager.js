const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

class ConfigManager {
  constructor() {
    this.configDir = path.join(os.homedir(), '.pdcreator');
    this.configPath = path.join(this.configDir, 'config.json');
    this.encryptionKey = this._getEncryptionKey();
    this.config = this._loadConfig();
  }

  // Initialize configuration directory
  initialize() {
    fs.ensureDirSync(this.configDir);
    if (!fs.existsSync(this.configPath)) {
      this._saveConfig({});
    }
    return this;
  }

  // Get encryption key or generate one
  _getEncryptionKey() {
    const keyPath = path.join(this.configDir, '.key');
    
    if (fs.existsSync(keyPath)) {
      return fs.readFileSync(keyPath, 'utf8');
    } else {
      // Generate a new encryption key
      fs.ensureDirSync(this.configDir);
      const key = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(keyPath, key, { mode: 0o600 });
      return key;
    }
  }

  // Load configuration
  _loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      }
      return {};
    } catch (error) {
      console.error('Error loading config:', error.message);
      return {};
    }
  }

  // Save configuration
  _saveConfig(config) {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
      this.config = config;
    } catch (error) {
      console.error('Error saving config:', error.message);
    }
  }

  // Encrypt sensitive data
  _encrypt(text) {
    if (!text) return '';
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc', 
      Buffer.from(this.encryptionKey, 'hex'), 
      iv
    );
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return `${iv.toString('hex')}:${encrypted}`;
  }

  // Decrypt sensitive data
  _decrypt(encrypted) {
    if (!encrypted) return '';
    
    try {
      const parts = encrypted.split(':');
      if (parts.length !== 2) return '';
      
      const iv = Buffer.from(parts[0], 'hex');
      const encryptedText = parts[1];
      
      const decipher = crypto.createDecipheriv(
        'aes-256-cbc', 
        Buffer.from(this.encryptionKey, 'hex'), 
        iv
      );
      
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Error decrypting data:', error.message);
      return '';
    }
  }

  // Check if a configuration value should be encrypted
  _shouldEncrypt(key) {
    const sensitiveKeys = [
      'claude.api_key',
      'github.token',
      'pipedream.api_key',
      'pipedream.password'
    ];
    
    return sensitiveKeys.some(pattern => key.includes(pattern));
  }

  // Set a configuration value
  set(key, value) {
    let config = this._loadConfig();
    
    // Create nested objects if needed
    const parts = key.split('.');
    let current = config;
    
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    
    // Encrypt if sensitive data
    if (this._shouldEncrypt(key)) {
      current[parts[parts.length - 1]] = this._encrypt(value);
    } else {
      current[parts[parts.length - 1]] = value;
    }
    
    this._saveConfig(config);
    return true;
  }

  // Get a configuration value
  get(key) {
    const config = this._loadConfig();
    
    // Navigate the nested objects
    const parts = key.split('.');
    let current = config;
    
    for (const part of parts) {
      if (!current || !current[part]) {
        return null;
      }
      current = current[part];
    }
    
    // Decrypt if it's an encrypted value
    if (typeof current === 'string' && current.includes(':') && this._shouldEncrypt(key)) {
      return this._decrypt(current);
    }
    
    return current;
  }

  // List all configuration values
  list() {
    const config = this._loadConfig();
    return this._hideSecrets(config);
  }
  
  // Hide secrets in the output
  _hideSecrets(obj, parentKey = '') {
    const result = {};
    
    for (const key in obj) {
      const fullKey = parentKey ? `${parentKey}.${key}` : key;
      
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        result[key] = this._hideSecrets(obj[key], fullKey);
      } else if (this._shouldEncrypt(fullKey)) {
        result[key] = '********';
      } else {
        result[key] = obj[key];
      }
    }
    
    return result;
  }
  
  // Delete a configuration value
  delete(key) {
    const config = this._loadConfig();
    
    // Navigate the nested objects
    const parts = key.split('.');
    let current = config;
    
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current || !current[parts[i]]) {
        return false;
      }
      current = current[parts[i]];
    }
    
    if (current && current[parts[parts.length - 1]] !== undefined) {
      delete current[parts[parts.length - 1]];
      this._saveConfig(config);
      return true;
    }
    
    return false;
  }
  
  // Check for Pipedream authentication
  hasPipedreamAuth() {
    return !!(
      this.get('pipedream.username') && 
      this.get('pipedream.password') &&
      this.get('pipedream.api_key')
    );
  }
  
  // Check for Claude API key
  hasClaudeApiKey() {
    return !!this.get('claude.api_key');
  }
  
  // Check for GitHub token
  hasGithubToken() {
    return !!this.get('github.token');
  }
}

module.exports = new ConfigManager().initialize();