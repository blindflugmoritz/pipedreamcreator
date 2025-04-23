# Pipedream Component Creator Tool Architecture

The pdcreator tool should be implemented in the folder `/Users/mz/coding/pipedreamcreator/` which is on the same level as the existing `/Users/mz/coding/pipedreammanager/` directory. This ensures consistent organization and makes integration between the tools more intuitive.

```
/Users/mz/coding/
+-- pipedreammanager/   # Existing tool
+-- pipedreamcreator/   # New tool to be implemented
    +-- commands/
    |   +-- brainstorm.js      # Generate workflow ideas with Claude
    |   +-- research.js        # Research Pipedream apps and suggest integrations
    |   +-- scaffold.js        # Generate component templates
    |   +-- develop.js         # Local development environment
    |   +-- test.js            # Test component functionality
    |   +-- build.js           # Build/package components
    |   +-- deploy.js          # Upload to Pipedream using pdmanager
    +-- templates/
    |   +-- action/            # Action component templates
    |   +-- source/            # Trigger component templates
    |   +-- custom/            # Custom templates
    |   +-- workflows/         # Full workflow templates
    +-- testing/
    |   +-- mocks/             # Mock Pipedream environment
    |   +-- fixtures/          # Test data
    |   +-- runner.js          # Test runner
    +-- utils/
        +-- ai-client.js       # Interface with Claude AI
        +-- pdmanager-client.js # Interface with pdmanager
        +-- validation.js      # Component schema validation
```

This architecture integrates with the existing pdmanager to handle authentication and deployment, with a focus on streamlining the component development lifecycle:

1. **Brainstorming** - Generate workflow ideas and structures using Claude AI
2. **Scaffolding** - Generate boilerplate for new components
3. **Development** - Local editing with proper validation
4. **Testing** - Verify functionality before deployment
5. **Building** - Package components for deployment
6. **Deployment** - Upload to Pipedream using the pdmanager integration

## Usage Examples

```
# Install the tool
npm install -g pdcreator

# Brainstorm a workflow 
pdcreator brainstorm "Monitor Stripe for new customers, send welcome email via SendGrid"

# Research Pipedream apps for an idea
pdcreator research "CRM integration for customer data sync"

# Research specific app capabilities
pdcreator research --app "hubspot" --action "contact"

# Scaffold components from brainstormed output
pdcreator scaffold --from-brainstorm workflow_12345

# Create individual components
pdcreator component new --type source --name custom-stripe-source

# Interactive development with live preview
pdcreator develop ./components/custom-stripe-source --preview

# Test with scenarios and mocked API responses
pdcreator test ./components/custom-stripe-source --coverage

# Integration testing across full workflow
pdcreator test-workflow ./workflows/customer-onboarding

# Deploy to dev environment
pdcreator deploy ./components/custom-stripe-source --env dev

# Promote to production
pdcreator promote --from dev --to prod component_id

# Deploy with pdmanager
pdmanager create-workflow --path ./workflows/brainstormed-workflow
```

The brainstorm command leverages Claude to generate structured workflows with component recommendations that match the pdmanager format, ensuring seamless integration between the tools.

## Compatibility with pdmanager

To ensure proper integration with the existing pdmanager tool, pdcreator must maintain specific compatibility requirements:

### File Structure Compatibility
- Generated workflows must follow the structure `/workflows/p_XXXXXX/workflow.json` and `/workflows/p_XXXXXX/code.js`
- Project IDs (p_XXXXXX) must follow the same format used by pdmanager
- Directory structure must be maintained for pdmanager to recognize and process workflows

### Configuration Compatibility
- Must use and respect the same `config.ini` format as pdmanager
- Authentication credentials should be shared between the tools
- Environment variables and secrets management must be compatible

### Workflow JSON Format
- Generated workflow.json must contain all required fields:
  - id, name, active, components array with proper structure
  - Each component needs valid configuration matching Pipedream's requirements
  - Proper connection references and account references

### Code.js Format
- Must generate code.js files that follow the expected structure:
  - Proper exports format
  - Compatible with Pipedream's runtime environment
  - Follows the same import/require patterns as existing code.js files

### Command Line Interface
- Similar argument structure where appropriate
- Consistent output formatting
- Ability to chain commands between tools (pdcreator output → pdmanager input)

This compatibility ensures users can seamlessly move between brainstorming and development in pdcreator to deployment and management in pdmanager without manual reformatting or restructuring of files.

## REST API Compatibility

All workflow data structures generated by pdcreator must strictly adhere to the Pipedream REST API specifications as documented at https://pipedream.com/docs/rest-api/:

