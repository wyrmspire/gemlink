// @vitest-environment jsdom
/**
 * E2 — Frontend component smoke tests
 *
 * Verifies that every page component renders without throwing an exception.
 * These tests do NOT assert on specific UI text or interaction behaviour —
 * that belongs in focused unit/integration tests. The goal is to catch:
 *
 *  1. Import errors or missing modules
 *  2. Context consumer errors (missing providers)
 *  3. Unhandled exceptions during initial render
 *  4. TypeScript typing regressions that reach runtime
 *
 * Each page is rendered inside AllProviders (BrandProvider > ProjectProvider >
 * ToastProvider > MemoryRouter). Fetch is stubbed to avoid real network calls.
 *
 * Pages covered:
 *   Dashboard, Setup, SocialMedia, VideoLab, VoiceLab,
 *   Boardroom, Research, SalesAgent, Library
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders, stubFetch } from "../helpers/renderWithProviders.tsx";

// ─── Page imports ────────────────────────────────────────────────────────────
import Dashboard from "../../src/pages/Dashboard.tsx";
import Setup from "../../src/pages/Setup.tsx";
import SocialMedia from "../../src/pages/SocialMedia.tsx";
import VideoLab from "../../src/pages/VideoLab.tsx";
import VoiceLab from "../../src/pages/VoiceLab.tsx";
import Boardroom from "../../src/pages/Boardroom.tsx";
import Research from "../../src/pages/Research.tsx";
import SalesAgent from "../../src/pages/SalesAgent.tsx";
import Library from "../../src/pages/Library.tsx";

// ─── Global stubs ─────────────────────────────────────────────────────────────

// Stub window.aistudio — ApiKeyGuard checks this; assume key exists
Object.defineProperty(window, "aistudio", {
  writable: true,
  value: {
    hasSelectedApiKey: vi.fn().mockResolvedValue(true),
    openSelectKey: vi.fn().mockResolvedValue(undefined),
  },
});

// motion/react animations run synchronously in tests (no requestAnimationFrame)
vi.mock("motion/react", async () => {
  const actual = await vi.importActual<typeof import("motion/react")>("motion/react");
  const React = await import("react");

  /** Passthrough stub for motion.div, motion.section, etc. */
  function makeStub(tag: string) {
    return React.forwardRef(
      (
        { children, ...rest }: React.HTMLAttributes<HTMLElement> & { [key: string]: unknown },
        ref: React.Ref<HTMLElement>
      ) => {
        // Strip motion-specific props to avoid React DOM warnings
        const {
          initial, animate, exit, transition, whileHover, whileTap, whileFocus,
          variants, layout, layoutId, drag, dragConstraints, onAnimationStart,
          onAnimationComplete, ...domProps
        } = rest as Record<string, unknown>;
        void initial; void animate; void exit; void transition;
        void whileHover; void whileTap; void whileFocus; void variants;
        void layout; void layoutId; void drag; void dragConstraints;
        void onAnimationStart; void onAnimationComplete;
        return React.createElement(tag, { ...domProps, ref }, children as React.ReactNode);
      }
    );
  }

  return {
    ...actual,
    motion: new Proxy({} as typeof actual.motion, {
      get(_target, prop: string) {
        return makeStub(prop);
      },
    }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

// Suppress console.error noise from expected fetch failures / act warnings
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  stubFetch([]);
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Assert that a component renders without throwing and mounts at least one
 * DOM element. Uses `waitFor` so async effects (fetch, timers) can settle.
 */
async function smokeTest(ui: React.ReactElement) {
  const { container } = renderWithProviders(ui);
  await waitFor(() => {
    expect(container.firstChild).not.toBeNull();
  });
  return container;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Dashboard", () => {
  it("renders without crashing", async () => {
    const container = await smokeTest(<Dashboard />);
    expect(container).toBeTruthy();
  });

  it("contains navigation links to tools", async () => {
    await smokeTest(<Dashboard />);
    // Dashboard renders at least one anchor/Link element
    const links = document.querySelectorAll("a");
    expect(links.length).toBeGreaterThan(0);
  });
});

describe("Setup", () => {
  it("renders without crashing", async () => {
    const container = await smokeTest(<Setup />);
    expect(container).toBeTruthy();
  });

  it("shows Brand Setup heading", async () => {
    await smokeTest(<Setup />);
    expect(screen.getByText(/Brand Setup/i)).toBeInTheDocument();
  });
});

describe("SocialMedia", () => {
  it("renders without crashing", async () => {
    const container = await smokeTest(<SocialMedia />);
    expect(container).toBeTruthy();
  });
});

describe("VideoLab", () => {
  beforeEach(() => {
    // VideoLab polls job status — return a non-pending job so polling stops
    stubFetch({ status: "completed", outputs: [] });
  });

  it("renders without crashing", async () => {
    const container = await smokeTest(<VideoLab />);
    expect(container).toBeTruthy();
  });
});

describe("VoiceLab", () => {
  it("renders without crashing", async () => {
    const container = await smokeTest(<VoiceLab />);
    expect(container).toBeTruthy();
  });
});

describe("Boardroom", () => {
  beforeEach(() => {
    // Boardroom fetches session list on mount
    stubFetch([]);
  });

  it("renders without crashing", async () => {
    const container = await smokeTest(<Boardroom />);
    expect(container).toBeTruthy();
  });

  it("shows Boardroom heading", async () => {
    await smokeTest(<Boardroom />);
    // "Boardroom" appears in multiple elements (heading + button text).
    // Use getAllByText and assert at least one heading is present.
    const matches = screen.getAllByText(/Boardroom/i);
    expect(matches.length).toBeGreaterThan(0);
  });
});

describe("Research", () => {
  it("renders without crashing", async () => {
    const container = await smokeTest(<Research />);
    expect(container).toBeTruthy();
  });
});

describe("SalesAgent", () => {
  it("renders without crashing", async () => {
    const container = await smokeTest(<SalesAgent />);
    expect(container).toBeTruthy();
  });
});

describe("Library", () => {
  beforeEach(() => {
    // Library fetches media history on mount — return empty array
    stubFetch([]);
  });

  it("renders without crashing", async () => {
    const container = await smokeTest(<Library />);
    expect(container).toBeTruthy();
  });

  it("shows the Media Library heading after data loads", async () => {
    await smokeTest(<Library />);
    await waitFor(() => {
      expect(screen.getByText(/Media Library/i)).toBeInTheDocument();
    });
  });

  it("shows empty state message when history is empty", async () => {
    await smokeTest(<Library />);
    await waitFor(() => {
      expect(screen.getByText(/No media yet/i)).toBeInTheDocument();
    });
  });
});
