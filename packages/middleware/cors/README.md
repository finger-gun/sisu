# @sisu-ai/mw-cors

Tiny CORS middleware for Sisu HTTP servers. Intended for dev/local use.

## Usage

```ts
import { cors } from '@sisu-ai/mw-cors';

agent.use(cors());
// Or with options
agent.use(cors({ origin: '*', credentials: true }));
```

- Adds `Access-Control-Allow-*` headers
- Responds to `OPTIONS` with 204
- Defaults: `origin: '*'`, `methods: GET,POST,PUT,PATCH,DELETE,OPTIONS`, `headers: Content-Type,Authorization`, `credentials: false`, `maxAgeSec: 600`.