### Workflow Structure
Generated workflow.json files must follow the exact structure defined in the REST API:

```json
{
  "id": "p_abc123",
  "name": "My Workflow",
  "active": true,
  "created_at": "2023-01-01T00:00:00Z",
  "updated_at": "2023-01-01T00:00:00Z",
  "description": "Workflow description",
  "settings": {
    "execution_timeout": 300,
    "concurrency_type": "ORDERED",
    "concurrency": 1
  },
  "components": [
    {
      "id": "c_123abc",
      "key": "trigger",
      "app": "app_id",
      "type": "source",
      "metadata": {
        "name": "Component name",
        "description": "Component description"
      },
      "config": {}
    }
  ]
}
```

### API Endpoints Used
The following API endpoints will be utilized:

- `GET /v1/apps` - For the research function to fetch available apps
- `GET /v1/apps/{app_id}` - To get detailed information about specific apps
- `GET /v1/components` - To discover available components
- `GET /v1/components/{component_id}` - To get component details
- `GET /v1/workflows` - To list existing workflows
- `POST /v1/workflows` - To create new workflows
- `GET /v1/workflows/{workflow_id}` - To fetch specific workflow details

## App Research Functionality

The `pdcreator research` command enhances the development process by:

1. **App Discovery**:
   - Searches Pipedream's app directory via `/v1/apps` API endpoint
   - Filters apps based on keywords, categories, or functionality
   - Returns ranked suggestions based on relevance to the search query

2. **App Integration Analysis**:
   - Analyzes available triggers and actions for recommended apps
   - Suggests optimal integration points for the user's described workflow
   - Evaluates authentication requirements and configuration complexity

3. **AI-Enhanced Recommendations**:
   - Utilizes Claude AI to analyze search results and provide higher-level insights
   - Generates sample configurations for recommended apps
   - Suggests common use cases and best practices for specific integrations

4. **Interactive Exploration**:
   - Allows interactive browsing of app capabilities
   - Provides example code snippets for utilizing specific app actions
   - Offers documentation references for deeper understanding

This functionality enables developers to quickly discover the most appropriate apps for their workflow requirements and understand how to effectively integrate them into their solutions.

## Testing Methodology

The testing approach for pdcreator follows a test-driven development methodology with comprehensive validation at two distinct levels:

1. **Component-Level Testing** - Testing individual steps/components in isolation
2. **Workflow-Level Testing** - Testing complete workflows with integrated components

### Test-First Development

1. **Test Data Generation**:
   - For each component or workflow, first generate representative test input data
   - Create both typical and edge case scenarios
   - Store test data in structured JSON files in `/testing/fixtures/{component_name}/`

2. **Expected Output Generation**:
   - Define expected output data for each test case
   - Document expected console logs, warnings, and error messages
   - Store expected outputs alongside test data in `/testing/fixtures/{component_name}/expected/`

3. **Mock Environment Setup**:
   - Create mocks for external APIs and services
   - Simulate Pipedream runtime environment
   - Configure controlled test conditions to ensure repeatability

### Component-Level Testing

Component tests focus on individual Pipedream components, testing each step in isolation to ensure they perform their specific functions correctly.

```javascript
// Example component test structure
describe('Stripe Customer Created Trigger', () => {
  const fixtures = loadFixtures('stripe-customer-created');
  
  beforeEach(() => {
    setupMocks(fixtures.mocks);
  });

  it('should detect new customers and emit proper event', async () => {
    // Arrange
    const component = loadComponent('stripe-customer-created');
    const inputData = fixtures.inputs.validCustomer;
    const expectedOutput = fixtures.expected.validCustomer;
    const logCapture = new LogCapture();
    
    // Act
    const result = await runComponentWithFixtures(component, inputData);
    
    // Assert
    expect(result.outputData).toEqual(expectedOutput);
    expect(logCapture.logs).toContain(fixtures.expected.consoleOutput);
  });
  
  // Testing specific component methods
  describe('parseCustomerData()', () => {
    it('should extract relevant fields from customer object', () => {
      const parser = component.methods.parseCustomerData;
      const result = parser(fixtures.inputs.complexCustomer);
      expect(result).toEqual(fixtures.expected.parsedCustomerData);
    });
  });
});

### Workflow-Level Testing

Workflow tests validate the entire flow from trigger to final action, ensuring components work together properly.

```javascript
// Example workflow test structure
describe('Customer Onboarding Workflow', () => {
  const fixtures = loadFixtures('workflows/customer-onboarding');
  
  beforeEach(() => {
    setupWorkflowMocks(fixtures.mocks);
  });

  it('should process a new customer through the entire workflow', async () => {
    // Arrange
    const workflow = loadWorkflow('customer-onboarding');
    const triggerEvent = fixtures.inputs.newCustomerEvent;
    const expectedFinalState = fixtures.expected.workflowCompletion;
    const logCapture = new LogCapture();
    
    // Act
    const result = await executeWorkflow(workflow, triggerEvent);
    
    // Assert
    expect(result.finalState).toEqual(expectedFinalState);
    expect(result.stepResults).toEqual(fixtures.expected.stepOutputs);
    expect(logCapture.logs).toMatchSnapshot(fixtures.expected.workflowLogs);
  });
});
```

### Testing Command Usage

The pdcreator CLI provides specific commands for testing at different levels:

```bash
# Test a specific component
pdcreator test-component ./components/stripe-webhook

