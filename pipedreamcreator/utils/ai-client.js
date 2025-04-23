const { Anthropic } = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const os = require('os');
const chalk = require('chalk');

class AIClient {
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY,
    });
    
    if (!process.env.CLAUDE_API_KEY) {
      console.error(chalk.red('Error: CLAUDE_API_KEY environment variable is not set.'));
      console.error(chalk.yellow('Please set it in your .env file or environment.'));
      process.exit(1);
    }
  }

  async generatePrompt(templateName, variables) {
    const promptsDir = path.join(__dirname, '../templates/prompts');
    if (!fs.existsSync(promptsDir)) {
      fs.mkdirSync(promptsDir, { recursive: true });
    }
    
    const templatePath = path.join(promptsDir, `${templateName}.txt`);
    
    if (!fs.existsSync(templatePath)) {
      // Create a default template if none exists
      this.createDefaultTemplate(templateName, templatePath);
    }
    
    let promptTemplate = fs.readFileSync(templatePath, 'utf8');
    
    // Simple variable replacement
    Object.entries(variables).forEach(([key, value]) => {
      promptTemplate = promptTemplate.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    });
    
    return promptTemplate;
  }
  
  createDefaultTemplate(templateName, templatePath) {
    let defaultContent = '';
    
    switch (templateName) {
      case 'brainstorm-workflow':
        defaultContent = `I'd like you to help me design a Pipedream workflow for the following use case:

{{description}}

Please provide a complete workflow design including:

1. The appropriate trigger type (HTTP, schedule, or app-specific)
2. Required steps with proper sequence
3. Data transformation requirements between steps
4. Error handling considerations 
5. Expected inputs and outputs

For each component, please specify:
- Component type (source/trigger or action)
- Required properties and configuration
- Data flow between components
- Edge cases to handle`;
        break;
        
      case 'generate-component':
        defaultContent = `Create a Pipedream {{componentType}} component with the following details:

- Name: {{name}}
- Key: {{key}}
- Description: {{description}}
- App: {{app}}

Please provide complete working code following these requirements:

1. Follow the standard Pipedream component structure
2. Include all necessary imports
3. Define appropriate props with proper types and descriptions
4. Implement all required methods
5. Include helpful code comments
6. Follow best practices for error handling`;
        break;
        
      case 'research-app':
        defaultContent = `Please research Pipedream apps to help me implement a component with the following criteria:

{{#if query}}
Search query: {{query}}
{{/if}}

{{#if app}}
App: {{app}}
{{/if}}

{{#if action}}
Action type: {{action}}
{{/if}}

Provide a detailed analysis including:

1. App capabilities relevant to the search criteria
2. Available triggers/sources and their configuration options
3. Available actions and their configuration options
4. Authentication requirements
5. Common use cases`;
        break;
        
      default:
        defaultContent = `Please provide information about: {{description}}`;
    }
    
    // Ensure the directory exists
    const dir = path.dirname(templatePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write the default template file
    fs.writeFileSync(templatePath, defaultContent, 'utf8');
    console.log(chalk.yellow(`Created default template for ${templateName} at ${templatePath}`));
  }

  async callClaudeWithFallbacks(promptContent, systemPrompt, temperature = 0.7) {
    // Try multiple Claude model versions
    const modelVersions = [
      'claude-3-sonnet-20240229',
      'claude-3-opus-20240229',
      'claude-3-haiku-20240307',
      'claude-3-sonnet',
      'claude-3-opus',
      'claude-3-haiku',
      'claude-3',
      'claude-2'
    ];
    
    let lastError = null;
    
    for (const model of modelVersions) {
      try {
        console.log(chalk.blue(`Attempting to use Claude model: ${model}...`));
        
        const response = await this.anthropic.messages.create({
          model: model,
          max_tokens: 4000,
          temperature: temperature,
          system: systemPrompt,
          messages: [
            { role: 'user', content: promptContent }
          ],
        });
        
        return response.content[0].text;
      } catch (error) {
        console.log(chalk.yellow(`Model ${model} failed: ${error.message}`));
        lastError = error;
      }
    }
    
    // If we get here, all models failed
    console.error(chalk.red("All Claude models failed. Last error:"), lastError.message);
    throw new Error(`All Claude models failed. Last error: ${lastError.message}`);
  }

  async brainstormWorkflow(description) {
    try {
      console.log(chalk.blue('Brainstorming workflow ideas with Claude AI...'));
      
      const prompt = await this.generatePrompt('brainstorm-workflow', { description });
      const systemPrompt = "You are an expert in Pipedream workflow development. You excel at designing efficient, effective automation workflows.";
      
      return await this.callClaudeWithFallbacks(prompt, systemPrompt, 0.7);
    } catch (error) {
      console.error(chalk.red('Error generating workflow ideas:'), error.message);
      throw error;
    }
  }

  async generateComponent(componentType, options) {
    try {
      console.log(chalk.blue(`Generating ${componentType} component with Claude AI...`));
      
      const prompt = await this.generatePrompt('generate-component', { 
        componentType,
        ...options
      });
      
      const systemPrompt = "You are an expert in Pipedream component development. You excel at creating well-structured, efficient API integrations.";
      
      return await this.callClaudeWithFallbacks(prompt, systemPrompt, 0.2);
    } catch (error) {
      console.error(chalk.red(`Error generating ${componentType} component:`), error.message);
      throw error;
    }
  }

  async researchApp(query, app, action) {
    try {
      console.log(chalk.blue('Researching Pipedream apps...'));
      
      const prompt = await this.generatePrompt('research-app', { 
        query: query || '',
        app: app || '',
        action: action || '',
      });
      
      const systemPrompt = "You are an expert in API integrations and the Pipedream platform. Your goal is to provide accurate, helpful information about Pipedream apps and their capabilities.";
      
      return await this.callClaudeWithFallbacks(prompt, systemPrompt, 0.3);
    } catch (error) {
      console.error(chalk.red('Error researching app:'), error.message);
      throw error;
    }
  }
}

module.exports = new AIClient();