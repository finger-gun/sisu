import { defineConfig } from "vitest/config";

export default defineConfig({
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
