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
* Run the full suite:

  ```bash
  npm test
  ```
* Please include tests with new features or bug fixes.
* We aim for 80% coverage:
  ```bash
  npm run test:coverage
  ```


---

## 💡 Tips for First-Time Contributors

* Start with [good first issues](https://github.com/finger-gun/sisu/labels/good%20first%20issue).
* Documentation and examples are always welcome improvements.
* If you’re unsure, open a draft PR early and ask for feedback.

---

## 🙏 Thank You

Your contributions make Sisu better for everyone.
We’re excited to build this together ❤️
