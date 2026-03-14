import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    // Each test file can declare its own environment via
    //   @vitest-environment jsdom   (component tests)
    //   @vitest-environment node    (API / server tests  ← current default)
    // The fallback here is node so the existing API tests are unaffected.
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.spec.ts", "tests/**/*.test.tsx", "tests/**/*.spec.tsx"],
    // Give integration tests more time (they may start express)
    testTimeout: 15000,
    setupFiles: ["tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["server.ts", "boardroom.ts", "src/db.ts"],
    },
  },
});
