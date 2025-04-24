const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const aiClient = require('../utils/ai-client');
const pdManagerClient = require('../utils/pdmanager-client');
const configManager = require('../utils/config-manager');
const validation = require('../utils/validation');

/**
 * Develop command implementation
 * Generates code for workflows or components
 */
const develop = async (options) => {
  // Validate options
  if (!options.workflow) {
    console.log(chalk.red('Error: Workflow path is required'));
    return;
  }
  
  // Check if pdmanager is installed
  const pdManagerInstalled = await pdManagerClient.checkInstallation();
  if (!pdManagerInstalled) {
    console.log(chalk.red('Error: pdmanager tool is required but not found in PATH'));
    return;
  }
  
  // Check if API credentials are configured
  if (!configManager.hasClaudeApiKey()) {
    console.log(chalk.red('Claude API key not configured.'));
    console.log(chalk.yellow('Run "pdcreator config setup" to configure your API keys.'));
    return;
  }
  
  try {
    // Resolve the workflow path
    const workflowPath = path.resolve(options.workflow);
    
    // Check if this is an existing Pipedream workflow directory
    const isExistingWorkflow = validation.isWorkflowDirectory(workflowPath);
    
    if (isExistingWorkflow) {
      // Handle developing an existing workflow
      await developExistingWorkflow(workflowPath, options);
    } else {
      // Handle creating a new workflow
      await developNewWorkflow(workflowPath, options);
    }
  } catch (error) {
    console.error(chalk.red('Error developing workflow:'), error.message);
  }
};

/**
 * Develop an existing workflow
 */
const developExistingWorkflow = async (workflowPath, options) => {
  console.log(chalk.cyan(`Developing existing workflow at ${workflowPath}`));
  
  // Load workflow.json
  const workflowJsonPath = path.join(workflowPath, 'workflow.json');
  const workflowJson = JSON.parse(fs.readFileSync(workflowJsonPath, 'utf8'));
  
  // If a specific step is specified, develop just that step
  if (options.step) {
    await developStep(workflowPath, workflowJson, options.step, options.prompt);
  } else {
    // Otherwise update the entire workflow
    await updateEntireWorkflow(workflowPath, workflowJson, options.prompt);
  }
};

/**
 * Develop a new workflow
 */
const developNewWorkflow = async (workflowPath, options) => {
  console.log(chalk.cyan(`Creating new workflow at ${workflowPath}`));
  
  // Check for design.md file
  const designPath = path.join(workflowPath, 'design.md');
  let workflowDesign = '';
  
  if (fs.existsSync(designPath)) {
    console.log(chalk.green('Found workflow design file, using as input...'));
    workflowDesign = fs.readFileSync(designPath, 'utf8');
  } else {
    console.log(chalk.yellow('No design.md file found, proceeding with minimal input...'));
    // Use the workflow directory name as a minimal prompt
    const workflowName = path.basename(workflowPath);
    workflowDesign = `Create a workflow named "${workflowName}"`;
    
    if (options.prompt) {
      workflowDesign += ` that ${options.prompt}`;
    }
  }
  
  // Create project in Pipedream
  const spinner = ora('Creating project via pdmanager...').start();
  const projectName = path.basename(workflowPath);
  
  try {
    const projectId = await pdManagerClient.createProject(projectName);
    spinner.succeed(`Project created with ID: ${projectId}`);
    
    // Create workflow in Pipedream
    const workflowSpinner = ora('Registering workflow via pdmanager...').start();
    const workflowId = await pdManagerClient.createWorkflow(projectName, projectId);
    workflowSpinner.succeed(`Workflow created with ID: ${workflowId}`);
    
    // Create proper directory structure with the workflow ID
    const workflowIdDir = path.join(process.cwd(), 'workflows', workflowId);
    fs.ensureDirSync(workflowIdDir);
    
    // Generate workflow files
    await generateWorkflowFiles(workflowIdDir, workflowId, projectId, workflowDesign, options.prompt);
    
    // Create symlink from original path to the workflow ID directory if they're different
    if (workflowPath !== workflowIdDir) {
      // If the original directory exists, back it up
      if (fs.existsSync(workflowPath) && fs.statSync(workflowPath).isDirectory()) {
        const backupPath = `${workflowPath}_backup_${Date.now()}`;
        fs.moveSync(workflowPath, backupPath);
        console.log(chalk.yellow(`Existing directory backed up to ${backupPath}`));
      }
      
      // Create parent directory if it doesn't exist
      fs.ensureDirSync(path.dirname(workflowPath));
      
      // Create symlink
      fs.symlinkSync(workflowIdDir, workflowPath, 'dir');
      console.log(chalk.green(`Created symlink from ${workflowPath} to ${workflowIdDir}`));
    }
    
    console.log(chalk.green('✨ Workflow development complete!'));
  } catch (error) {
    spinner.fail(`Failed to create project: ${error.message}`);
    throw error;
  }
};

