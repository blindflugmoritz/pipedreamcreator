# Pipedream Component Creator Tool Architecture

The pdcreator tool should be implemented in the folder `/Users/mz/coding/pipedreamcreator/` which is on the same level as the existing `/Users/mz/coding/pipedreammanager/` directory. This ensures consistent organization and makes integration between the tools more intuitive.

```
/Users/mz/coding/
+-- pipedreammanager/   # Existing tool
+-- pipedreamcreator/   # New tool to be implemented
    +-- commands/
    |   +-- brainstorm.js      # Generate workflow ideas with Claude
    |   +-- develop.js         # Local development environment
    |   +-- test.js            # Test component and workflow functionality
    |   +-- config.js          # Manage tool configuration
    +-- templates/
    |   +-- action/            # Action component templates
    |   +-- source/            # Trigger component templates
    |   +-- prompts/           # Claude AI prompt templates
    +-- testing/
    |   +-- mocks/             # Mock Pipedream environment
    |   +-- fixtures/          # Test data
    +-- utils/
        +-- ai-client.js       # Interface with Claude AI
        +-- pdmanager-client.js # Interface with pdmanager
        +-- validation.js      # Component schema validation
        +-- config-manager.js  # Configuration management
```

This architecture integrates with the existing pdmanager to handle authentication and deployment, with a focus on four core functionalities:

1. **Configuration** - Manage API credentials and tool settings
2. **Brainstorming** - Generate workflow ideas and structures using Claude AI
3. **Development** - Local development environment with hot-reloading
4. **Testing** - Verify functionality of components and workflows

## Command Specifications

### Config Command

The `config` command manages the tool's configuration, including API credentials and other settings.

```bash
# Interactive setup
pdcreator config setup

# View current configuration
pdcreator config list

# Set individual configuration values
pdcreator config set <key> <value>

# Get a configuration value
pdcreator config get <key>
```

The config command:
1. Creates and manages the central configuration file (~/.pdcreator/config.json)
2. Handles API credentials for Claude, GitHub, and Pipedream
3. Securely stores sensitive information
4. Makes credentials available to all other commands
5. Provides inheritance of credentials to generated workflows

#### Implementation Details

- Create a secure storage mechanism for API keys and credentials
- Implement encryption for sensitive information
- Provide both interactive and command-line configuration options
- Share configuration with pdmanager when appropriate
- Auto-detect existing credentials from environment variables or pdmanager configuration

### Brainstorm Command

The `brainstorm` command is the beginning of each development process. It leverages Claude to generate structured workflows with component recommendations that match the pdmanager format, ensuring seamless integration between the tools.

```bash
# Generate workflow ideas with AI assistance
pdcreator brainstorm "Monitor GitHub for new issues and post to Slack"

# Specify output location
pdcreator brainstorm "Send daily weather updates to email" --output workflow-ideas.md
```

When a user runs the brainstorm command:
1. The tool connects to Claude AI with the provided description
2. Claude generates a comprehensive workflow design including:
   - Trigger type recommendation
   - Required steps and their sequence
   - Data flow between components
   - Sample data structures
3. The output is presented to the user for feedback
4. The brainstorm session stays open interactively until the user is satisfied
5. When approved, the brainstorm results are saved for use in the develop command

The brainstorm command focuses on creating reusable steps in the workflow design, ensuring that components can be leveraged across multiple workflows when appropriate.

#### Implementation Details

- Use the Anthropic API client to interact with Claude
- Format prompts to elicit structured responses with specific sections
- Parse and format the AI response to be immediately useful
- Implement an interactive feedback loop to refine the workflow design
- Save approved designs for use in the develop command

### Develop Command

The `develop` command is responsible for actually writing the workflow folder and data structure, including all steps, code, and required IDs. It transforms the brainstormed ideas into working implementation.

```bash
# Generate code for an entire workflow
pdcreator develop -w ./workflows/github-to-slack

# Generate code for a specific step within a workflow
pdcreator develop -w ./workflows/github-to-slack -s format-message

# Provide additional prompt for better specification
pdcreator develop -w ./workflows/github-to-slack --prompt "Include issue priority detection"
```

The develop command:
1. Takes the saved brainstorm results as input
2. Calls `pdmanager create-project` to establish a new project on Pipedream.com (if needed)
3. Calls `pdmanager create-workflow` to create a new workflow online and obtain the proper p_XXXXXX workflow ID
4. Creates the necessary directory structure following the p_XXXXXX format from Pipedream.com
5. Generates workflow.json with the proper IDs and configuration
6. Writes code.js files for each component
7. Automatically generates tests for the workflow and components
8. Provides flexibility to develop entire workflows or individual steps

#### Implementation Details

- Create a workflow generator that adheres to Pipedream's format
- Implement code generation for different component types
- Leverage Claude AI for writing component code
- Generate appropriate test fixtures for automated testing
- Ensure all IDs and references are correctly linked
- Maintain compatibility with pdmanager's expected structure

#### Development Options