# Test a specific method within a component
pdcreator test-component ./components/stripe-webhook --method processWebhook

# Test a complete workflow
pdcreator test-workflow ./workflows/customer-onboarding

# Run all tests with coverage reporting
pdcreator test --coverage

# Watch mode for development
pdcreator test --watch
```

### Validation Types

1. **Component-Level Validation**:
   - **Unit Testing** - Testing individual methods and functions
   - **Interface Testing** - Validating component inputs and outputs
   - **Error Handling** - Testing component behavior with invalid inputs
   - **Method-Level Testing** - Targeted tests for specific component methods

2. **Workflow-Level Validation**:
   - **End-to-End Testing** - Testing the complete flow from trigger to final action
   - **Integration Points** - Validating data passing between components
   - **Error Propagation** - Testing error handling across multiple steps
   - **State Management** - Validating workflow state throughout execution

3. **Console Output Validation**:
   - **Log Pattern Matching** - Verifying log patterns for debugging
   - **Error Message Quality** - Ensuring clear and actionable error messages
   - **Audit Trail Validation** - Verifying proper activity logging

4. **Performance Testing**:
   - **Execution Time** - Measuring against established baselines
   - **Resource Usage** - Validating memory and CPU usage
   - **API Efficiency** - Monitoring external API call patterns and frequencies
   - **Rate Limit Testing** - Ensuring components handle API rate limits gracefully

### Test Fixtures Structure

Test fixtures are organized to support both component and workflow testing:

```
/testing/
  /fixtures/
    /components/
      /stripe-webhook/
        inputs/
          valid-customer-created.json
          invalid-payload.json
        expected/
          valid-customer-output.json
          error-response.json
          expected-logs.json
        mocks/
          stripe-api-responses.json
      /sendgrid-email/
        ...
    /workflows/
      /customer-onboarding/
        inputs/
          trigger-event.json
        expected/
          final-state.json
          step-outputs.json
          workflow-logs.json
        mocks/
          all-services.json
```

### Continuous Testing

Testing is integrated throughout the development lifecycle:

1. **Development Phase**:
   - Use `pdcreator test --watch` for continuous testing during development
   - Immediate feedback loop when code changes affect test outcomes

2. **Pre-Deployment Validation**:
   - Run full test suite before deployment with `pdcreator test --full`
   - Verify against all test fixtures and scenarios

3. **Regression Prevention**:
   - Maintain growing test library to prevent regressions
   - Automatically run previous tests when components are modified

4. **CI/CD Integration**:
   - Automated testing on commit/push
   - Test matrix for different configurations and environments
   - Performance tracking across builds

This comprehensive testing approach ensures high reliability of both individual components and complete workflows created with pdcreator, providing confidence that they will function correctly when deployed to production environments.

## Pipedream Data Flow Reference

Understanding how data flows between steps is critical for proper component development and testing:

### Step Data Return

Each Pipedream step can return data in various ways:

```javascript
// Common patterns for returning data from steps
export default defineComponent({
  async run({steps, $}) {
    // Method 1: Return data directly (available as steps.<step-id>.returnValue)
    return {
      user: {
        id: 123,
        name: "Test User"
      }
    };
    
    // Method 2: Use $.export (available as steps.<step-id>)
    $.export("userId", 123);
    $.export("userName", "Test User");
    
    // Method 3: Emit events (for sources/triggers)
    this.$emit({
      id: 123,
      name: "Test User"
    });
  }
});
```

### Accessing Data Between Steps

Data is accessed differently depending on the source:

```javascript
export default defineComponent({
  async run({steps, $}) {
    // Access data from previous steps
    
    // 1. Accessing returnValue from step with ID "fetch_user"
    const user = steps.fetch_user.returnValue;
    console.log(`User ID: ${user.id}`);
    
    // 2. Accessing exported variables from step with ID "fetch_user"
    const userId = steps.fetch_user.userId;
    const userName = steps.fetch_user.userName;
    
    // 3. Accessing trigger data
    const webhookData = steps.trigger.event;
    
    // 4. Accessing authentication data (common pattern)
    const apiKey = auths.service_name.api_key;
    
    // Process data and return for next steps
    return {
      processedData: {
        combinedName: `${userName} (ID: ${userId})`,
        receivedFrom: webhookData.source
      }
    };
  }
});
```

This reference ensures consistent handling of data flow in components developed with pdcreator, both for implementation and testing purposes.

## Simplified User Experience

The pdcreator tool is designed with simplicity in mind, offering an intuitive workflow for users:

### Core Commands

```bash
# Generate workflow ideas with AI assistance
pdcreator brainstorm "Monitor Shopify for new orders and add customers to Mailchimp"

