#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const PACKAGES_DIR = 'packages';

function executeCommand(command, options = {}) {
  try {
    return execSync(command, { encoding: 'utf-8', ...options }).trim();
  } catch (error) {
    return null;
  }
}

function findAllPackages(dir = PACKAGES_DIR) {
  const packages = [];
  
  function traverse(currentPath) {
    const entries = readdirSync(currentPath);
    
    for (const entry of entries) {
      const fullPath = join(currentPath, entry);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        const packageJsonPath = join(fullPath, 'package.json');
        try {
          const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
          if (packageJson.name && packageJson.name.startsWith('@sisu-ai/')) {
            packages.push({
              name: packageJson.name,
              localVersion: packageJson.version,
              path: fullPath,
              packageJsonPath
            });
          }
        } catch (err) {
          // No package.json or not a valid JSON, continue
        }
        
        // Recurse into subdirectories
        traverse(fullPath);
      }
    }
  }
  
  traverse(dir);
  return packages;
}

async function getNpmVersion(packageName) {
  const result = executeCommand(`npm view ${packageName} version 2>/dev/null`);
  return result || 'Not published';
}

async function getLastCommitForPackage(packagePath) {
  const result = executeCommand(`git log -1 --format=%H -- ${packagePath}`);
  return result || 'No commits';
}

async function main() {
  console.log('🔍 Checking package versions...\n');
  
  const packages = findAllPackages();
  console.log(`Found ${packages.length} packages\n`);
  
  const results = [];
  
  for (const pkg of packages) {
    const npmVersion = await getNpmVersion(pkg.name);
    const lastCommit = await getLastCommitForPackage(pkg.path);
    
    const needsPublish = npmVersion === 'Not published' || npmVersion !== pkg.localVersion;
    
    results.push({
      ...pkg,
      npmVersion,
      lastCommit: lastCommit.substring(0, 8),
      needsPublish
    });
  }
  
  // Sort by needs publish first
  results.sort((a, b) => {
    if (a.needsPublish && !b.needsPublish) return -1;
    if (!a.needsPublish && b.needsPublish) return 1;
    return a.name.localeCompare(b.name);
  });
  
  console.log('📦 Package Status:\n');
  console.log('─'.repeat(100));
  console.log(
    'Package'.padEnd(45) +
    'Local'.padEnd(12) +
    'NPM'.padEnd(12) +
    'Status'.padEnd(15) +
    'Last Commit'
  );
  console.log('─'.repeat(100));
  
  for (const result of results) {
    const status = result.needsPublish ? '⚠️  NEEDS PUBLISH' : '✅ Published';
    console.log(
      result.name.padEnd(45) +
      result.localVersion.padEnd(12) +
      result.npmVersion.padEnd(12) +
      status.padEnd(15) +
      result.lastCommit
    );
  }
  
  console.log('─'.repeat(100));
  
  const needsPublish = results.filter(r => r.needsPublish);
  console.log(`\n📊 Summary: ${needsPublish.length}/${results.length} packages need publishing\n`);
  
  if (needsPublish.length > 0) {
    console.log('Packages that need publishing:');
    for (const pkg of needsPublish) {
      console.log(`  - ${pkg.name} (${pkg.localVersion}) - NPM: ${pkg.npmVersion}`);
    }
  }
  
  return { results, needsPublish };
}

main().catch(console.error);