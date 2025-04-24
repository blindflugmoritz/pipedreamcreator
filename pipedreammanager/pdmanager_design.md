# Simplified pdmanager Design Document

## Overview
The pdmanager tool has become overly complex with too many commands and options. This redesign focuses on radical simplification, keeping only essential functionality while improving reliability.

## Core Principles
- **Simplicity**: Focus on few, well-implemented commands rather than many specialized ones
- **Reliability**: Each command should work consistently without requiring fallbacks
- **Automation**: Minimize user interaction requirements

## Command Structure

### Essential Commands
1. **new-project**
   - Creates a new Pipedream project
   - Takes credentials as environment variables or command-line options
   - Produces a properly configured project directory

2. **create-workflow**
   - Creates a new workflow in an existing project
   - Configurable trigger type (HTTP, schedule, etc.)
   - Outputs workflow ID and creates local structure

### Optional Commands
1. **list-workflows**
   - Lists all workflows in a project
   
2. **list-triggers**
   - Shows trigger information for a workflow

3. **list-steps**
   - Shows all steps in a workflow

4. **open**
   - Opens a Pipedream project in the browser

5. **deploy**
   - Deploys a local workflow to Pipedream
   - Updates code and configurations via API
   - Validates app connections and requirements

## Commands to Remove
- create-project (redundant with new-project)
- create-project.sh (shell script not needed)
- login-simple, login-direct, login-targeted (consolidate into a single login command)
- analyze-login-page, analyze-projects-page (development/debug commands)
- quick-test, test-login (development/debug commands)

## Implementation Details

### new-project Command
The simplified new-project command should:
- Accept credentials via CLI options or environment variables
- Use a single, reliable approach for browser automation
- Handle login with resilience to Pipedream UI changes
- Create the project files with proper configuration
- Provide clear success/failure output with project ID

### create-workflow Command
- Create workflows via API when possible
- Fall back to browser automation only when necessary
- Support different trigger types (HTTP, schedule, etc.)
- Generate local workflow files with correct structure

### deploy Command
The deploy command will:
- Update workflow metadata via API
- Push code changes to the Pipedream platform
- Validate workflow configuration before deployment
- Detect required app connections and provide guidance
- Support dry-run mode to validate without deploying
- Report deployment status and provide workflow URL

### Puppeteer Implementation
- Keep browser automation simple but robust
- Focus on reliable selectors that won't break with minor UI changes
- Add sufficient delays between actions to ensure stability
- Proper error handling with meaningful error messages

## Configuration
- Store credentials in .env file at project root
- Store project configuration in config.ini
- Create standard directory structure for workflows

## Usage Examples
```
# Create a new project using env vars
export PIPEDREAM_USERNAME=user@example.com
export PIPEDREAM_PASSWORD=password
pdmanager new-project

# Create a new project with CLI options
pdmanager new-project --username user@example.com --password password --name "My Project"

# Create a workflow in a project
pdmanager create-workflow --project proj_abc123 --name "My Workflow" --trigger http

# Deploy workflow changes to Pipedream
pdmanager deploy --workflow p_abc123 --apiKey YOUR_API_KEY
```

## Development Roadmap
1. ✅ Refactor new-project command for reliability
2. ✅ Consolidate login functionality
3. ✅ Simplify create-workflow command
4. ✅ Add better error handling and logging
5. ✅ Remove deprecated commands

## Implementation Status (April 24, 2025)

### Completed Simplifications
- Command structure streamlined to core essentials
- Removed redundant commands
- Consolidated login commands into a single implementation
- Improved error handling and feedback
- Added implementation for list-workflows command

### Test Results
- **Project Creation (new-project)**: Works reliably (9/10)
- **Workflow Creation (create-workflow)**: Works well (8/10)
- **API Commands (list-*)**: Issues with API endpoints (4/10)
- **Browser Interface (open)**: Works well (7/10)

### Current Issues
- API endpoints for listing workflows and triggers returning 404 errors
- Some API endpoints need to be updated to match Pipedream's current API structure

### Next Steps
1. Fix API endpoints for list-workflows and list-triggers commands
2. Implement deploy command for workflow updates via API
3. Further improve error handling and recovery mechanisms
4. Update documentation to reflect the simplified command set

### Conclusion
The pdmanager tool is now significantly simpler and more maintainable. Core functionality (project and workflow creation) works well, making it ready for use with pdcreator for these functions. API listing functionality needs further work before it can be fully reliable.