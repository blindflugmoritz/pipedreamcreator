const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const Handlebars = require('handlebars');
const { nanoid } = require('nanoid');
const aiClient = require('../utils/ai-client');

async function execute(options) {
  try {
    // Process full workflow scaffold option
    if (options.workflow) {
      return await scaffoldFullWorkflow(options);
    }
    
    // Process from-brainstorm option
    if (options.fromBrainstorm) {
      return await handleBrainstormScaffold(options.fromBrainstorm);
    }
    
    // Otherwise proceed with regular component scaffolding
    const answers = await gatherComponentInfo(options);
    
    // Generate component files
    await createComponentFiles(answers);
  } catch (error) {
    console.error(chalk.red('Error during scaffolding:'), error.message);
    process.exit(1);
  }
}

async function scaffoldFullWorkflow(options) {
  console.log(chalk.blue('Scaffolding a complete workflow...'));
  
  // Get workflow description if not provided
  let description = options.description;
  if (!description) {
    const answer = await inquirer.prompt([
      {
        type: 'input',
        name: 'description',
        message: 'Describe the workflow to create:',
        validate: (input) => input.length > 0 || 'Workflow description is required'
      }
    ]);
    description = answer.description;
  }
  
  // Generate workflow name if not provided
  let workflowName = options.name;
  if (!workflowName) {
    // Extract a name from the description
    workflowName = description
      .split(' ')
      .slice(0, 5)
      .join(' ')
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .trim();
  }
  
  // Create directories
  const componentsDir = path.join(process.cwd(), 'components');
  const workflowsDir = path.join(process.cwd(), 'workflows');
  
  if (!fs.existsSync(componentsDir)) {
    fs.mkdirSync(componentsDir, { recursive: true });
  }
  
  if (!fs.existsSync(workflowsDir)) {
    fs.mkdirSync(workflowsDir, { recursive: true });
  }
  
  // Generate a workflow ID
  const workflowId = 'p_' + Math.random().toString(36).substring(2, 8).toUpperCase();
  const workflowDir = path.join(workflowsDir, workflowId);
  fs.mkdirSync(workflowDir, { recursive: true });
  
  // Use Claude to generate workflow design
  const spinner = ora('Brainstorming workflow design with Claude AI...').start();
  
  try {
    // Get design from Claude
    const brainstormResult = await aiClient.brainstormWorkflow(description);
    
    spinner.text = 'Analyzing workflow structure...';
    
    // Parse components from the brainstorm result
    const { components, trigger } = parseWorkflowDesign(brainstormResult);
    
    spinner.text = 'Creating workflow components...';
    
    // Create all components
    const createdComponents = [];
    
    // Create trigger component first
    if (trigger && trigger.type && trigger.name) {
      const triggerComponent = await createComponentFiles({
        type: 'source',
        name: trigger.name,
        description: trigger.description || `${trigger.name} trigger for ${workflowName}`,
        app: trigger.app || inferAppFromName(trigger.name)
      });
      
      createdComponents.push({
        key: triggerComponent.key,
        type: 'source',
        config: {}
      });
    }
    
    // Create action components
    for (const component of components) {
      if (component.type === 'action') {
        const createdComponent = await createComponentFiles({
          type: 'action',
          name: component.name,
          description: component.description || `${component.name} for ${workflowName}`,
          app: component.app || inferAppFromName(component.name)
        });
        
        createdComponents.push({
          key: createdComponent.key,
          type: 'action',
          config: {}
        });
      }
    }
    
    spinner.text = 'Creating workflow configuration...';
    
    // Create workflow.json
    let triggerConfig = {};
    
    if (trigger && trigger.type === 'http') {
      triggerConfig = {
        type: 'http',
        path: Math.random().toString(36).substring(2, 16)
      };
    } else if (trigger && trigger.type === 'schedule') {
      triggerConfig = {
        type: 'schedule',
        schedule: trigger.schedule || '0 0 * * *'
      };
    } else {
      // Default to HTTP if not specified
      triggerConfig = {
        type: 'http',
        path: Math.random().toString(36).substring(2, 16)
      };
    }
    
    const workflow = {
      id: workflowId,
      name: workflowName,
      created_at: new Date().toISOString(),
      description: description,
      trigger: triggerConfig,
      components: createdComponents,
      settings: {
        continueOnFailure: false
      }
    };
    
    // Add webhook URL if using HTTP trigger
    if (triggerConfig.type === 'http') {
      workflow.webhook_url = `https://pipedream.com/webhooks/${workflowId}/${triggerConfig.path}`;
    }
    
    fs.writeFileSync(
      path.join(workflowDir, 'workflow.json'),
      JSON.stringify(workflow, null, 2),
      'utf8'
    );
    
    // Add workflow documentation
    fs.writeFileSync(
      path.join(workflowDir, 'WORKFLOW.md'),
      generateWorkflowDocs(workflowName, description, trigger, components, brainstormResult),
      'utf8'
    );
    
    // Create code.js file with placeholder
    fs.writeFileSync(
      path.join(workflowDir, 'code.js'),
      `// Workflow code for ${workflowName} (${workflowId})
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
    
    spinner.succeed('Workflow scaffolding complete!');
    
    // Display summary of what was created
    console.log(chalk.green(`\nWorkflow created: ${workflowName} (${workflowId})`));
    console.log(chalk.blue(`Workflow directory: ${workflowDir}`));
    console.log(chalk.cyan('\nComponents created:'));
    
    if (trigger && trigger.name) {
      console.log(chalk.yellow(`- ${trigger.name} (Trigger)`));
    }
    
    components.forEach(component => {
      if (component.type === 'action') {
        console.log(chalk.yellow(`- ${component.name} (Action)`));
      }
    });
    
    console.log(chalk.green('\nNext steps:'));
    console.log(chalk.yellow('1. Edit components in the components/ directory'));
    console.log(chalk.yellow(`2. Test the workflow: pdcreator test --path ${workflowDir} --watch`));
    console.log(chalk.yellow(`3. Deploy the workflow: pdcreator deploy --path ${workflowDir}`));
    
    return {
      workflowId,
      workflowDir,
      components: createdComponents.length
    };
  } catch (error) {
    spinner.fail('Error generating workflow');
    console.error(chalk.red('Error:'), error.message);
    throw error;
  }
}

function parseWorkflowDesign(designText) {
  const components = [];
  let trigger = null;
  
  // Look for trigger/source sections
  const triggerRegex = /(\b(?:trigger|source)\b.*?)(?:\n\s*##|\n\s*$)/gsi;
  const triggerMatch = triggerRegex.exec(designText);
  
  if (triggerMatch) {
    const triggerSection = triggerMatch[1];
    
    // Try to determine trigger type
    let triggerType = 'http';
    if (/\bschedule\b|\bcron\b|\bdaily\b|\bhourly\b/i.test(triggerSection)) {
      triggerType = 'schedule';
    }
    
    // Get trigger name
    const triggerNameMatch = triggerSection.match(/(?:trigger|source)(?:\s+component)?:?\s*([A-Za-z][A-Za-z0-9 ]+)/i);
    const triggerName = triggerNameMatch ? triggerNameMatch[1].trim() : 'Webhook Trigger';
    
    // Get app name
    let appName = null;
    const appMatch = triggerSection.match(/\b(github|slack|shopify|stripe|google|twitter|airtable|http|webhook|schedule|cron)\b/i);
    if (appMatch) {
      appName = appMatch[1].toLowerCase();
    }
    
    // Get description
    const descMatch = triggerSection.match(/description:?\s*"([^"]+)"/i);
    const description = descMatch ? descMatch[1] : '';
    
    // Get schedule if it's a schedule trigger
    let schedule = '0 0 * * *'; // Default to daily at midnight
    if (triggerType === 'schedule') {
      const scheduleMatch = triggerSection.match(/\bcron:?\s*["']([^"']+)["']/i);
      if (scheduleMatch) {
        schedule = scheduleMatch[1];
      } else if (/\bhourly\b/i.test(triggerSection)) {
        schedule = '0 * * * *';
      } else if (/\bdaily\b/i.test(triggerSection)) {
        schedule = '0 0 * * *';
      }
    }
    
    trigger = {
      type: triggerType,
      name: triggerName,
      app: appName,
      description,
      schedule
    };
  }
  
  // Look for action components
  const actionRegex = /\b(?:action|step)\b(?:.*?)(?:\n\s*##|\n\s*$)/gsi;
  let actionMatch;
  
  while ((actionMatch = actionRegex.exec(designText)) !== null) {
    const actionSection = actionMatch[0];
    
    // Get action name
    const nameMatch = actionSection.match(/(?:action|step)(?:\s+component)?:?\s*([A-Za-z][A-Za-z0-9 ]+)/i);
    if (!nameMatch) continue;
    
    const name = nameMatch[1].trim();
    
    // Get app name
    let app = null;
    const appMatch = actionSection.match(/\b(github|slack|shopify|stripe|google|twitter|airtable|http|email|sender)\b/i);
    if (appMatch) {
      app = appMatch[1].toLowerCase();
    }
    
    // Get description
    const descMatch = actionSection.match(/description:?\s*"([^"]+)"/i);
    const description = descMatch ? descMatch[1] : '';
    
    components.push({
      type: 'action',
      name,
      app,
      description
    });
  }
  
  return { trigger, components };
}

function generateWorkflowDocs(name, description, trigger, components, fullDesign) {
  return `# Workflow: ${name}

## Purpose
${description}

## Components

### Trigger: ${trigger ? trigger.name : 'Webhook Trigger'}
${trigger ? `- Type: ${trigger.type}` : '- Type: webhook'}
${trigger && trigger.description ? `- Description: ${trigger.description}` : ''}
${trigger && trigger.type === 'schedule' ? `- Schedule: ${trigger.schedule}` : ''}

${components.map(comp => `### Action: ${comp.name}
${comp.description ? `- Description: ${comp.description}` : ''}
${comp.app ? `- App: ${comp.app}` : ''}
`).join('\n')}

## Full Workflow Design
${fullDesign}

## Testing
To test this workflow:
\`\`\`bash
pdcreator test --path ./workflows/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')} --watch
\`\`\`

## Deployment
To deploy this workflow:
\`\`\`bash
pdcreator deploy --path ./workflows/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}
\`\`\`
`;
}

async function handleBrainstormScaffold(brainstormId) {
  try {
    const cacheDir = path.join(process.cwd(), '.pdcreator-cache');
    const brainstormPath = path.join(cacheDir, `brainstorm_${brainstormId}.md`);
    
    if (!fs.existsSync(brainstormPath)) {
      console.error(chalk.red(`Brainstorm file not found: ${brainstormPath}`));
      process.exit(1);
    }
    
    // Read the brainstorm file
    const content = fs.readFileSync(brainstormPath, 'utf8');
    
    // Parse the metadata
    const metadataMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
    if (!metadataMatch) {
      console.error(chalk.red('Invalid brainstorm file format'));
      process.exit(1);
    }
    
    // Extract metadata lines
    const metadataLines = metadataMatch[1].split('\n');
    const metadata = {};
    
    for (const line of metadataLines) {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length) {
        const value = valueParts.join(':').trim();
        metadata[key.trim()] = value.replace(/^"(.*)"$/, '$1'); // Remove quotes if present
      }
    }
    
    console.log(chalk.blue('Using brainstorm:'), metadata.description);
    
    // Get the content after the metadata
    const brainstormContent = content.slice(metadataMatch[0].length);
    
    // Analyze brainstorm content to determine component types
    const components = analyzeContent(brainstormContent);
    
    // Display identified components and let user select
    if (components.length === 0) {
      console.log(chalk.yellow('No components identified in the brainstorm content.'));
      
      // Fall back to manual creation
      const options = {};
      const answers = await gatherComponentInfo(options);
      await createComponentFiles(answers);
      
      return;
    }
    
    console.log(chalk.green(`\nIdentified ${components.length} possible components:`));
    
    for (let i = 0; i < components.length; i++) {
      console.log(chalk.cyan(`${i + 1}. ${components[i].name} (${components[i].type})`));
      console.log(`   ${components[i].description}`);
    }
    
    // Let user select which components to create
    const { selectedIndices } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedIndices',
        message: 'Select components to scaffold:',
        choices: components.map((c, i) => ({ name: `${c.name} (${c.type})`, value: i }))
      }
    ]);
    
    if (selectedIndices.length === 0) {
      console.log(chalk.yellow('No components selected. Exiting.'));
      return;
    }
    
    // Create selected components
    for (const index of selectedIndices) {
      const component = components[index];
      
      console.log(chalk.blue(`\nCreating component: ${component.name}`));
      
      await createComponentFiles({
        type: component.type,
        name: component.name,
        description: component.description,
        app: component.app || inferAppFromName(component.name)
      });
    }
    
    console.log(chalk.green('\nAll selected components have been created.'));
  } catch (error) {
    console.error(chalk.red('Error processing brainstorm:'), error.message);
    process.exit(1);
  }
}

