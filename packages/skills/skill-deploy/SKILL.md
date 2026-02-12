---
name: deploy
description: Deploy application with safety checks and rollback guidance
version: 0.1.0
author: sisu
tags: [deploy, release, ops]
requires: [bash, read_file]
---

# Deployment

Use this skill to execute a safe, repeatable deployment.

## Pre-deploy

1. Run tests and typechecks
2. Confirm environment variables
3. Build artifacts
4. Review recent changes

## Deploy Steps

1. Run build pipeline
2. Deploy artifacts
3. Run post-deploy health checks
4. Verify logs and metrics

## Rollback

If deployment fails, use rollback procedure in `resources/rollback.md`.

## Resources

- `resources/deploy-checklist.md`
- `resources/rollback.md`
