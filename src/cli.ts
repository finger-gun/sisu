#!/usr/bin/env node
import { sisu } from './index.js';

const name = process.argv[2] ?? 'world';
import { Config } from './index.js';

(async () => {
    (async() => {
  const config: Config = {
    model: "openai/gpt-4o-mini"
  };
  const client = await sisu(config);
  const response = await client.request("What is the capital of France?");
  console.log(response);
})();
})();
