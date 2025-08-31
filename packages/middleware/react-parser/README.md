# @sisu-ai/mw-react-parser

Lightweight ReAct-style tool loop. Lets the model decide an action in natural language, you parse it, execute, and then the model reflects and answers.

## Setup
```bash
npm i @sisu-ai/mw-react-parser
```

## Documentation
Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu

## Behavior (ReAct pattern)
- Think: Ask the model for an initial response with tools disabled (`toolChoice: 'none'`).
- Act: Parse `Action: <tool>` and `Action Input: <json or text>` from its message.
- Observe: Execute the named tool with parsed input, append a `role:'tool'` message.
- Reflect: Ask the model again to produce the final answer that incorporates the observation.

## Usage
```ts
import { reactToolLoop } from '@sisu-ai/mw-react-parser';

const app = new Agent()
  .use(reactToolLoop());
```

Prompting tip
- Seed system with the expected format, e.g.:
  - `Use tools when helpful. Reply with\nAction: <tool>\nAction Input: <JSON>`

Customizing
- Provide your own tools via `@sisu-ai/mw-register-tools` and define strict zod schemas for reliable parsing.
- If you need a different action syntax, build a small middleware before/after to transform the assistant message.
