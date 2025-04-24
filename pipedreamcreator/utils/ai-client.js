const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const configManager = require('./config-manager');

class AiClient {
  constructor() {
    this.promptsDir = path.join(__dirname, '..', 'templates', 'prompts');
    fs.ensureDirSync(this.promptsDir);
  }

  // Initialize Claude client
  _initClient() {
    const apiKey = configManager.get('claude.api_key');
    
    if (!apiKey) {
      throw new Error(
        'Claude API key not found in configuration.\n' +
        'Run "pdcreator config setup" to configure your API keys.'
      );
    }
    
    return new Anthropic({ apiKey });
  }

  // Load a prompt template
  async loadPromptTemplate(templateName) {
    const templatePath = path.join(this.promptsDir, `${templateName}.md`);
    
    // If template doesn't exist, create a default one
    if (!fs.existsSync(templatePath)) {
      await this._createDefaultTemplate(templateName);
    }
    
    return fs.readFile(templatePath, 'utf8');
  }

  // Create default templates if they don't exist
  async _createDefaultTemplate(templateName) {
    let template = '';
    
    if (templateName === 'brainstorm-workflow') {
      template = `# Pipedream Workflow Brainstorming

Given the following workflow description: "{description}", 
generate a complete Pipedream workflow design including:

1. Appropriate trigger type (HTTP, schedule, app-specific)
2. Required action steps with proper sequence
3. Data transformation requirements between steps
4. Error handling considerations
5. Expected inputs and outputs

For each component, specify:
- Component type (source/trigger or action)
- Required properties and configuration
- Data flow between components
- Edge cases to handle

Make the components reusable where possible, following best practices.
`;
    } else if (templateName === 'generate-action') {
      template = `# Pipedream Action Component Generation

Generate a Pipedream action component that {purpose}.

Required fields:
- name: "{name}"
- key: "{key}"
- version: "0.0.1"
- type: "action"

The component should:
{requirements}

Data handling:
- Input data structure: {inputStructure}
- Output data structure: {outputStructure}
- Error handling: {errorHandling}

Follow Pipedream best practices for component development.
`;
    } else if (templateName === 'generate-source') {
      template = `# Pipedream Source/Trigger Component Generation

Generate a Pipedream source/trigger component that {purpose}.

Required fields:
- name: "{name}"
- key: "{key}"
- version: "0.0.1"
- type: "source"

The component should:
{requirements}

Data handling:
- Event format: {eventFormat}
- Emission criteria: {emissionCriteria}
- Error handling: {errorHandling}

Follow Pipedream best practices for trigger development.
`;
    }
    
    const templatePath = path.join(this.promptsDir, `${templateName}.md`);
    await fs.writeFile(templatePath, template);
  }

  // Format a prompt with variables
  formatPrompt(template, variables) {
    let formattedPrompt = template;
    
    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      formattedPrompt = formattedPrompt.replace(regex, variables[key]);
    });
    
    return formattedPrompt;
  }

  // Call Claude API with exponential backoff retry
  async callClaude(prompt, options = {}) {
    const client = this._initClient();
    const defaultOptions = {
      model: 'claude-3-opus-20240229',
      max_tokens: 4000,
      temperature: 0.7,
      retries: 3,
      baseDelay: 2000  // Base delay in ms for exponential backoff
    };
    
    const mergedOptions = { ...defaultOptions, ...options };
    const { retries, baseDelay, ...claudeOptions } = mergedOptions;
    
    const spinner = ora('Connecting to Claude AI...').start();
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        spinner.text = `Generating with Claude AI (attempt ${attempt + 1}/${retries + 1})...`;
        
        const response = await client.messages.create({
          model: claudeOptions.model,
          max_tokens: claudeOptions.max_tokens,
          temperature: claudeOptions.temperature,
          messages: [
            { role: 'user', content: prompt }
          ]
        });
        
        spinner.succeed('Successfully generated content with Claude AI');
        return response.content[0].text;
      } catch (error) {
        const isLastAttempt = attempt === retries;
        
        if (isLastAttempt) {
          spinner.fail(`Error calling Claude API: ${error.message}`);
          throw error;
        } else {
          // Calculate delay with exponential backoff and jitter
          const jitter = Math.random() * 0.3 + 0.85; // Random between 0.85 and 1.15
          const delay = Math.min(baseDelay * Math.pow(2, attempt) * jitter, 30000);
          
          spinner.text = `Retrying in ${Math.round(delay / 1000)}s... (${error.message})`;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
  }

  // Generate workflow ideas based on a description
  async brainstormWorkflow(description, options = {}) {
    try {
      const template = await this.loadPromptTemplate('brainstorm-workflow');
      const prompt = this.formatPrompt(template, { description });
      
      return await this.callClaude(prompt, options);
    } catch (error) {
      console.error(chalk.red('Error brainstorming workflow:'), error.message);
      throw error;
    }
  }

  // Generate component code
  async generateComponent(type, details, options = {}) {
    try {
      const templateName = `generate-${type}`;
      const template = await this.loadPromptTemplate(templateName);
      const prompt = this.formatPrompt(template, details);
      
      return await this.callClaude(prompt, options);
    } catch (error) {
      console.error(chalk.red(`Error generating ${type} component:`), error.message);
      throw error;
    }
  }

  // Interactive feedback loop for refining ideas
  async refineIdea(originalIdea, feedback, options = {}) {
    try {
      const prompt = `You previously generated this workflow idea:
---
${originalIdea}
---

The user has provided the following feedback:
---
${feedback}
---

Please refine the workflow design based on this feedback. Keep the same format and level of detail, but incorporate the requested changes.`;
      
      return await this.callClaude(prompt, options);
    } catch (error) {
      console.error(chalk.red('Error refining workflow idea:'), error.message);
      throw error;
    }
  }
}

module.exports = new AiClient();