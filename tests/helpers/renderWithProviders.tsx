/// <reference types="vitest/globals" />
/**
 * Shared render helper for component smoke tests.
 *
 * Wraps the component under test in all required React providers so individual
 * tests don't need to repeat the boilerplate. Also stubs the global `fetch`
 * with a no-op that returns an empty array — preventing real network calls
 * during testing.
 *
 * ## Provider stack (outer → inner)
 *   MockApiKeyGuard  (satisfies useApiKey() consumers)
 *   BrandProvider
 *   ProjectProvider
 *   ToastProvider
 *   MemoryRouter
 */

import { createContext, useContext, ReactNode } from "react";
import { vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BrandProvider } from "../../src/context/BrandContext";
import { ProjectProvider } from "../../src/context/ProjectContext";
import { ToastProvider } from "../../src/context/ToastContext";

// ─── Lightweight ApiKeyGuard stub ─────────────────────────────────────────────
//
// Several pages call `useApiKey()` which requires being inside <ApiKeyGuard>.
// Rather than rendering the real guard (which calls window.aistudio and has
// async initialisation), we provide a minimal in-tree context that satisfies
// the hook contract.

interface ApiKeyContextType {
  resetKey: () => void;
}

const ApiKeyContext = createContext<ApiKeyContextType | undefined>(undefined);

// Re-export so tests can override if needed
export function MockApiKeyProvider({ children }: { children: ReactNode }) {
  return (
    <ApiKeyContext.Provider value={{ resetKey: vi.fn() }}>
      {children}
    </ApiKeyContext.Provider>
  );
}

// Override ApiKeyGuard module so useApiKey() picks up our mock context.
// This must happen before the pages are imported, which is guaranteed by
// vitest's module mock hoisting.
vi.mock("../../src/components/ApiKeyGuard.tsx", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
  useApiKey: () => {
    const ctx = useContext(ApiKeyContext);
    if (!ctx) throw new Error("useApiKey must be used within MockApiKeyProvider");
    return ctx;
  },
}));

// ─── Fetch stub ────────────────────────────────────────────────────────────────

/**
 * Stub a successful JSON fetch that returns `response` for any URL.
 * Call in beforeEach to reset between tests.
 */
export function stubFetch(response: unknown = []) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => response,
    text: async () => JSON.stringify(response),
    headers: new Headers(),
    status: 200,
  } as unknown as Response);
}

// ─── Provider wrapper ──────────────────────────────────────────────────────────

/**
 * Full provider tree. Pass `initialEntries` to test a specific route.
 */
export function AllProviders({
  children,
  initialEntries = ["/"],
}: {
  children: ReactNode;
  initialEntries?: string[];
}) {
  return (
    <MockApiKeyProvider>
      <BrandProvider>
        <ProjectProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={initialEntries}>
              {children}
            </MemoryRouter>
          </ToastProvider>
        </ProjectProvider>
      </BrandProvider>
    </MockApiKeyProvider>
  );
}

/**
 * Convenience wrapper around RTL's `render` that automatically applies
 * `AllProviders`.
 */
export function renderWithProviders(
  ui: ReactNode,
  { initialEntries = ["/"] }: { initialEntries?: string[] } = {}
) {
  return render(
    <AllProviders initialEntries={initialEntries}>{ui}</AllProviders>
  );
}
