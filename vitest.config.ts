import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Use node environment for server-side integration tests
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.spec.ts"],
    // Give integration tests more time (they may start express)
    testTimeout: 15000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["server.ts", "boardroom.ts"],
    },
  },
});
