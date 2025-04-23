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
    // Process from-brainstorm option
    if (options.fromBrainstorm) {
      return handleBrainstormScaffold(options.fromBrainstorm);
    }
    
    // Otherwise proceed with regular scaffolding
    const answers = await gatherComponentInfo(options);
    
    // Generate component files
    await createComponentFiles(answers);
  } catch (error) {
    console.error(chalk.red('Error during scaffolding:'), error.message);
    process.exit(1);
  }
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
  const key = `${app.toLowerCase()}-${name.toLowerCase().replace(/\\s+/g, '-')}`;
  
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
      return;
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
}

module.exports = { execute };