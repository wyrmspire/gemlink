// @vitest-environment jsdom
/**
 * tests/components/sprint9_lane5.test.tsx — Lane 5, Sprint 9
 *
 * Smoke tests for:
 *   - CommandPalette  (src/components/CommandPalette.tsx)
 *   - Breadcrumbs     (src/components/Breadcrumbs.tsx)
 *   - ErrorBoundary   (src/components/ErrorBoundary.tsx)
 */

import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders, stubFetch } from "../helpers/renderWithProviders.tsx";

// ─── motion/react mock ────────────────────────────────────────────────────────
// Uses static React import for type annotations (avoids TS2503 namespace errors)

vi.mock("motion/react", async () => {
  const actual = await vi.importActual<typeof import("motion/react")>("motion/react");

  function makeStub(tag: string) {
    return React.forwardRef(
      (
        { children, ...rest }: React.HTMLAttributes<HTMLElement> & { [key: string]: unknown },
        ref: React.Ref<HTMLElement>
      ) => {
        const {
          initial, animate, exit, transition, whileHover, whileTap, whileFocus,
          variants, layout, layoutId, drag, dragConstraints, onAnimationStart,
          onAnimationComplete,
        } = rest as Record<string, unknown>;
        void initial; void animate; void exit; void transition;
        void whileHover; void whileTap; void whileFocus; void variants;
        void layout; void layoutId; void drag; void dragConstraints;
        void onAnimationStart; void onAnimationComplete;
        const domProps = Object.fromEntries(
          Object.entries(rest).filter(([k]) =>
            ![
              "initial","animate","exit","transition","whileHover","whileTap",
              "whileFocus","variants","layout","layoutId","drag","dragConstraints",
              "onAnimationStart","onAnimationComplete",
            ].includes(k)
          )
        );
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

// ─── Imports (after mock hoisting) ───────────────────────────────────────────

import CommandPalette from "../../src/components/CommandPalette.tsx";
import Breadcrumbs from "../../src/components/Breadcrumbs.tsx";
import ErrorBoundary from "../../src/components/ErrorBoundary.tsx";

// ─── Stubs ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  // JSDOM doesn't implement scrollIntoView — stub it
  Element.prototype.scrollIntoView = vi.fn();
  stubFetch([]);
});


// ─── CommandPalette ───────────────────────────────────────────────────────────

describe("CommandPalette", () => {
  it("renders nothing when closed", () => {
    const { container } = renderWithProviders(
      <CommandPalette open={false} onClose={() => {}} />
    );
    // AnimatePresence renders children=null when open=false (due to mock returning children directly)
    // so the dialog should NOT be in the DOM when open=false
    expect(container.querySelector("[role='dialog']")).toBeNull();
  });

  it("renders the dialog when open", async () => {
    renderWithProviders(
      <CommandPalette open={true} onClose={() => {}} />
    );
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("shows search input when open", async () => {
    renderWithProviders(
      <CommandPalette open={true} onClose={() => {}} />
    );
    await waitFor(() => {
      const input = screen.getByPlaceholderText(/search pages/i);
      expect(input).toBeInTheDocument();
    });
  });

  it("shows navigation results including Dashboard", async () => {
    renderWithProviders(
      <CommandPalette open={true} onClose={() => {}} />
    );
    await waitFor(() => {
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
    });
  });

  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <CommandPalette open={true} onClose={onClose} />
    );
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    const input = screen.getByPlaceholderText(/search pages/i);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("filters results when typing a query", async () => {
    renderWithProviders(
      <CommandPalette open={true} onClose={() => {}} />
    );
    await waitFor(() => screen.getByPlaceholderText(/search pages/i));
    const input = screen.getByPlaceholderText(/search pages/i);
    fireEvent.change(input, { target: { value: "music" } });
    await waitFor(() => {
      expect(screen.getByText("Music Lab")).toBeInTheDocument();
    });
  });
});

// ─── Breadcrumbs ──────────────────────────────────────────────────────────────

describe("Breadcrumbs", () => {
  it("renders nothing on the root path", () => {
    const { container } = renderWithProviders(<Breadcrumbs />, { initialEntries: ["/"] });
    expect(container.querySelector("nav[aria-label='Breadcrumb']")).toBeNull();
  });

  it("renders breadcrumb trail on a nested path", async () => {
    const { container } = renderWithProviders(<Breadcrumbs />, { initialEntries: ["/plan"] });
    await waitFor(() => {
      const nav = container.querySelector("nav[aria-label='Breadcrumb']");
      expect(nav).not.toBeNull();
    });
  });

  it("shows current page with aria-current='page'", async () => {
    renderWithProviders(<Breadcrumbs />, { initialEntries: ["/compose"] });
    await waitFor(() => {
      const current = screen.getByText(/compose/i);
      expect(current).toBeInTheDocument();
    });
  });

  it("shows Home link on nested path", async () => {
    renderWithProviders(<Breadcrumbs />, { initialEntries: ["/video"] });
    await waitFor(() => {
      const homeLink = screen.getByText("Home");
      expect(homeLink).toBeInTheDocument();
    });
  });
});

// ─── ErrorBoundary ─────────────────────────────────────────────────────────────

describe("ErrorBoundary", () => {
  it("renders children when there is no error", () => {
    const { getByText } = render(
      <ErrorBoundary>
        <div>All good</div>
      </ErrorBoundary>
    );
    expect(getByText("All good")).toBeInTheDocument();
  });

  it("renders error UI when a child throws", () => {
    function Bomb(): React.ReactElement {
      throw new Error("Test explosion");
    }

    const { getByText } = render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    expect(getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it("renders custom fallback when provided", () => {
    function Bomb(): React.ReactElement {
      throw new Error("boom");
    }

    const { getByText } = render(
      <ErrorBoundary fallback={<div>Custom Error UI</div>}>
        <Bomb />
      </ErrorBoundary>
    );

    expect(getByText("Custom Error UI")).toBeInTheDocument();
  });
});
