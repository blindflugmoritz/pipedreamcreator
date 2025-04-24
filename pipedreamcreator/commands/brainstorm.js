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
    const workflowName = generateWorkflowName(description);
    let outputPath = options.output;
    
    // If no output path provided, generate one
    if (!outputPath) {
      const { saveResult } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'saveResult',
          message: 'Do you want to save this workflow design?',
          default: true
        }
      ]);

      if (saveResult) {
        // Create workflows directory if it doesn't exist
        const workflowsDir = path.join(process.cwd(), 'workflows');
        fs.ensureDirSync(workflowsDir);
        
        // Create subdirectory for this workflow
        const workflowDir = path.join(workflowsDir, workflowName);
        fs.ensureDirSync(workflowDir);
        
        outputPath = path.join(workflowDir, 'design.md');
      }
    }

    // Save if we have an output path
    if (outputPath) {
      const designContent = `# ${workflowName}\n\n${workflowIdea}`;
      fs.writeFileSync(outputPath, designContent);
      console.log(chalk.green(`💾 Workflow design saved to ${outputPath}`));
      console.log(chalk.green('✅ Workflow design saved and ready for development!'));
    }

    return {
      name: workflowName,
      design: workflowIdea,
      path: outputPath
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