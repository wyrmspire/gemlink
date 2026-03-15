// @vitest-environment jsdom
/**
 * tests/components/sprint9_presentation.test.tsx — Lane 4 Sprint 9
 *
 * Smoke tests for the new Presentation.tsx page component.
 *
 * Verifies:
 *   - Renders without crashing when given a valid collection in localStorage
 *   - Shows "Collection not found" state when no collection matches
 *   - Shows prev/next/play/fullscreen buttons
 *   - Keyboard hint text is visible
 *   - Dot indicators rendered per slide (W1)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { BrandProvider } from "../../src/context/BrandContext.tsx";
import { ProjectProvider } from "../../src/context/ProjectContext.tsx";
import { ToastProvider } from "../../src/context/ToastContext.tsx";
import { stubFetch } from "../helpers/renderWithProviders.tsx";
import Presentation from "../../src/pages/Presentation.tsx";

// ─── motion/react mock ────────────────────────────────────────────────────────

vi.mock("motion/react", async () => {
  const actual = await vi.importActual<typeof import("motion/react")>("motion/react");
  const React = await import("react");

  function makeStub(tag: string) {
    return React.forwardRef(
      (
        { children, ...rest }: React.HTMLAttributes<HTMLElement> & { [key: string]: unknown },
        ref: React.Ref<HTMLElement>
      ) => {
        const {
          initial, animate, exit, transition, whileHover, whileTap, whileFocus,
          variants, layout, layoutId, drag, dragConstraints, onAnimationStart,
          onAnimationComplete, style, ...domProps
        } = rest as Record<string, unknown>;
        void initial; void animate; void exit; void transition;
        void whileHover; void whileTap; void whileFocus; void variants;
        void layout; void layoutId; void drag; void dragConstraints;
        void onAnimationStart; void onAnimationComplete;
        return React.createElement(tag, { ...domProps, ref, style: style as React.CSSProperties }, children as React.ReactNode);
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

// ─── Document fullscreen API stub ─────────────────────────────────────────────

Object.defineProperty(document, "fullscreenElement", {
  writable: true,
  configurable: true,
  value: null,
});

// ─── localStorage helpers ─────────────────────────────────────────────────────

const COLLECTIONS_KEY = "gemlink-collections";

const TEST_COLLECTION_ID = "col-test-abc";

function seedCollection(id: string = TEST_COLLECTION_ID) {
  const collection = {
    id,
    name: "Test Deck",
    projectId: "proj-1",
    items: [
      { jobId: "job-1", type: "image", url: "/img1.jpg", prompt: "Slide one prompt", addedAt: "2026-01-01T00:00:00Z" },
      { jobId: "job-2", type: "image", url: "/img2.jpg", prompt: "Slide two prompt", addedAt: "2026-01-01T00:00:01Z" },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
  localStorage.setItem(COLLECTIONS_KEY, JSON.stringify([collection]));
}

// ─── Render helper with route params ─────────────────────────────────────────

function renderPresentation(collectionId: string) {
  return render(
    <BrandProvider>
      <ProjectProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[`/presentation/${collectionId}`]}>
            <Routes>
              <Route path="/presentation/:collectionId" element={<Presentation />} />
              <Route path="/collections" element={<div data-testid="collections-page">Collections</div>} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ProjectProvider>
    </BrandProvider>
  );
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  stubFetch([]);
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Presentation — not found state", () => {
  it("renders without crashing when collection is missing", async () => {
    const { container } = renderPresentation("nonexistent-id");
    await waitFor(() => expect(container.firstChild).not.toBeNull());
    expect(container).toBeTruthy();
  });

  it("shows 'Collection not found' message", async () => {
    renderPresentation("missing-id");
    await waitFor(() => {
      const matches = screen.queryAllByText(/collection not found/i);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe("Presentation — with slides", () => {
  beforeEach(() => {
    seedCollection(TEST_COLLECTION_ID);
  });

  it("renders without crashing", async () => {
    const { container } = renderPresentation(TEST_COLLECTION_ID);
    await waitFor(() => expect(container.firstChild).not.toBeNull());
    expect(container).toBeTruthy();
  });

  it("shows the collection name in the top bar (W1)", async () => {
    renderPresentation(TEST_COLLECTION_ID);
    await waitFor(() => {
      const matches = screen.queryAllByText(/Test Deck/i);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows slide counter 1 / 2 (W1)", async () => {
    renderPresentation(TEST_COLLECTION_ID);
    await waitFor(() => {
      const counter = screen.queryAllByText(/1\s*\/\s*2/);
      expect(counter.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows prev and next navigation buttons (W1)", async () => {
    renderPresentation(TEST_COLLECTION_ID);
    await waitFor(() => {
      expect(document.getElementById("presentation-prev-btn")).not.toBeNull();
      expect(document.getElementById("presentation-next-btn")).not.toBeNull();
    });
  });

  it("shows the auto-advance Play button (W2)", async () => {
    renderPresentation(TEST_COLLECTION_ID);
    await waitFor(() => {
      const btn = document.getElementById("presentation-play-btn");
      expect(btn).not.toBeNull();
      expect(btn!.textContent).toMatch(/auto-advance/i);
    });
  });

  it("shows the fullscreen toggle button (W4)", async () => {
    renderPresentation(TEST_COLLECTION_ID);
    await waitFor(() => {
      expect(document.getElementById("presentation-fullscreen-btn")).not.toBeNull();
    });
  });

  it("shows keyboard navigation hints (W3)", async () => {
    renderPresentation(TEST_COLLECTION_ID);
    await waitFor(() => {
      const hint = screen.queryAllByText(/navigate/i);
      expect(hint.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows dot indicators for each slide (W1)", async () => {
    renderPresentation(TEST_COLLECTION_ID);
    await waitFor(() => {
      const dotBtns = document.querySelectorAll("[aria-label^='Go to slide']");
      expect(dotBtns.length).toBe(2);
    });
  });

  it("shows the slide prompt text below the slide (W5 content)", async () => {
    renderPresentation(TEST_COLLECTION_ID);
    await waitFor(() => {
      const promptText = screen.queryAllByText(/Slide one prompt/i);
      expect(promptText.length).toBeGreaterThanOrEqual(1);
    });
  });
});