# Create new workflow with initial implementation
pdcreator create shopify-to-mailchimp
```

When running the `create` command, pdcreator:
1. Launches an interactive wizard to gather basic requirements
2. Automatically calls Claude Sonnet 3.7 API to generate initial implementation
3. Creates all necessary workflow files (workflow.json, code.js)
4. Generates starter test fixtures based on expected data patterns
5. Produces a complete, working implementation ready for testing

```bash
# Run all tests with automatic bug reporting
pdcreator -t
```

### Automated Testing & Bug Reports

The testing feature (`pdcreator -t`) provides streamlined validation:

- Automatically runs all component and workflow tests
- Generates detailed bug reports for any failures
- Creates formatted issue reports for each bug found
- Includes reproduction steps and expected vs. actual results
- Saves bug reports to `/reports/bugs/` directory
- Provides a concise summary of all detected issues

### AI Implementation & Refinement

The pdcreator tool leverages Claude Sonnet 3.7 AI in two key ways:

1. **Automated Initial Implementation:**
   - The `pdcreator create` command directly uses Claude Sonnet 3.7 API
   - Generates complete, working code based on requirements
   - Implements both workflow.json configuration and code.js functionality
   - Applies best practices and patterns automatically

2. **Interactive Refinement:**
   Users can further leverage Claude directly within workflow directories:

```bash
# Navigate to a workflow directory
cd /workflows/shopify-to-mailchimp/

# Use Claude to develop or modify components
claude
```

Claude will read the `WORKFLOW.md` file in each workflow directory, which follows this structured format:

```markdown
# Workflow: Shopify to Mailchimp Customer Sync

## Purpose
Automatically add new Shopify customers to a Mailchimp audience when they place their first order.

## Components
1. **Trigger: Shopify New Order**
   - Trigger on new order events
   - Filter for first-time customers only

2. **Action: Extract Customer Data**
   - Extract email, first name, last name
   - Format data for Mailchimp

3. **Action: Mailchimp Add Subscriber**
   - Add customer to specific audience
   - Set appropriate tags
   - Handle duplicates gracefully

## Data Flow
1. Shopify Order → Extract email and name from order.customer object
2. Transform → Format as {email, merge_fields: {FNAME, LNAME}}
3. Mailchimp → Send formatted data to add_subscriber endpoint

## Expected Behavior
- New customers should appear in Mailchimp within 5 minutes
- Duplicate emails should update existing records, not error
- Orders with missing emails should log error but not fail workflow

## Error Handling
- If Mailchimp API is unavailable, retry 3 times with exponential backoff
- Log all API failures with detailed error messages
- For malformed data, skip processing but log issue

