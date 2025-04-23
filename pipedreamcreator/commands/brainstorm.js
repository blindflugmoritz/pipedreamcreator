const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const { nanoid } = require('nanoid');
const aiClient = require('../utils/ai-client');

async function execute(description, options) {
  try {
    // If no description provided, prompt the user
    if (!description) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'description',
          message: 'Describe the workflow you want to create:',
          validate: (input) => input.length > 10 || 'Please provide a more detailed description'
        }
      ]);
      description = answers.description;
    }
    
    // Generate a unique ID for this brainstorm session
    const brainstormId = nanoid(8);
    
    // Create output directory if it doesn't exist
    const outputDir = path.join(process.cwd(), '.pdcreator-cache');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Generate the workflow ideas with Claude
    const spinner = ora('Brainstorming workflow with Claude AI...').start();
    const response = await aiClient.brainstormWorkflow(description);
    spinner.succeed('Workflow ideas generated!');
    
    // Save the output
    const outputPath = options.output || path.join(outputDir, `brainstorm_${brainstormId}.md`);
    
    // Add metadata at the top of the file
    const metadata = `---
id: ${brainstormId}
description: "${description}"
created_at: ${new Date().toISOString()}
---

`;
    
    fs.writeFileSync(outputPath, metadata + response, 'utf8');
    
    console.log(chalk.green(`\nWorkflow ideas saved to: ${outputPath}`));
    console.log(chalk.blue(`\nTo scaffold a component from these ideas, run:`));
    console.log(chalk.yellow(`  pdcreator scaffold --from-brainstorm ${brainstormId}`));
    
    // Display a preview of the ideas
    console.log(chalk.cyan('\n=== Workflow Ideas Preview ==='));
    
    // Show first 10 lines as a preview
    const preview = response.split('\n').slice(0, 10).join('\n');
    console.log(preview + (response.split('\n').length > 10 ? '\n...' : ''));
    
    return { brainstormId, outputPath };
  } catch (error) {
    console.error(chalk.red('Error during brainstorming:'), error.message);
    process.exit(1);
  }
}

module.exports = { execute };