function analyzeContent(content) {
  const components = [];
  
  // Look for component sections in the content
  const triggerRegex = /\b(Trigger|Source)\b[:\s]+[\w\s]+([\w-]+)/gi;
  const actionRegex = /\bAction\b[:\s]+[\w\s]+([\w-]+)/gi;
  const descriptionRegex = /description[:\s]+"([^"]+)"/i;
  
  // Find all potential triggers
  let match;
  while ((match = triggerRegex.exec(content)) !== null) {
    const nameLine = content.slice(match.index, match.index + 200);
    const nameMatch = nameLine.match(/\b([A-Z][a-z]+(\s+[A-Z][a-z]+)*)\b/);
    
    if (nameMatch) {
      const name = nameMatch[0];
      
      // Try to find a description near this trigger
      const descLine = content.slice(match.index, match.index + 300);
      const descMatch = descLine.match(descriptionRegex);
      
      components.push({
        type: 'source',
        name: name,
        description: descMatch ? descMatch[1] : `Trigger for ${name}`,
        app: inferAppFromName(name)
      });
    }
  }
  
  // Find all potential actions
  while ((match = actionRegex.exec(content)) !== null) {
    const nameLine = content.slice(match.index, match.index + 200);
    const nameMatch = nameLine.match(/\b([A-Z][a-z]+(\s+[A-Z][a-z]+)*)\b/);
    
    if (nameMatch) {
      const name = nameMatch[0];
      
      // Try to find a description near this action
      const descLine = content.slice(match.index, match.index + 300);
      const descMatch = descLine.match(descriptionRegex);
      
      components.push({
        type: 'action',
        name: name,
        description: descMatch ? descMatch[1] : `Action for ${name}`,
        app: inferAppFromName(name)
      });
    }
  }
  
  return components;
}

