#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';

const files = [
  'examples/openai-reasoning/CHANGELOG.md',
  'docs/stories/story-001-reasoning-model-support.md',
  'docs/design-topics/README.md',
  'docs/design-topics/dt-20251119-0800-reasoning-production-readiness.md',
  'docs/stories/README.md',
  'docs/stories/story-002-reasoning-production-validation.md'
];

let totalChanges = 0;

for (const file of files) {
  try {
    const content = readFileSync(file, 'utf-8');
    const updated = content.replace(/\b2024\b/g, '2025');
    
    if (content !== updated) {
      writeFileSync(file, updated, 'utf-8');
      const changes = (content.match(/\b2024\b/g) || []).length;
      console.log(`✓ ${file}: ${changes} occurrence(s) updated`);
      totalChanges += changes;
    }
  } catch (err) {
    console.error(`✗ ${file}: ${err.message}`);
  }
}

console.log(`\n✅ Total: ${totalChanges} occurrences of "2024" changed to "2025"`);