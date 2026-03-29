#!/usr/bin/env node
import { runCliEntrypoint } from './cli-main.js';

void runCliEntrypoint().then((code) => {
  process.exitCode = code;
});
