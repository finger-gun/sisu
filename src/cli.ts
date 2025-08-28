#!/usr/bin/env node
import { sisu } from './index.js';

const name = process.argv[2] ?? 'world';
import { Config } from './index.js';

// Take argument called --chat
const chatArgument = process.argv.find(arg => arg.startsWith('--chat='));
const chat = chatArgument ? chatArgument.split('=')[1] : undefined;
// Take argument called model
const modelArgument = process.argv.find(arg => arg.startsWith('--model='));
const model = modelArgument ? modelArgument.split('=')[1] : undefined;

(async () => {
  const config: Config = {
    model: model ?? "openai/gpt-4o-mini"
  };
  const client = sisu(config);
  const response = await client.request(chat ?? "");
  console.log(response);
})();