function inferAppFromName(name) {
  // Extract potential app name from component name
  // Common patterns: "GitHub Issue Created" -> "github"
  const words = name.split(/\s+/);
  if (words.length > 0) {
    return words[0].toLowerCase();
  }
  return '';
}

async function gatherComponentInfo(options) {
  const questions = [];
  
  if (!options.type) {
    questions.push({
      type: 'list',
      name: 'type',
      message: 'What type of component do you want to create?',
      choices: ['source', 'action'],
      default: 'source'
    });
  }
  
  if (!options.name) {
    questions.push({
      type: 'input',
      name: 'name',
      message: 'Enter component name:',
      validate: (input) => input.length > 0 || 'Component name is required'
    });
  }
  
  if (!options.description) {
    questions.push({
      type: 'input',
      name: 'description',
      message: 'Enter component description:',
      validate: (input) => input.length > 0 || 'Component description is required'
    });
  }
  
  if (!options.app) {
    questions.push({
      type: 'input',
      name: 'app',
      message: 'Enter app name (e.g. github, slack):',
      default: (answers) => {
        // Try to infer app name from component name
        const componentName = options.name || answers.name || '';
        return inferAppFromName(componentName);
      }
    });
  }
  
  // If there are questions to ask, prompt the user
  if (questions.length > 0) {
    const answers = await inquirer.prompt(questions);
    return { ...options, ...answers };
  }
  
  return options;
}

