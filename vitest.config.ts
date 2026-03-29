import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@sisu-ai/core": path.resolve(rootDir, "packages/core/src/index.ts"),
    },
  },
  test: {
    include: ["packages/**/test/**/*.test.ts", "packages/**/*.test.ts"],
    environment: "node",
    globals: false,
    reporters: "default",
    pool: "threads",
    poolOptions: {
      threads: { singleThread: true },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage",
      thresholds: {
        statements: 80,
        lines: 80,
      },
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/examples/**",
        // exclude static viewer assets (not unit-tested JS/HTML/CSS)
        "packages/middleware/trace-viewer/assets/**",
        // exclude build/test config and generated JS
        "**/*.d.ts",
        "**/test/**",
        "**/*.test.*",
        "**/vitest.config.ts",
        "**/vitest.workspace.ts",
        "**/types.ts",
        "packages/core/src/index.ts",
        "vitest.config.ts",
        "tools/**",
        ".eslintrc.cjs",
      ],
    },
  },
  esbuild: {
    target: "node18",
  },
});
