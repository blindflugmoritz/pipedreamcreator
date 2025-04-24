# Pipedream Action Component Generation

Generate a Pipedream action component that {purpose}.

## Component Metadata
```javascript
export default {
  name: "{name}",
  key: "{key}",
  version: "0.0.1",
  type: "action",
  description: "{description}",
  props: {
    // Props will be defined below
  },
  async run({ steps, $ }) {
    // Implementation will be defined below
  }
}
```

## Component Requirements
The component should:
{requirements}

## Props Definition
Define the input parameters (props) the component needs, including:
- Required parameters
- Optional parameters with defaults
- Proper types and validation
- Clear labels and descriptions

## Implementation
Write the full implementation code for the run method that:
- Properly accesses input parameters
- Makes any necessary API calls
- Handles the required data transformations
- Returns the expected output
- Includes appropriate error handling
- Uses proper Pipedream patterns

## Input/Output Structure
- Input data structure: {inputStructure}
- Output data structure: {outputStructure}

## Error Handling
Implement comprehensive error handling that:
- Catches and reports specific error types
- Provides clear error messages
- Handles edge cases appropriately
- Uses Pipedream's error reporting mechanisms

## Testing Notes
Include commented notes about how to test this component, such as:
- Sample input values
- Expected output patterns
- Edge cases to verify

Write clean, well-commented code following Pipedream best practices. Include appropriate JSDoc comments for better documentation.