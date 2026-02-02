# Contributing to Sisu

🎉 First off, thank you for considering contributing to **Sisu**!
We believe in building an open, safe, and welcoming community. This guide will help you get started.

---

## 📜 Code of Conduct

By participating in this project, you agree to uphold our [Code of Conduct](./CODE_OF_CONDUCT.md).
Please be kind, respectful, and inclusive.

---

## 🚀 How to Contribute

There are many ways to contribute, and we appreciate them all:

* **Report bugs** → open an [issue](https://github.com/finger-gun/sisu/issues).
* **Suggest features or improvements** → share ideas via issues or discussions.
* **Improve documentation** → fix typos, add examples, or clarify explanations.
* **Contribute code** → help us build tools, adapters, or core features.

---

## 🛠️ Development Setup

1. **Fork & clone** the repo:

   ```bash
   git clone git@github.com:your-username/sisu.git
   cd sisu
   ```
2. **Install dependencies**:

   ```bash
   npm install
   ```
3. **Run tests**:

   ```bash
   npm test
   ```
4. **Start hacking**: The codebase is organized into `packages/` (adapters, tools, core) and `examples/` for demos.

## 📋 Feature Development with Speckit

**New to the project?** We use [Speckit](https://speckit.dev) for structured development. Here's the recommended workflow:

### 1. Spec-First Development

For any new feature, start with a specification:

```bash
# Create a detailed feature spec
/speckit.spec "Your feature description here"
```

This creates a specification in `specs/` with:
- User scenarios prioritized by importance
- Independent testability requirements  
- Acceptance criteria following Given/When/Then format

### 2. Implementation Planning

```bash
# Generate implementation plan
/speckit.plan specs/your-feature/spec.md
```

This creates:
- Technical research and context
- Constitution compliance check
- Project structure planning
- Quality gates verification

### 3. Task Breakdown

```bash
# Break plan into actionable tasks
/speckit.tasks specs/your-feature/plan.md
```

This creates granular, testable tasks following our TDD requirements.

### 4. Constitution Compliance

All code must follow our [constitution](.specify/memory/constitution.md):
- ✅ **≥80% test coverage** (run `pnpm test:coverage`)
- ✅ **Composable middleware** design
- ✅ **Provider-agnostic** interfaces
- ✅ **Full observability** with tracing
- ✅ **Production-ready** error handling

### 5. Quality Gates

**Before coding:**
- [ ] Constitution compliance verified
- [ ] User scenarios defined with independent testability
- [ ] Technical design approved for composability

**Before PR:**
- [ ] All tests passing with ≥80% coverage
- [ ] Integration tests completed
- [ ] Documentation updated
- [ ] Changeset added (if API changes)

---

## 🌳 Branching & Commits

* Create a branch from `main`:

  ```bash
  git checkout -b feature/my-feature
  ```
* If your changes have added a package (tools, adapters, middleware) and have a README.md, make sure to add it to main README.md (we have a helper tool)
  ```bash
  npm run docs:update
  ```
* Use clear commit messages. We use [Changesets](https://github.com/changesets/changesets) for versioning.
* If your change affects the public API, add a changeset:

  ```bash
  npm changeset
  ```

---

## ✅ Pull Requests

* Keep PRs small and focused.
* Link related issues if possible.
* Add or update tests for your code.
* Make sure `npm test` passes before submitting.
* Our maintainers will review, give feedback, and merge when ready.

---

## 📦 Releasing

We use **Changesets** to manage releases.   
Maintainers run `npm release` to publish new versions. Contributors just need to ensure they’ve added a changeset when appropriate.

---

## 🧪 Testing

* We use **Vitest** + **MSW** for tests.
* **≥80% coverage is mandatory** per our [constitution](.specify/memory/constitution.md)
* **TDD is required**: Write tests first, get user approval, then implement
* Run the full suite:

  ```bash
  npm test
  ```
* Run with coverage (must be ≥80%):
  ```bash
  npm run test:coverage
  ```
* Both unit tests (mocked) and integration tests (real APIs) are required for new features


---

## 💡 Tips for First-Time Contributors

* **Start with a spec**: Use `/speckit.spec` to plan your contribution, even for small changes
* Look for [good first issues](https://github.com/finger-gun/sisu/labels/good%20first%20issue)
* Read our [constitution](.specify/memory/constitution.md) to understand our development principles
* Documentation and examples are always welcome improvements
* **Test-first development**: Write failing tests before implementation
* If you're unsure, open a draft PR early and ask for feedback

---

## 🙏 Thank You

Your contributions make Sisu better for everyone.
We’re excited to build this together ❤️
