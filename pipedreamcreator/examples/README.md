# Pipedream Component Examples

This directory contains real-world examples of Pipedream components to serve as reference for the `pdcreator` tool. These examples are sourced from the [PipedreamHQ/pipedream](https://github.com/PipedreamHQ/pipedream) repository.

## Directory Structure

- `triggers/` - Source components (triggers)
- `actions/` - Action components
- `common/` - Common base components and utilities

## Trigger/Source Components

| File | Description |
|------|-------------|
| `new-issue-comment.mjs` | Example of a webhook-based trigger that emits events for new comments on GitHub issues |
| `new-repository.mjs` | A timer-based/polling trigger that checks for new GitHub repositories |
| `new-or-updated-issue.mjs` | Trigger that handles both new and updated GitHub issues with filtering |
| `webhook-events.mjs` | Generic webhook handler with configurable event types |

## Action Components

| File | Description |
|------|-------------|
| `create-issue.mjs` | Creates a new GitHub issue with ability to set assignees, labels, etc. |
| `create-or-update-file-contents.mjs` | Creates or updates a file in a GitHub repository |
| `get-repository-content.mjs` | Retrieves file or directory content from a GitHub repository |

## Common Base Components

| File | Description |
|------|-------------|
| `common-flex.mjs` | Flexible base component that supports both webhook and polling methods |
| `common-polling.mjs` | Base component for polling-only triggers |
| `common-webhook.mjs` | Base component for webhook-only triggers |

## Usage Notes

These examples demonstrate common patterns in Pipedream components, including:

1. Component structure and metadata
2. Prop definitions and validation
3. Dynamic props with `reloadProps`
4. Authentication handling
5. Webhooks vs. polling implementation
6. Data transformation and emission
7. Error handling patterns

When creating templates for the `pdcreator` tool, use these examples as reference for implementing similar functionality while maintaining compatibility with the Pipedream platform.

## License

These examples are provided for reference only and are subject to the same license as the original Pipedream repository.