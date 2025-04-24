const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');
const aiClient = require('../utils/ai-client');
const configManager = require('../utils/config-manager');

/**
 * Brainstorm command implementation
 * Generates workflow ideas and structures using Claude AI
 */
const brainstorm = async (description, options) => {
  // Check if Claude API key is configured
  if (!configManager.hasClaudeApiKey()) {
    console.log(chalk.red('Claude API key not configured.'));
    console.log(chalk.yellow('Run "pdcreator config setup" to configure your API keys.'));
    return;
  }

  let workflowPath;
  let workflowName;

  try {
    // Generate initial workflow idea
    const spinner = ora('Connecting to Claude AI...').start();
    let workflowIdea = await aiClient.brainstormWorkflow(description);
    spinner.succeed('Generated initial workflow idea');

    // Display the result
    console.log('\n' + chalk.cyan('Proposed Workflow:'));
    console.log(chalk.white('=====================================================\n'));
    console.log(workflowIdea);
    console.log('\n' + chalk.white('=====================================================\n'));

    // Interactive feedback loop
    let satisfied = false;
    while (!satisfied) {
      const { makeChanges } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'makeChanges',
          message: 'Do you want to make any changes to this workflow design?',
          default: false
        }
      ]);

      if (!makeChanges) {
        satisfied = true;
      } else {
        // Get feedback from user
        const { feedback } = await inquirer.prompt([
          {
            type: 'input',
            name: 'feedback',
            message: 'What would you like to change?',
            validate: input => input.length > 0 ? true : 'Please provide feedback'
          }
        ]);

        // Update the workflow idea
        const updateSpinner = ora('Updating workflow design...').start();
        workflowIdea = await aiClient.refineIdea(workflowIdea, feedback);
        updateSpinner.succeed('Updated workflow design');

        // Display the updated result
        console.log('\n' + chalk.cyan('Updated Workflow:'));
        console.log(chalk.white('=====================================================\n'));
        console.log(workflowIdea);
        console.log('\n' + chalk.white('=====================================================\n'));
      }
    }

    // Save the final result
    workflowName = generateWorkflowName(description);
    
    // Determine output location
    if (options.output) {
      // Use explicit output path if provided
      workflowPath = path.resolve(options.output);
    } else {
      // Ask if user wants to save
      const { saveResult } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'saveResult',
          message: 'Do you want to save this workflow design?',
          default: true
        }
      ]);

      if (saveResult) {
        // Get directory name from user if not specified
        const { dirName } = await inquirer.prompt([
          {
            type: 'input',
            name: 'dirName',
            message: 'Enter directory name for this workflow:',
            default: workflowName
          }
        ]);
        
        workflowPath = path.resolve(process.cwd(), dirName);
      }
    }

    // Save if we have a workflow path
    if (workflowPath) {
      // Create project directory structure
      fs.ensureDirSync(workflowPath);
      
      // Create design directory
      const designDir = path.join(workflowPath, 'design');
      fs.ensureDirSync(designDir);
      
      // Save design document
      const designPath = path.join(designDir, 'design.md');
      const designContent = `# ${workflowName}\n\n${workflowIdea}`;
      fs.writeFileSync(designPath, designContent);
      
      // Create empty workflows directory to maintain consistent structure
      fs.ensureDirSync(path.join(workflowPath, 'workflows'));
      
      // Create config.ini with initial metadata
      const configPath = path.join(workflowPath, 'config.ini');
      const configContent = `[project]
name = ${workflowName}
created_at = ${new Date().toISOString()}

[design]
description = ${description.replace(/\n/g, ' ')}
`;
      fs.writeFileSync(configPath, configContent);
      
      console.log(chalk.green(`💾 Workflow design saved to ${workflowPath}`));
      console.log(chalk.green('✅ Workflow design saved and ready for development!'));
      
      // Generate a development instruction for the user
      console.log(chalk.cyan(`\nTo develop this workflow, run:`));
      console.log(chalk.white(`pdcreator develop --workflow ${workflowPath}`));
    }

    return {
      name: workflowName,
      design: workflowIdea,
      path: workflowPath
    };
  } catch (error) {
    console.error(chalk.red('Error generating workflow:'), error.message);
    throw error;
  }
};

// Generate a workflow name from a description
const generateWorkflowName = (description) => {
  // Extract main keywords
  const keywords = description
    .toLowerCase()
    .replace(/[^\w\s]/g, '')  // Remove punctuation
    .split(/\s+/)              // Split on whitespace
    .filter(word => word.length > 3)  // Keep only words longer than 3 chars
    .slice(0, 4);              // Take up to 4 keywords
  
  // Join with hyphens and add timestamp if no good keywords
  const name = keywords.length > 0 
    ? keywords.join('-')
    : `workflow-${Date.now()}`;
  
  return name;
};

module.exports = brainstorm;