/**
 * Generate workflow files from design
 */
const generateWorkflowFiles = async (workflowDir, workflowId, projectId, workflowDesign, additionalPrompt = '') => {
  // Generate workflow.json and code.js using AI
  const spinner = ora('Generating workflow files...').start();
  
  try {
    // Prepare prompt for AI
    let prompt = `Create a Pipedream workflow based on this design:\n\n${workflowDesign}\n\n`;
    prompt += `The workflow ID is ${workflowId} and the project ID is ${projectId}.\n`;
    prompt += `Generate two files:\n`;
    prompt += `1. workflow.json - The workflow configuration with proper IDs and structure\n`;
    prompt += `2. code.js - The JavaScript code for the workflow\n`;
    
    if (additionalPrompt) {
      prompt += `\nAdditional requirements: ${additionalPrompt}\n`;
    }
    
    prompt += `\nReturn your response in the following format:
===WORKFLOW.JSON===
{
  // workflow.json content here
}
===CODE.JS===
// code.js content here
`;
    
    // Call Claude to generate the files
    const response = await aiClient.callClaude(prompt, {
      max_tokens: 8000,
      temperature: 0.2
    });
    
    // Parse the response to extract the files
    const workflowJsonMatch = response.match(/===WORKFLOW\.JSON===\s*([\s\S]*?)(?====CODE\.JS===|$)/);
    const codeJsMatch = response.match(/===CODE\.JS===\s*([\s\S]*?)(?=$)/);
    
    let workflowJson = '';
    let codeJs = '';
    
    if (workflowJsonMatch && workflowJsonMatch[1]) {
      workflowJson = workflowJsonMatch[1].trim();
      // Clean up any markdown code block formatting
      workflowJson = workflowJson.replace(/```json\s*/, '').replace(/```\s*$/, '');
    }
    
    if (codeJsMatch && codeJsMatch[1]) {
      codeJs = codeJsMatch[1].trim();
      // Clean up any markdown code block formatting
      codeJs = codeJs.replace(/```javascript\s*/, '').replace(/```js\s*/, '').replace(/```\s*$/, '');
    }
    
    // Make sure we have both files
    if (!workflowJson || !codeJs) {
      throw new Error('Failed to generate one or both workflow files');
    }
    
    // Clean and parse the workflow.json to ensure it's valid
    try {
      const jsonObj = JSON.parse(workflowJson);
      
      // Ensure required fields
      jsonObj.id = workflowId;
      jsonObj.project_id = projectId;
      
      // Write file with pretty formatting
      workflowJson = JSON.stringify(jsonObj, null, 2);
    } catch (error) {
      console.log(chalk.yellow('Warning: Generated workflow.json was not valid JSON. Attempting to fix...'));
      // Basic cleanup attempt - very simplistic
      workflowJson = workflowJson
        .replace(/\/\/.*$/gm, '') // Remove comments
        .replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas
      
      try {
        // Try parsing again
        const jsonObj = JSON.parse(workflowJson);
        jsonObj.id = workflowId;
        jsonObj.project_id = projectId;
        workflowJson = JSON.stringify(jsonObj, null, 2);
      } catch (parseError) {
        throw new Error(`Could not fix workflow.json: ${parseError.message}`);
      }
    }
    
    // Write the files
    fs.writeFileSync(path.join(workflowDir, 'workflow.json'), workflowJson);
    fs.writeFileSync(path.join(workflowDir, 'code.js'), codeJs);
    
    // Create components directory and test fixtures
    const componentsDir = path.join(workflowDir, 'components');
    fs.ensureDirSync(componentsDir);
    
    const testFixturesDir = path.join(workflowDir, 'tests', 'fixtures');
    fs.ensureDirSync(testFixturesDir);
    
    // Generate basic test fixtures
    generateTestFixtures(workflowDir, JSON.parse(workflowJson));
    
    spinner.succeed('Workflow files generated successfully');
    
    // Display summary
    console.log(chalk.green('\nFiles created:'));
    console.log(chalk.white(`- ${path.join(workflowDir, 'workflow.json')}`));
    console.log(chalk.white(`- ${path.join(workflowDir, 'code.js')}`));
    console.log(chalk.white(`- ${testFixturesDir} (test fixtures directory)`));
    
    return {
      workflowDir,
      workflowJson: JSON.parse(workflowJson),
      codeJs
    };
  } catch (error) {
    spinner.fail(`Failed to generate workflow files: ${error.message}`);
    throw error;
  }
};

/**
 * Develop a specific step in a workflow
 */
const developStep = async (workflowPath, workflowJson, stepName, additionalPrompt = '') => {
  console.log(chalk.cyan(`Developing step: ${stepName}`));
  
  // Prepare the component directory if it doesn't exist
  const componentsDir = path.join(workflowPath, 'components');
  fs.ensureDirSync(componentsDir);
  const componentPath = path.join(componentsDir, `${stepName}.js`);
  
  // Check if we're updating an existing component
  const isUpdating = fs.existsSync(componentPath);
  
  // Load the current component code if it exists
  let currentCode = '';
  if (isUpdating) {
    currentCode = fs.readFileSync(componentPath, 'utf8');
  }
  
  // Get the workflow code.js to understand the context
  const codeJsPath = path.join(workflowPath, 'code.js');
  const codeJs = fs.existsSync(codeJsPath) ? fs.readFileSync(codeJsPath, 'utf8') : '';
  
  // Generate the component
  const spinner = ora(`${isUpdating ? 'Updating' : 'Generating'} component code...`).start();
  
  try {
    // Determine the component type (action or source)
    const componentType = determineComponentType(stepName, codeJs, workflowJson);
    
    // Prepare prompt for AI
    let prompt = `${isUpdating ? 'Update' : 'Create'} a Pipedream ${componentType} component for a step named "${stepName}".\n\n`;
    
    if (isUpdating) {
      prompt += `Here is the current implementation:\n\`\`\`javascript\n${currentCode}\n\`\`\`\n\n`;
    }
    
    prompt += `Here is the workflow context:\n\`\`\`javascript\n${codeJs}\n\`\`\`\n\n`;
    prompt += `Here is the workflow configuration:\n\`\`\`json\n${JSON.stringify(workflowJson, null, 2)}\n\`\`\`\n\n`;
    
    if (additionalPrompt) {
      prompt += `Additional requirements: ${additionalPrompt}\n\n`;
    }
    
    prompt += `Return only the complete component code without explanations or markdown formatting.`;
    
    // Call Claude to generate the component
    const componentCode = await aiClient.callClaude(prompt, {
      max_tokens: 4000,
      temperature: 0.2
    });
    
    // Clean the response
    let cleanedCode = componentCode.trim();
    
    // Strip any markdown formatting
    if (cleanedCode.startsWith('```javascript') || cleanedCode.startsWith('```js')) {
      cleanedCode = cleanedCode.replace(/```(javascript|js)\s/, '').replace(/```\s*$/, '');
    }
    
    // Write the component file
    fs.writeFileSync(componentPath, cleanedCode);
    
    // Update test fixtures for this component
    const testFixturesDir = path.join(workflowPath, 'tests', 'fixtures', stepName);
    fs.ensureDirSync(testFixturesDir);
    
    // Generate basic test input
    const testInputPath = path.join(testFixturesDir, 'input.json');
    if (!fs.existsSync(testInputPath)) {
      fs.writeFileSync(testInputPath, JSON.stringify({ test: "data" }, null, 2));
    }
    
    spinner.succeed(`Component successfully ${isUpdating ? 'updated' : 'developed'}!`);
    console.log(chalk.green(`Component saved to: ${componentPath}`));
    console.log(chalk.green(`Test fixtures directory: ${testFixturesDir}`));
    
    return componentPath;
  } catch (error) {
    spinner.fail(`Failed to ${isUpdating ? 'update' : 'generate'} component: ${error.message}`);
    throw error;
  }
};

/**
 * Update an entire workflow
 */
const updateEntireWorkflow = async (workflowPath, workflowJson, additionalPrompt = '') => {
  console.log(chalk.cyan(`Updating entire workflow at ${workflowPath}`));
  
  // Get the current code.js
  const codeJsPath = path.join(workflowPath, 'code.js');
  const currentCodeJs = fs.existsSync(codeJsPath) ? fs.readFileSync(codeJsPath, 'utf8') : '';
  
  // Generate updated workflow files
  const spinner = ora('Generating updated workflow code...').start();
  
  try {
    // Prepare prompt for AI
    let prompt = `Update this Pipedream workflow.\n\n`;
    prompt += `Current workflow.json:\n\`\`\`json\n${JSON.stringify(workflowJson, null, 2)}\n\`\`\`\n\n`;
    prompt += `Current code.js:\n\`\`\`javascript\n${currentCodeJs}\n\`\`\`\n\n`;
    
    if (additionalPrompt) {
      prompt += `Update requirements: ${additionalPrompt}\n\n`;
    }
    
    prompt += `Return your response in the following format:
===WORKFLOW.JSON===
{
  // updated workflow.json content here
}
===CODE.JS===
// updated code.js content here
`;
    
    // Call Claude to generate the updated files
    const response = await aiClient.callClaude(prompt, {
      max_tokens: 8000,
      temperature: 0.2
    });
    
    // Parse the response to extract the files
    const workflowJsonMatch = response.match(/===WORKFLOW\.JSON===\s*([\s\S]*?)(?====CODE\.JS===|$)/);
    const codeJsMatch = response.match(/===CODE\.JS===\s*([\s\S]*?)(?=$)/);
    
    let updatedWorkflowJson = '';
    let updatedCodeJs = '';
    
    if (workflowJsonMatch && workflowJsonMatch[1]) {
      updatedWorkflowJson = workflowJsonMatch[1].trim();
      // Clean up any markdown code block formatting
      updatedWorkflowJson = updatedWorkflowJson.replace(/```json\s*/, '').replace(/```\s*$/, '');
    }
    
    if (codeJsMatch && codeJsMatch[1]) {
      updatedCodeJs = codeJsMatch[1].trim();
      // Clean up any markdown code block formatting
      updatedCodeJs = updatedCodeJs.replace(/```javascript\s*/, '').replace(/```js\s*/, '').replace(/```\s*$/, '');
    }
    
    // Make sure we have both files
    if (!updatedWorkflowJson || !updatedCodeJs) {
      throw new Error('Failed to generate one or both updated workflow files');
    }
    
    // Clean and parse the workflow.json to ensure it's valid
    try {
      const jsonObj = JSON.parse(updatedWorkflowJson);
      
      // Ensure ID remains the same
      jsonObj.id = workflowJson.id;
      if (workflowJson.project_id) {
        jsonObj.project_id = workflowJson.project_id;
      }
      
      // Write file with pretty formatting
      updatedWorkflowJson = JSON.stringify(jsonObj, null, 2);
    } catch (error) {
      console.log(chalk.yellow('Warning: Generated workflow.json was not valid JSON. Attempting to fix...'));
      // Basic cleanup attempt
      updatedWorkflowJson = updatedWorkflowJson
        .replace(/\/\/.*$/gm, '')
        .replace(/,(\s*[}\]])/g, '$1');
      
      try {
        // Try parsing again
        const jsonObj = JSON.parse(updatedWorkflowJson);
        jsonObj.id = workflowJson.id;
        if (workflowJson.project_id) {
          jsonObj.project_id = workflowJson.project_id;
        }
        updatedWorkflowJson = JSON.stringify(jsonObj, null, 2);
      } catch (parseError) {
        throw new Error(`Could not fix workflow.json: ${parseError.message}`);
      }
    }
    
    // Write the updated files
    fs.writeFileSync(path.join(workflowPath, 'workflow.json'), updatedWorkflowJson);
    fs.writeFileSync(path.join(workflowPath, 'code.js'), updatedCodeJs);
    
    // Update test fixtures
    const updatedWorkflowObj = JSON.parse(updatedWorkflowJson);
    generateTestFixtures(workflowPath, updatedWorkflowObj);
    
    spinner.succeed('Workflow updated successfully');
    
    return {
      workflowPath,
      workflowJson: updatedWorkflowObj,
      codeJs: updatedCodeJs
    };
  } catch (error) {
    spinner.fail(`Failed to update workflow: ${error.message}`);
    throw error;
  }
};

/**
 * Generate test fixtures for a workflow
 */
const generateTestFixtures = (workflowDir, workflowJson) => {
  const testFixturesDir = path.join(workflowDir, 'tests', 'fixtures');
  fs.ensureDirSync(testFixturesDir);
  
  // Generate test input data
  const inputFixturePath = path.join(testFixturesDir, 'input.json');
  if (!fs.existsSync(inputFixturePath)) {
    // Create sample test data based on the trigger type
    let sampleInput = {};
    
    if (workflowJson.trigger && workflowJson.trigger.type === 'http') {
      sampleInput = {
        body: { test: "data" },
        headers: {
          "content-type": "application/json",
          "user-agent": "Pipedream Test"
        },
        method: "POST",
        path: workflowJson.trigger.path || ""
      };
    } else if (workflowJson.trigger && workflowJson.trigger.type === 'schedule') {
      sampleInput = {
        timestamp: new Date().toISOString()
      };
    }
    
    fs.writeFileSync(inputFixturePath, JSON.stringify(sampleInput, null, 2));
  }
  
  // Generate expected output fixture
  const outputFixturePath = path.join(testFixturesDir, 'expected_output.json');
  if (!fs.existsSync(outputFixturePath)) {
    const sampleOutput = { success: true, message: "Workflow executed successfully" };
    fs.writeFileSync(outputFixturePath, JSON.stringify(sampleOutput, null, 2));
  }
};

/**
 * Determine the component type based on the step name and workflow code
 */
const determineComponentType = (stepName, codeJs, workflowJson) => {
  // Default to action
  let componentType = 'action';
  
  // Check if this is the trigger
  if (workflowJson.trigger && 
      (workflowJson.trigger.key === stepName || 
       stepName.toLowerCase().includes('trigger'))) {
    componentType = 'source';
  }
  
  // Look for type hints in the code
  if (codeJs.includes(`type: "source"`) && 
      codeJs.includes(`key: "${stepName}"`)) {
    componentType = 'source';
  }
  
  return componentType;
};

module.exports = develop;