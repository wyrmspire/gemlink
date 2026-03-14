/**
 * Global test setup — imported by vitest before every test file via
 * `setupFiles` in vitest.config.ts.
 *
 * Adds @testing-library/jest-dom custom matchers (toBeInTheDocument, etc.)
 * to the global expect. Safe to import in node-environment tests too — it
 * no-ops in non-jsdom environments.
 */
import "@testing-library/jest-dom/vitest";
