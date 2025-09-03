# AGENTS Guidelines for This Repository

## Dev environment tips
- Run `rm -rf package-lock.json` in project root is needed due to a bug in rollup dependency if you are running Linux you need to first remove the package-lock file before you build the project to use teh dependency platform native binaries.
- Then run
`npm install` and `npm run build -ws`to install dependencies and build the workspace
- Now it is possible to run any on the examples in /examples, run commands can be found as scripts in `package.json` project root.
- You find project documentation and intent in README.md, there is one overview in the root of project and then specific README.md for each package. Packages are core, middleware, adapters or tools.

## Testing instructions
- Find the CI plan in the .github/workflows folder.
- Run `rm -rf package-lock.json` in project root is needed due to a bug in rollup dependency if you are running Linux you need to first remove the package-lock file before you build the project to use teh dependency platform native binaries.
- Then run `npm install` and `npm run build -ws`to install dependencies and build the workspace
- From the project root you can just call `npm run test:coverage` to run all tests and see coverage, we have a target of 80% (we use vitest).
- To focus on one step, add the Vitest pattern: `pnpm vitest run -t "<test name>"`.
- Fix any test or type errors until the whole suite is green.
- Add or update tests for the code you change, even if nobody asked.