## Testing Requirements
- Test with various order formats from Shopify
- Verify handling of international characters in names
- Confirm proper tagging in Mailchimp
```

This structured format ensures Claude has all the necessary information to develop or modify components effectively.

This approach combines the power of AI-assisted development with a straightforward, intuitive command structure that minimizes complexity while maintaining full functionality.

## Implementation Requirements

To ensure successful implementation of pdcreator, the following specifications should be followed:

### Authentication & Configuration

1. **API Authentication**
   - Share authentication with pdmanager
   - Read API credentials from .env file in workflow folders
   - Claude API key: Use Sonnet 3.7 with appropriate authentication

2. **Storage Strategy**
   - User preferences: `~/.pdcreator/config.json`
   - Component templates: `~/.pdcreator/templates/`
   - Project cache: `./.pdcreator-cache/` in project directories
   - All configuration stored as files on the filesystem (no database)

### Integration with Existing Systems

1. **Workflow Structure**
   - Analyzed existing workflow examples in codebase:
     - `/workflows/p_PACdxn9/`
     - `/sdf/workflows/p_MOCpBVn/`
     - `/sdf/workflows/p_V9CAOQZ/`
     - `/sdf/workflows/p_YyCObQy/`
   - Follow the same structure for generated workflows
   - Maintain compatibility with pdmanager expectations

2. **Tool Separation**
   - pdcreator: Focus on workflow creation and testing
   - pdmanager: Handles Pipedream initialization, updating, and configuration
   - No direct calls between tools; file-based integration

### Testing Strategy

1. **Component Testing**
   - Implement custom testing framework that simulates Pipedream environment
   - Create a local testing environment for components
   - Generate test fixtures automatically based on component structure

2. **Development Target**
   - Initial focus on internal use
   - Prioritize functionality over extensive documentation initially
   - Ensure robust error handling for primary functions

### Pipedream Component Structure Analysis

Based on the analysis of existing Pipedream workflows and components, we've established the following patterns:

#### Workflow.json Structure

```json
{
  "id": "p_WORKFLOW_ID",
  "name": "Workflow Name", 
  "created_at": "2025-04-21T08:30:26.411Z",
  "project_id": "proj_PROJECT_ID",
  "description": "Optional description",
  "trigger": {
    "type": "http",
    "path": "randomPathString"
  },
  "webhook_url": "https://pipedream.com/webhooks/p_ID/path"
}
```

For scheduled triggers:
```json
{
  "trigger": {
    "type": "schedule",
    "schedule": "0 0 * * *"
  }
}
```

#### Component Structure (code.js)

1. **Trigger (Source) Components:**

```javascript
export default {
  type: "source",
  key: "http-webhook",
  name: "HTTP Webhook",
  description: "Receives HTTP requests and emits them as events",
  version: "0.0.1",
  props: {
    http: "$.interface.http",
  },
  async run(event) {
    // Process incoming webhook data
    this.http.respond({
      status: 200,
      body: { success: true },
    });
    
    // Emit event to workflow
    this.$emit(event, {
      summary: "New webhook request received",
    });
  },
}
```

2. **Action Components:**

```javascript
export default {
  name: "Action Name",
  key: "action_key",
  version: "0.0.1",
  type: "action",
  description: "Performs a specific action",
  props: {
    // Input parameters
    inputData: {
      type: "string",
      label: "Input Data",
      description: "Data to process",
    },
  },
  async run({ steps, $ }) {
    // Access data from previous steps
    const previousData = steps.trigger.event;
    
    // Perform action logic
    const result = await someOperation(this.inputData);
    
    // Return data for next steps
    return result;
  },
}
```

3. **Data Flow Between Components:**

- Components access previous step data via the `steps` object
- Data is passed through in a structured JSON format
- Different methods for returning data:
  - Direct return values: `return { data: value }`
  - Export named values: `$.export("name", value)`
  - Event emission (triggers): `this.$emit(eventData, metadata)`

### Implementation Priorities

For the initial MVP, focus on these core capabilities:

1. Brainstorming workflow structure with AI
2. Creating workflow scaffolding with proper directory structure
3. Generating working component implementations
4. Basic testing capabilities
5. Research functionality for app discovery

Later phases can add more advanced features like comprehensive testing, bug reporting, and workflow visualization.

### Claude Prompt Templates

To effectively generate components, we'll need to develop specialized prompt templates:

1. **Brainstorming Template:**
```
Given the following workflow description: "{description}", 
generate a complete Pipedream workflow design including:

1. Appropriate trigger type (HTTP, schedule, or app-specific)
2. Required action steps with proper sequence
3. Data transformation requirements between steps
4. Error handling considerations
5. Expected inputs and outputs

For each component, specify:
- Component type (source/trigger or action)
- Required properties and configuration
- Data flow between components
- Edge cases to handle
```

2. **Component Generation Template:**
```
Generate a Pipedream {componentType} component that {componentPurpose}.

Required fields:
- name: "{componentName}"
- key: "{componentKey}"
- version: "0.0.1"
- type: "{source|action}"

The component should:
{componentRequirements}

Data handling:
- Input data structure: {inputStructure}
- Output data structure: {outputStructure}
- Error handling: {errorHandling}

Follow Pipedream best practices for component development.
```

These templates will be refined as we develop the tool and learn from real-world usage.