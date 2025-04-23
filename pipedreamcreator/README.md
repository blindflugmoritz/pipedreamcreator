# Pipedream Component Creator (pdcreator)

A tool for creating, testing, and deploying Pipedream components and workflows.

## Installation

```bash
# Clone the repository
git clone https://github.com/blindflugmoritz/pipedreamcreator.git
cd pipedreamcreator

# Install dependencies
npm install

# Link for global use
npm link
```

## Configuration

Create a `.env` file in the root of the project with the following variables:

```
CLAUDE_API_KEY=your_claude_api_key
PIPEDREAM_API_KEY=your_pipedream_api_key
```

## Usage

### Brainstorming Workflows

Generate workflow ideas with Claude AI:

```bash
# Interactive prompt
pdcreator brainstorm

# Direct command
pdcreator brainstorm "Monitor Stripe for new customers and add them to Mailchimp"

# Save output to a specific file
pdcreator brainstorm "Sync Shopify orders to Airtable" --output workflow-ideas.md
```

### Scaffolding Components

Create component scaffolds:

```bash
# Interactive mode
pdcreator scaffold

# Specify component details
pdcreator scaffold --type source --name "New Order" --app "shopify"

# Create from brainstorm results
pdcreator scaffold --from-brainstorm abc123def
```

### Researching Apps

Research Pipedream apps and integrations:

```bash
# Search by query
pdcreator research --query "CRM integration"

# Research specific app
pdcreator research --app "github"

# Research specific action type
pdcreator research --app "slack" --action "send message"
```

### Component Development (Coming Soon)

Local development environment for components:

```bash
pdcreator develop --path ./components/my-component
```

### Testing (Coming Soon)

Test component functionality:

```bash
pdcreator test --path ./components/my-component
```

### Deployment (Coming Soon)

Deploy components to Pipedream:

```bash
pdcreator deploy --path ./components/my-component --env dev
```

## Project Structure

```
pipedreamcreator/
├── commands/            # CLI command implementations
├── templates/           # Component templates
│   ├── action/          # Action component templates
│   ├── source/          # Source component templates
│   ├── common/          # Common base components
│   └── prompts/         # Claude AI prompt templates
├── utils/               # Utility modules
├── testing/             # Testing framework (future)
│   ├── mocks/           # API mocks
│   └── fixtures/        # Test data
└── index.js             # CLI entry point
```

## Coming Soon

- Interactive development environment
- Component testing framework
- Deployment integration
- Workflow visualization
- App research via Pipedream API

## License

MIT