- Full workflow generation (-w): Create all files for a complete workflow
- Single step generation (-w -s): Focus on one component in a workflow
- Additional prompt (--prompt): Provide extra specification for Claude
- Test generation (automatic): Create test fixtures for each component

### Test Command

The `test` command runs a test environment in which you can execute workflows and verify that they generate the correct output data.

```bash
# Test a component
pdcreator test --path ./workflows/p_ABC123/components/github-webhook

# Test a workflow
pdcreator test --path ./workflows/p_ABC123

# Run tests in watch mode
pdcreator test --path ./workflows/p_ABC123/components/send-message --watch
```

The test command:
1. Sets up a controlled testing environment
2. Uses the test fixtures generated by the develop command
3. Executes workflows with simulated input data
4. Validates that the output data matches expected results
5. Provides detailed reports on test success or failure
6. Monitors data flow between components

#### Component Testing

For components, the testing framework:
- Simulates the Pipedream runtime environment
- Mocks external API dependencies
- Provides test data based on generated fixtures
- Validates outputs against expected results
- Tests error handling and edge cases
- Provides detailed logs of component execution

#### Workflow Testing

For workflows, the testing framework:
- Loads all components in the workflow
- Runs the entire workflow with test trigger data
- Tracks data transformations between steps
- Validates that each step receives and produces correct data
- Ensures the final output matches expected results
- Tests error propagation and handling across components

## Core Utilities

### AI Client

The AI client provides a clean interface to Claude:

```javascript
// Example usage
const aiClient = require('../utils/ai-client');

// Generate workflow ideas
const workflowDesign = await aiClient.brainstormWorkflow(
  "Monitor GitHub for new issues and send to Slack"
);

// Generate component code
const componentCode = await aiClient.generateComponent(
  "action", 
  {
    name: "Send Slack Message",
    description: "Sends a formatted message to a Slack channel",
    app: "slack"
  }
);
```

### Mock Pipedream Runtime

The mock runtime simulates Pipedream's environment:

```javascript
// Example of the mock runtime
const mockRuntime = new PipedreamMock();

// Load a component
await mockRuntime.loadComponent('./components/my-component/index.js');

// Run the component with test data
const result = await mockRuntime.runComponent({
  body: { test: "data" },
  headers: { "content-type": "application/json" }
});

// Access emitted events
const emittedEvents = mockRuntime.getEmittedEvents();
```

## Compatibility with pdmanager

To ensure proper integration with the existing pdmanager tool, pdcreator must maintain specific compatibility requirements:

### File Structure Compatibility
- Generated workflows must follow the structure `/workflows/p_XXXXXX/workflow.json` and `/workflows/p_XXXXXX/code.js`
- The p_XXXXXX ID format must be obtained from Pipedream.com through pdmanager commands
- Component files must be organized in a way that's compatible with pdmanager

### Configuration Compatibility
- Must use and respect the same `config.ini` format as pdmanager
- Authentication credentials should be shared between the tools

### Command Integration
- pdcreator must call pdmanager commands to register projects and workflows
- Must use `pdmanager create-project` to establish a new project and get valid project IDs
- Must use `pdmanager create-workflow` to create new workflows and obtain proper workflow IDs
- This ensures all workflows are properly registered with Pipedream.com

## Implementation Requirements

To ensure successful implementation of pdcreator, the following specifications should be followed:

### Authentication & Configuration
- Use the configuration system to store and retrieve all credentials  
- Store credentials in a central configuration file (~/.pdcreator/config.json)
- Securely manage all API keys and authentication information
- Support the following API credentials:
  - Claude API key for AI assistance
  - GitHub API token for repository interactions
  - Pipedream API key for API operations
  - Pipedream username and password for authentication
- Share authentication with pdmanager when appropriate
- Provide fallbacks for missing credentials (environment variables, manual input)
- Support credential inheritance for created workflows
- Provide a configuration command to set up these credentials:
  ```bash
  # Set up credentials interactively
  pdcreator config setup
  
  # Set individual credentials
  pdcreator config set claude.api_key "your-api-key"
  pdcreator config set github.token "your-github-token"
  pdcreator config set pipedream.api_key "your-pd-api-key"
  pdcreator config set pipedream.username "your-username"
  pdcreator config set pipedream.password "your-password"
  ```
- Inherit these credentials to workflows created by the tool
- Securely store sensitive information with proper encryption
- Use these credentials automatically when connecting to services

### Storage Strategy
- User preferences: `~/.pdcreator/config.json`
- Component templates: `~/.pdcreator/templates/`
- Project cache: `./.pdcreator-cache/` in project directories

### UI/UX Focus
- Clean, intuitive command-line interface
- Clear, informative error messages
- Progress indicators for long-running operations
- Colorful, well-formatted output

### Code Quality
- Modular design with clear separation of concerns
- Comprehensive error handling
- Good test coverage
- Clear documentation
- Consistent code style

## Complete Usage Example

Below is a complete example of how a user would use the pdcreator tool for a typical workflow:

### Step 0: Configure the Tool
```bash
$ pdcreator config setup

🔧 Setting up pdcreator configuration...

Claude API Key: ****************************************
GitHub API Token: ************************************
Pipedream API Key: pd_***************************
Pipedream Username: user@example.com
Pipedream Password: ******************

🔐 Credentials stored securely in ~/.pdcreator/config.json
✅ Configuration complete! pdcreator is ready to use
```

### Step 1: Brainstorm a Workflow
```bash
$ pdcreator brainstorm "Monitor GitHub for new issues with 'bug' label and notify team in Slack with priority based on severity label"

🧠 Connecting to Claude AI...
🔍 Generating workflow design...

Proposed Workflow: GitHub Bug Notifications to Slack
=====================================================

TRIGGER:
- GitHub Webhook Trigger (When a new issue is created or updated)

STEP 1: Filter Issues
- Check if issue has "bug" label
- Extract severity label (critical, high, medium, low)
- Skip further processing if not a bug

STEP 2: Format Slack Message
- Create formatted message with issue title, author, description
- Add priority indicator based on severity label
- Include direct link to GitHub issue

STEP 3: Send to Slack
- Send formatted message to appropriate Slack channel
- Add thread for discussion
- Include reaction buttons for team acknowledgment

Do you want to make any changes to this workflow design? (y/n): y

What would you like to change?: Add a step to check if the bug is in a critical component

🔄 Updating workflow design...

[Updated workflow displayed with new step]

Do you want to make any changes to this workflow design? (y/n): n

💾 Saving workflow design to ./workflows/github-bugs-to-slack/design.md
✅ Workflow design saved and ready for development!
```

### Step 2: Develop the Workflow
```bash
$ pdcreator develop -w ./workflows/github-bugs-to-slack

🔌 Connecting to Pipedream...
🔑 Authenticating with pdmanager...
📝 Creating new project via pdmanager...
✅ Project created with ID: proj_ABC123

📝 Registering workflow via pdmanager...
✅ Workflow created with ID: p_XYZ789

🏗️ Generating workflow structure...
📂 Creating directory: ./workflows/p_XYZ789
📄 Writing workflow.json...
📄 Writing code.js...
📄 Creating component files...
📄 Generating test fixtures...

✨ Workflow development complete!
```

### Step 3: Develop a Specific Component
```bash
$ pdcreator develop -w ./workflows/p_XYZ789 -s check-component-criticality --prompt "Check if bug affects core functionality"

🤖 Connecting to Claude AI...
📝 Generating component code...
🔄 Updating component in workflow...
📄 Writing updated code to ./workflows/p_XYZ789/components/check-component-criticality.js
📄 Updating workflow.json with new component reference...
📄 Generating test fixtures for component...

✅ Component successfully developed!
```

### Step 4: Test Components
```bash
$ pdcreator test --path ./workflows/p_XYZ789/components/check-component-criticality

🧪 Setting up test environment...
📊 Loading test fixtures...
🔄 Running component tests...

TEST RESULTS:
✅ Test 1: Process bug in critical component - PASSED
✅ Test 2: Process bug in non-critical component - PASSED
✅ Test 3: Handle invalid input - PASSED
❌ Test 4: Handle missing severity label - FAILED
  Expected: Component should assign default 'medium' priority
  Actual: Component returned null priority

Would you like to fix this issue now? (y/n): y

🔧 Connecting to Claude AI for fix...
🔄 Updating component code...
🔄 Re-running tests...

TEST RESULTS:
✅ Test 1: Process bug in critical component - PASSED
✅ Test 2: Process bug in non-critical component - PASSED
✅ Test 3: Handle invalid input - PASSED
✅ Test 4: Handle missing severity label - PASSED

✅ All component tests passed!
```

### Step 5: Test Full Workflow
```bash
$ pdcreator test --path ./workflows/p_XYZ789

🧪 Setting up workflow test environment...
📊 Loading all components and test fixtures...
🔄 Starting workflow execution...

WORKFLOW EXECUTION:
⏱️ Trigger: Simulating GitHub webhook event...
✅ STEP 1 (Filter Issues): Issue has bug label, severity=high
✅ STEP 2 (Check Component): Component is critical=true
✅ STEP 3 (Format Message): Created message with HIGH PRIORITY flag
✅ STEP 4 (Send to Slack): Message would be sent to #bugs channel

DATA FLOW VALIDATION:
✅ Trigger → Step 1: Data passed correctly
✅ Step 1 → Step 2: Data passed correctly
✅ Step 2 → Step 3: Data passed correctly
✅ Step 3 → Step 4: Data passed correctly

FINAL OUTPUT:
✅ Workflow completed successfully
✅ Expected notification delivered to mock Slack API
✅ All data transformations validated

✨ All tests passed! Workflow is ready for deployment.
```

This complete usage example demonstrates how all three commands (brainstorm, develop, and test) work together to create a functional workflow with proper Pipedream integration.