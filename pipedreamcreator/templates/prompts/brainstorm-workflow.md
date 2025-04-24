# Pipedream Workflow Brainstorming

Given the following workflow description: "{description}", 
generate a complete Pipedream workflow design including:

## Trigger
Recommend the most appropriate trigger type:
- HTTP webhook
- Schedule
- App-specific (e.g. GitHub, Slack, etc.)

Describe the trigger configuration, including any needed parameters or authentication.

## Steps
Design a sequence of steps to fulfill the workflow requirements:

1. For each step, include:
   - Step name and purpose
   - Component type (source/trigger or action)
   - Required properties and configuration
   - Input data needed from previous steps
   - Output data produced for next steps
   - Error handling considerations

2. Make the components reusable where possible:
   - Use generic component designs that could work in multiple workflows
   - Parameterize values that might change between uses
   - Follow separation of concerns principles

## Data Flow
Specify how data flows between steps:
- Which fields from each step output are used in subsequent steps
- Any transformations needed between steps
- Sample data structures for key outputs

## Error Handling
Include appropriate error handling:
- How to handle API rate limits
- What to do if a step fails
- How to handle malformed data
- Retry strategies where appropriate

## Monitoring and Debugging
Recommend logging or monitoring approaches:
- What should be logged for debugging
- How to monitor workflow execution
- How to detect and alert on failures

Structure your response with clear headings and bullet points. Be specific about component configurations and data structures while keeping steps modular and reusable.