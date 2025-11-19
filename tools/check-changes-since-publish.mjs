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
              version: packageJson.version,
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

function getChangesSinceTag(packageName, version, packagePath) {
  const tag = `${packageName}@${version}`;
  
  // Check if tag exists
  const tagExists = executeCommand(`git tag -l "${tag}"`);
  if (!tagExists) {
    return {
      hasTag: false,
      commits: [],
      files: [],
      message: 'No git tag found for this version'
    };
  }
  
  // Get commits since tag
  const commits = executeCommand(`git log ${tag}..HEAD --oneline --no-merges -- ${packagePath}`);
  const commitList = commits ? commits.split('\n').filter(Boolean) : [];
  
  // Get changed files since tag
  const files = executeCommand(`git diff ${tag}..HEAD --name-only -- ${packagePath}`);
  const fileList = files ? files.split('\n').filter(Boolean) : [];
  
  return {
    hasTag: true,
    commits: commitList,
    files: fileList,
    hasChanges: commitList.length > 0 || fileList.length > 0
  };
}

async function main() {
  console.log('🔍 Checking for changes since last publish...\n');
  
  const packages = findAllPackages();
  console.log(`Found ${packages.length} packages\n`);
  
  const results = [];
  
  for (const pkg of packages) {
    const changes = getChangesSinceTag(pkg.name, pkg.version, pkg.path);
    results.push({
      ...pkg,
      ...changes
    });
  }
  
  // Sort by has changes first
  results.sort((a, b) => {
    if (a.hasChanges && !b.hasChanges) return -1;
    if (!a.hasChanges && b.hasChanges) return 1;
    return a.name.localeCompare(b.name);
  });
  
  console.log('📦 Changes Since Last Publish:\n');
  console.log('─'.repeat(120));
  console.log(
    'Package'.padEnd(45) +
    'Version'.padEnd(12) +
    'Tag Status'.padEnd(20) +
    'Commits'.padEnd(10) +
    'Files Changed'
  );
  console.log('─'.repeat(120));
  
  for (const result of results) {
    const tagStatus = !result.hasTag ? '⚠️  No tag' : 
                      result.hasChanges ? '📝 Has changes' : '✅ Up to date';
    const commitCount = result.commits.length.toString();
    const fileCount = result.files.length.toString();
    
    console.log(
      result.name.padEnd(45) +
      result.version.padEnd(12) +
      tagStatus.padEnd(20) +
      commitCount.padEnd(10) +
      fileCount
    );
  }
  
  console.log('─'.repeat(120));
  
  const packagesWithChanges = results.filter(r => r.hasChanges || !r.hasTag);
  console.log(`\n📊 Summary: ${packagesWithChanges.length}/${results.length} packages have changes since last publish\n`);
  
  if (packagesWithChanges.length > 0) {
    console.log('\n📝 Detailed Changes:\n');
    
    for (const pkg of packagesWithChanges) {
      console.log(`\n${pkg.name}@${pkg.version}`);
      console.log('─'.repeat(80));
      
      if (!pkg.hasTag) {
        console.log('  ⚠️  No git tag found - this version has never been published with a tag');
      } else {
        console.log(`  Commits since last publish (${pkg.commits.length}):`);
        if (pkg.commits.length > 0) {
          pkg.commits.slice(0, 10).forEach(commit => {
            console.log(`    ${commit}`);
          });
          if (pkg.commits.length > 10) {
            console.log(`    ... and ${pkg.commits.length - 10} more commits`);
          }
        }
        
        console.log(`\n  Files changed (${pkg.files.length}):`);
        if (pkg.files.length > 0) {
          pkg.files.slice(0, 15).forEach(file => {
            console.log(`    ${file}`);
          });
          if (pkg.files.length > 15) {
            console.log(`    ... and ${pkg.files.length - 15} more files`);
          }
        }
      }
    }
  }
  
  return { results, packagesWithChanges };
}

main().catch(console.error);