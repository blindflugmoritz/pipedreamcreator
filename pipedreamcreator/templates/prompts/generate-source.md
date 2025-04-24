# Pipedream Source/Trigger Component Generation

Generate a Pipedream source/trigger component that {purpose}.

## Component Metadata
```javascript
export default {
  name: "{name}",
  key: "{key}",
  version: "0.0.1",
  type: "source",
  description: "{description}",
  props: {
    // Props will be defined below
  },
  // Additional methods will be defined below
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
- Necessary Pipedream interfaces (e.g., $.interface.http, $.interface.timer)

## Core Methods
Implement all required methods for your source type:

### HTTP Webhook Source
```javascript
props: {
  http: "$.interface.http"
},
async run(event) {
  // Process webhook event
  // Emit processed data
}
```

### Polling Source
```javascript
props: {
  timer: {
    type: "$.interface.timer",
    default: {
      intervalSeconds: 60 * 15, // Poll every 15 minutes
    },
  },
  db: "$.service.db"
},
async run() {
  // Get last processed timestamp/ID
  // Poll for new data
  // Save new timestamp/ID
  // Emit new events
}
```

### App Webhook Source
```javascript
props: {
  app: "$.app.x",
  db: "$.service.db",
},
hooks: {
  async activate() {
    // Register webhook with app
  },
  async deactivate() {
    // Remove webhook from app
  },
},
async run(event) {
  // Process webhook event
  // Emit processed data
}
```

## Event Emission
Implement proper event emission that:
- Formats data consistently
- Provides meaningful event summaries
- Includes appropriate metadata
- Handles deduplication where needed

## Event Format
- Event format: {eventFormat}
- Emission criteria: {emissionCriteria}

## Error Handling
Implement comprehensive error handling that:
- Catches and reports specific error types
- Provides clear error messages
- Handles rate limits appropriately
- Uses Pipedream's error reporting mechanisms

## Testing Notes
Include commented notes about how to test this component, such as:
- Sample event data
- Expected emission patterns
- Edge cases to verify

Write clean, well-commented code following Pipedream best practices. Include appropriate JSDoc comments for better documentation.