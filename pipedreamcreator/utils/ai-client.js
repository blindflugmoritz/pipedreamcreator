const { Anthropic } = require('anthropic');
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
    const templatePath = path.join(__dirname, '../templates/prompts', `${templateName}.txt`);
    
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Prompt template ${templateName} not found`);
    }
    
    let promptTemplate = fs.readFileSync(templatePath, 'utf8');
    
    // Simple variable replacement
    Object.entries(variables).forEach(([key, value]) => {
      promptTemplate = promptTemplate.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    });
    
    return promptTemplate;
  }

  async brainstormWorkflow(description) {
    try {
      console.log(chalk.blue('Brainstorming workflow ideas with Claude AI...'));
      
      const prompt = await this.generatePrompt('brainstorm-workflow', { description });
      
      const response = await this.anthropic.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 4000,
        temperature: 0.7,
        system: "You are an expert in Pipedream workflow development. You excel at designing efficient, effective automation workflows.",
        messages: [
          { role: 'user', content: prompt }
        ],
      });
      
      return response.content[0].text;
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
      
      const response = await this.anthropic.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 4000,
        temperature: 0.2,
        system: "You are an expert in Pipedream component development. You excel at creating well-structured, efficient API integrations.",
        messages: [
          { role: 'user', content: prompt }
        ],
      });
      
      return response.content[0].text;
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
      
      const response = await this.anthropic.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 4000,
        temperature: 0.3,
        system: "You are an expert in API integrations and the Pipedream platform. Your goal is to provide accurate, helpful information about Pipedream apps and their capabilities.",
        messages: [
          { role: 'user', content: prompt }
        ],
      });
      
      return response.content[0].text;
    } catch (error) {
      console.error(chalk.red('Error researching app:'), error.message);
      throw error;
    }
  }
}

module.exports = new AIClient();