async function createComponentFiles(componentInfo) {
  const { type, name, description, app } = componentInfo;
  
  // Format component key
  const key = `${app.toLowerCase()}-${name.toLowerCase().replace(/\s+/g, '-')}`;
  
  // Create component directory
  const componentsDir = path.join(process.cwd(), 'components');
  const componentDir = path.join(componentsDir, key);
  
  if (!fs.existsSync(componentsDir)) {
    fs.mkdirSync(componentsDir, { recursive: true });
  }
  
  if (!fs.existsSync(componentDir)) {
    fs.mkdirSync(componentDir, { recursive: true });
  }
  
  // Determine the template to use
  let templatePath;
  if (type === 'source') {
    templatePath = path.join(__dirname, '../templates/source/basic-source.mjs.hbs');
  } else {
    templatePath = path.join(__dirname, '../templates/action/basic-action.mjs.hbs');
  }
  
  // If template doesn't exist yet, use AI to generate the component
  if (!fs.existsSync(templatePath)) {
    console.log(chalk.yellow(`Template not found: ${templatePath}`));
    console.log(chalk.blue('Generating component with Claude AI...'));
    
    const spinner = ora('Generating component with Claude AI...').start();
    
    try {
      const componentCode = await aiClient.generateComponent(type, {
        name,
        description,
        app,
        key
      });
      
      spinner.succeed('Component generated successfully!');
      
      // Save the component file
      const componentFilePath = path.join(componentDir, 'index.mjs');
      fs.writeFileSync(componentFilePath, componentCode, 'utf8');
      
      console.log(chalk.green(`\nComponent created at: ${componentFilePath}`));
      return { key, type, name, description, app, path: componentFilePath };
    } catch (error) {
      spinner.fail('Failed to generate component with Claude AI');
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  }
  
  // Read and compile the template
  const templateContent = fs.readFileSync(templatePath, 'utf8');
  const template = Handlebars.compile(templateContent);
  
  // Prepare template data
  const templateData = {
    key,
    name,
    description,
    app,
    version: '0.1.0',
    date: new Date().toISOString()
  };
  
  // Render the template
  const renderedComponent = template(templateData);
  
  // Save the component file
  const componentFilePath = path.join(componentDir, 'index.mjs');
  fs.writeFileSync(componentFilePath, renderedComponent, 'utf8');
  
  console.log(chalk.green(`\nComponent created at: ${componentFilePath}`));
  
  // Create a README.md file
  const readmeContent = `# ${name}

${description}

## Component Type
${type === 'source' ? 'Source/Trigger' : 'Action'}

## App
${app}

## Key
\`${key}\`

## Version
0.1.0

## Created
${new Date().toISOString()}

## Usage
This component was generated with pdcreator. To use it in Pipedream:

1. Deploy this component to Pipedream
2. Configure the component props
3. Test with sample data

## Development
To modify this component:

\`\`\`bash
# Edit the component
cd ${componentDir}
# Test the component
pdcreator test --path ${componentDir}
# Deploy to Pipedream
pdcreator deploy --path ${componentDir}
\`\`\`
`;

  fs.writeFileSync(path.join(componentDir, 'README.md'), readmeContent, 'utf8');
  
  // Create a test directory and file
  const testDir = path.join(componentDir, 'test');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  
  const testFileContent = `// Test file for ${key}
const component = require('../index.mjs');

describe('${name}', () => {
  it('should be properly configured', () => {
    expect(component).toHaveProperty('key', '${key}');
    expect(component).toHaveProperty('name', '${name}');
    expect(component).toHaveProperty('version', '0.1.0');
    expect(component).toHaveProperty('type', '${type}');
  });
  
  // Add more tests here
});
`;

  fs.writeFileSync(path.join(testDir, 'index.test.js'), testFileContent, 'utf8');
  
  return { key, type, name, description, app, path: componentFilePath };
}

module.exports = { execute };