import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["packages/backend/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: [
        "packages/backend/src/models/**",
        "packages/backend/src/parsers/**",
        "packages/backend/src/services/**",
        "packages/backend/src/stores/**",
        "packages/backend/src/repositories/**",
        "packages/backend/src/api/**",
      ],
      exclude: ["**/*.test.ts", "**/index.ts"],
    },
  },
});
