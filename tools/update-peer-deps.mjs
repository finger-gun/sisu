#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const PACKAGES_DIR = 'packages';

function findAllPackageJsons(dir = PACKAGES_DIR) {
  const packages = [];
  
  function traverse(currentPath) {
    const entries = readdirSync(currentPath);
    
    for (const entry of entries) {
      const fullPath = join(currentPath, entry);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        const packageJsonPath = join(fullPath, 'package.json');
        try {
          const content = readFileSync(packageJsonPath, 'utf-8');
          const packageJson = JSON.parse(content);
          if (packageJson.name && packageJson.name.startsWith('@sisu-ai/')) {
            packages.push({
              name: packageJson.name,
              path: packageJsonPath,
              content,
              data: packageJson
            });
          }
        } catch (err) {
          // Skip
        }
        
        traverse(fullPath);
      }
    }
  }
  
  traverse(dir);
  return packages;
}

function updatePeerDependencies() {
  const packages = findAllPackageJsons();
  let updated = 0;
  
  for (const pkg of packages) {
    if (!pkg.data.peerDependencies) continue;
    
    let changed = false;
    const peerDeps = pkg.data.peerDependencies;
    
    // Update @sisu-ai/core peer dependency
    if (peerDeps['@sisu-ai/core'] && !peerDeps['@sisu-ai/core'].startsWith('^')) {
      const oldVersion = peerDeps['@sisu-ai/core'];
      peerDeps['@sisu-ai/core'] = '^' + oldVersion;
      changed = true;
      console.log(`✓ ${pkg.name}: "${oldVersion}" → "^${oldVersion}"`);
    }
    
    // Update @sisu-ai/vector-core peer dependency
    if (peerDeps['@sisu-ai/vector-core'] && !peerDeps['@sisu-ai/vector-core'].startsWith('^')) {
      const oldVersion = peerDeps['@sisu-ai/vector-core'];
      peerDeps['@sisu-ai/vector-core'] = '^' + oldVersion;
      changed = true;
      console.log(`✓ ${pkg.name}: vector-core "${oldVersion}" → "^${oldVersion}"`);
    }
    
    // Update @sisu-ai/server peer dependency
    if (peerDeps['@sisu-ai/server'] && !peerDeps['@sisu-ai/server'].startsWith('^')) {
      const oldVersion = peerDeps['@sisu-ai/server'];
      peerDeps['@sisu-ai/server'] = '^' + oldVersion;
      changed = true;
      console.log(`✓ ${pkg.name}: server "${oldVersion}" → "^${oldVersion}"`);
    }
    
    if (changed) {
      // Write back with preserved formatting
      const updatedContent = JSON.stringify(pkg.data, null, 2) + '\n';
      writeFileSync(pkg.path, updatedContent, 'utf-8');
      updated++;
    }
  }
  
  console.log(`\n✅ Updated ${updated} package.json files to use caret ranges for peer dependencies`);
  return updated;
}

updatePeerDependencies();