# Template Examples Based on Component Patterns

This document shows how to create templates from the example components for use in the pdcreator tool.

## Webhook Trigger Template

This template is based on the `webhook-events.mjs` pattern:

```javascript
import common from "../common/common-webhook.mjs";
import { getRelevantHeaders } from "../common/utils.mjs";

export default {
  ...common,
  key: "{{app}}-{{event-name}}",
  name: "{{Name}} {{Event Type}}",
  description: "{{Description of what this component does}}",
  type: "source",
  version: "0.1.0",
  dedupe: "unique",
  props: {
    ...common.props,
    events: {
      label: "Events",
      description: "The event types to be emitted",
      type: "string[]",
      options: [
        {{#each event_options}}
        { label: "{{this.label}}", value: "{{this.value}}" },
        {{/each}}
      ],
      reloadProps: true,
    },
  },
  methods: {
    ...common.methods,
    getWebhookEvents() {
      return this.events;
    },
  },
  async run(event) {
    const {
      headers,
      body,
    } = event;

    this.$emit({
      ...getRelevantHeaders(headers),
      ...body,
    }, {
      id: headers["x-request-id"] || new Date().getTime(),
      summary: `New {{event_name}} event received`,
      ts: new Date(),
    });
  },
  async activate() {
    await this.createWebhook();
  },
};
```

## Polling Trigger Template

Based on the `new-repository.mjs` pattern:

```javascript
import common from "../common/common-polling.mjs";

export default {
  ...common,
  key: "{{app}}-{{event-name}}",
  name: "{{Name}} {{Event Type}}",
  description: "{{Description of what this component does}}",
  version: "0.1.0",
  type: "source",
  dedupe: "unique",
  props: {
    ...common.props,
    {{#each custom_props}}
    {{this.name}}: {
      label: "{{this.label}}",
      description: "{{this.description}}",
      type: "{{this.type}}",
      {{#if this.optional}}optional: true,{{/if}}
    },
    {{/each}}
  },
  methods: {
    ...common.methods,
    async getItems() {
      return this.{{app}}.{{getItemsMethod}}({
        {{#each method_params}}
        {{this.name}}: this.{{this.name}},
        {{/each}}
      });
    },
    getItemMetadata(item) {
      return {
        summary: `New {{item_name}}: "${item.{{item_identifier}}}"`,
        ts: Date.now(),
      };
    },
  },
};
```

## Action Component Template

Based on the `create-issue.mjs` pattern:

```javascript
import {{app}} from "../../{{app}}.app.mjs";

export default {
  key: "{{app}}-{{action-name}}",
  name: "{{Action Name}}",
  description: "{{Description of what this action does}}",
  version: "0.1.0",
  type: "action",
  props: {
    {{app}},
    {{#each props}}
    {{this.name}}: {
      label: "{{this.label}}",
      description: "{{this.description}}",
      type: "{{this.type}}",
      {{#if this.propDefinition}}
      propDefinition: [
        {{app}},
        "{{this.propDefinition}}",
        {{#if this.propDefinitionFn}}
        (c) => ({
          {{#each this.propDefinitionParams}}
          {{this.name}}: c.{{this.source}},
          {{/each}}
        }),
        {{/if}}
      ],
      {{/if}}
      {{#if this.optional}}optional: true,{{/if}}
    },
    {{/each}}
  },
  async run({ $ }) {
    const {
      {{app}},
      {{#each runtime_params}}
      {{this}},
      {{/each}}
      ...data
    } = this;

    const response = await {{app}}.{{actionMethod}}({
      {{#each method_params}}
      {{this.name}}: {{this.value}},
      {{/each}}
    });

    $.export("$summary", "{{Success message with ${dynamic} content}}");

    return response;
  },
};
```

## Using These Templates

When implementing the pdcreator tool, these templates can be:

1. Stored as separate template files in the `templates/` directory
2. Used with a templating engine like Handlebars or Mustache
3. Populated with user input or AI-generated content
4. Customized for specific integration types

The essential components to customize for each template are:
- Component metadata (key, name, description)
- Props specific to the component type
- Implementation methods for data retrieval/processing
- Success message formatting

By using these templates with the Claude AI integration, the pdcreator tool can generate high-quality, production-ready Pipedream components with minimal user input.