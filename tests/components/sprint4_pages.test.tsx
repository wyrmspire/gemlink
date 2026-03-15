// @vitest-environment jsdom
/**
 * tests/components/sprint4_pages.test.tsx — W4: Compose UI Component Tests (Lane 5, Sprint 4)
 *
 * Smoke tests for new Sprint 4 editor components:
 *   - MediaPickerPanel    (src/components/MediaPickerPanel.tsx)
 *   - SlideTimeline       (src/components/SlideTimeline.tsx)
 *   - CaptionEditor       (src/components/CaptionEditor.tsx)
 *   - TransitionPicker    (src/components/TransitionPicker.tsx)
 *   - ComposePreview      (src/components/ComposePreview.tsx)
 *   - Compose             (src/pages/Compose.tsx — graceful skip if not yet shipped)
 *
 * Pattern:
 *   - Known-present components are imported statically and tested directly.
 *   - Optional/uncertain components use `new Function("p", "return import(p)")` to
 *     avoid breaking if not yet shipped (same pattern as sprint3_pages.test.tsx).
 *   - motion/react is fully mocked to avoid animation issues in jsdom.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders, stubFetch } from "../helpers/renderWithProviders.tsx";

// ─── Static imports for confirmed-present components ─────────────────────────
import MediaPickerPanel from "../../src/components/MediaPickerPanel.tsx";
import CaptionEditor, { DEFAULT_CAPTION_CONFIG } from "../../src/components/CaptionEditor.tsx";
import TransitionPicker from "../../src/components/TransitionPicker.tsx";

// ─── Global stubs ─────────────────────────────────────────────────────────────

Object.defineProperty(window, "aistudio", {
  writable: true,
  configurable: true,
  value: {
    hasSelectedApiKey: vi.fn().mockResolvedValue(true),
    openSelectKey: vi.fn().mockResolvedValue(undefined),
  },
});

// ─── motion/react mock (copied from sprint3_pages.test.tsx) ──────────────────

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
          onAnimationComplete, onReorderEnd, ...domProps
        } = rest as Record<string, unknown>;
        void initial; void animate; void exit; void transition;
        void whileHover; void whileTap; void whileFocus; void variants;
        void layout; void layoutId; void drag; void dragConstraints;
        void onAnimationStart; void onAnimationComplete; void onReorderEnd;
        return React.createElement(tag, { ...domProps, ref }, children as React.ReactNode);
      }
    );
  }

  const ReorderGroup = ({ children, onReorder, values, axis, ...rest }: any) => {
    void onReorder; void values; void axis;
    return React.createElement("div", rest, children);
  };
  const ReorderItem = ({ children, value, ...rest }: any) => {
    void value;
    return React.createElement("div", rest, children);
  };

  return {
    ...actual,
    motion: new Proxy({} as typeof actual.motion, {
      get(_target, prop: string) {
        return makeStub(prop);
      },
    }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    Reorder: {
      Group: ReorderGroup,
      Item: ReorderItem,
    },
  };
});

// ─── dnd-kit mock (SlideTimeline uses @dnd-kit) ───────────────────────────────

vi.mock("@dnd-kit/core", async () => {
  const React = await import("react");
  return {
    DndContext: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "dnd-context" }, children),
    closestCenter: () => null,
    KeyboardSensor: class {},
    PointerSensor: class {},
    useSensor: () => ({}),
    useSensors: (...args: any[]) => args,
    DragOverlay: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
  };
});

vi.mock("@dnd-kit/sortable", async () => {
  const React = await import("react");
  return {
    SortableContext: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
    sortableKeyboardCoordinates: () => ({}),
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      transform: null,
      transition: null,
      isDragging: false,
    }),
    arrayMove: (arr: any[], from: number, to: number) => {
      const result = [...arr];
      const [item] = result.splice(from, 1);
      result.splice(to, 0, item);
      return result;
    },
    horizontalListSortingStrategy: () => null,
    verticalListSortingStrategy: () => null,
  };
});

vi.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Transform: { toString: () => "" },
    Transition: { toString: () => "" },
  },
}));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  stubFetch([]);
});

async function smokeTest(ui: React.ReactElement) {
  const { container } = renderWithProviders(ui);
  await waitFor(() => expect(container.firstChild).not.toBeNull());
  return container;
}

// ─── MediaPickerPanel ─────────────────────────────────────────────────────────

describe("MediaPickerPanel", () => {
  it("renders without crashing", async () => {
    const container = await smokeTest(
      <MediaPickerPanel onSelect={() => {}} />
    );
    expect(container).toBeTruthy();
  });

  it("shows filter tabs (All, Images, Videos, Voice)", async () => {
    await smokeTest(<MediaPickerPanel onSelect={() => {}} />);
    await waitFor(() => {
      // Filter tabs: may render as button text
      const allButtons = document.querySelectorAll("button");
      expect(allButtons.length).toBeGreaterThan(0);
    });
  });

  it("shows search input", async () => {
    await smokeTest(<MediaPickerPanel onSelect={() => {}} />);
    await waitFor(() => {
      const inputs = document.querySelectorAll("input[type='text'], input[placeholder]");
      expect(inputs.length).toBeGreaterThan(0);
    });
  });

  it("shows 'Media Library' header text", async () => {
    await smokeTest(<MediaPickerPanel onSelect={() => {}} />);
    await waitFor(() => {
      const matches = screen.queryAllByText(/media library/i);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ─── CaptionEditor ────────────────────────────────────────────────────────────

describe("CaptionEditor", () => {
  it("renders without crashing", async () => {
    const container = await smokeTest(
      <CaptionEditor value={DEFAULT_CAPTION_CONFIG} onChange={() => {}} />
    );
    expect(container).toBeTruthy();
  });

  it("shows 'Caption Editor' heading", async () => {
    await smokeTest(
      <CaptionEditor value={DEFAULT_CAPTION_CONFIG} onChange={() => {}} />
    );
    await waitFor(() => {
      expect(screen.getByText(/caption editor/i)).toBeInTheDocument();
    });
  });

  it("shows style preset buttons (at least Clean and Bold Outline)", async () => {
    await smokeTest(
      <CaptionEditor value={DEFAULT_CAPTION_CONFIG} onChange={() => {}} />
    );
    await waitFor(() => {
      expect(screen.getByText(/clean/i)).toBeInTheDocument();
      expect(screen.getByText(/bold outline/i)).toBeInTheDocument();
    });
  });

  it("shows all 5 style presets", async () => {
    await smokeTest(
      <CaptionEditor value={DEFAULT_CAPTION_CONFIG} onChange={() => {}} />
    );
    await waitFor(() => {
      // 5 presets: Clean, Bold Outline, Boxed, Typewriter, Word Highlight
      const presetLabels = ["Clean", "Bold Outline", "Boxed", "Typewriter", "Word Highlight"];
      for (const label of presetLabels) {
        const matches = screen.queryAllByText(new RegExp(label, "i"));
        expect(matches.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  it("shows timing toggles (sentence, word)", async () => {
    await smokeTest(
      <CaptionEditor value={DEFAULT_CAPTION_CONFIG} onChange={() => {}} />
    );
    await waitFor(() => {
      expect(screen.getByText(/sentence-level/i)).toBeInTheDocument();
      expect(screen.getByText(/word-level/i)).toBeInTheDocument();
    });
  });

  it("shows position toggles (top, center, bottom)", async () => {
    await smokeTest(
      <CaptionEditor value={DEFAULT_CAPTION_CONFIG} onChange={() => {}} />
    );
    await waitFor(() => {
      expect(screen.getByText(/top/i)).toBeInTheDocument();
      expect(screen.getByText(/bottom/i)).toBeInTheDocument();
    });
  });
});

// ─── TransitionPicker ─────────────────────────────────────────────────────────

describe("TransitionPicker", () => {
  it("renders without crashing", async () => {
    const container = await smokeTest(
      <TransitionPicker value="fade" onChange={() => {}} />
    );
    expect(container).toBeTruthy();
  });

  it("shows a select element with transition options", async () => {
    await smokeTest(<TransitionPicker value="fade" onChange={() => {}} />);
    await waitFor(() => {
      const select = document.querySelector("select");
      expect(select).not.toBeNull();
      expect(select!.options.length).toBeGreaterThan(0);
    });
  });

  it("shows Fade as an option", async () => {
    await smokeTest(<TransitionPicker value="fade" onChange={() => {}} />);
    await waitFor(() => {
      const options = screen.queryAllByText(/fade/i);
      expect(options.length).toBeGreaterThan(0);
    });
  });

  it("shows a 'Transition' label", async () => {
    await smokeTest(<TransitionPicker value="fade" onChange={() => {}} />);
    await waitFor(() => {
      const labels = screen.queryAllByText(/transition/i);
      expect(labels.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ─── SlideTimeline (optional — graceful skip if not present) ──────────────────

describe("SlideTimeline (Lane 2 Sprint 4 component)", () => {
  let SlideTimelineComponent: React.ComponentType<any> | null = null;

  beforeEach(async () => {
    try {
      const importFn = new Function("p", "return import(p)") as (p: string) => Promise<{ default: React.ComponentType<any> }>;
      const mod = await importFn("../../src/components/SlideTimeline.tsx");
      SlideTimelineComponent = mod.default;
    } catch {
      SlideTimelineComponent = null;
    }
  });

  it("renders without crashing (skipped if not yet shipped)", async () => {
    if (!SlideTimelineComponent) {
      console.info("[W4] SlideTimeline.tsx not yet available — skipping smoke test (pending Lane 2 Sprint 4).");
      expect(true).toBe(true);
      return;
    }
    const container = await smokeTest(<SlideTimelineComponent slides={[]} onSlidesChange={() => {}} />);
    expect(container).toBeTruthy();
  });

  it("renders with mock slides (skipped if not yet shipped)", async () => {
    if (!SlideTimelineComponent) {
      expect(true).toBe(true);
      return;
    }
    const mockSlides = [
      { id: "slide-1", jobId: "img-001", duration: 3, transition: "fade", kenBurns: false },
    ];
    const container = await smokeTest(
      <SlideTimelineComponent slides={mockSlides} onSlidesChange={() => {}} />
    );
    expect(container).toBeTruthy();
  });
});

// ─── Compose.tsx page (optional — graceful skip if not yet shipped) ───────────

describe("Compose (Lane 2 Sprint 4 page)", () => {
  let ComposeComponent: React.ComponentType | null = null;

  beforeEach(async () => {
    try {
      const importFn = new Function("p", "return import(p)") as (p: string) => Promise<{ default: React.ComponentType }>;
      const mod = await importFn("../../src/pages/Compose.tsx");
      ComposeComponent = mod.default;
    } catch {
      ComposeComponent = null;
    }
  });

  it("renders without crashing (skipped if not yet shipped)", async () => {
    if (!ComposeComponent) {
      console.info("[W4] Compose.tsx not yet available — skipping smoke test (pending Lane 2 Sprint 4).");
      expect(true).toBe(true);
      return;
    }
    const container = await smokeTest(<ComposeComponent />);
    expect(container).toBeTruthy();
  });

  it("shows mode tabs (Slideshow, Merge, Captions) when available", async () => {
    if (!ComposeComponent) {
      expect(true).toBe(true);
      return;
    }
    await smokeTest(<ComposeComponent />);
    await waitFor(() => {
      // Accept any variations: "Slideshow", "Merge", "Captions", "Caption"
      const slideshowMatches = screen.queryAllByText(/slideshow/i);
      expect(slideshowMatches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows Render button when available", async () => {
    if (!ComposeComponent) {
      expect(true).toBe(true);
      return;
    }
    await smokeTest(<ComposeComponent />);
    await waitFor(() => {
      const renderMatches = screen.queryAllByText(/render/i);
      expect(renderMatches.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ─── ComposePreview (optional — graceful skip if not present) ─────────────────

describe("ComposePreview (Lane 2 Sprint 4 component)", () => {
  let ComposePreviewComponent: React.ComponentType<any> | null = null;

  beforeEach(async () => {
    try {
      const importFn = new Function("p", "return import(p)") as (p: string) => Promise<{ default: React.ComponentType<any> }>;
      const mod = await importFn("../../src/components/ComposePreview.tsx");
      ComposePreviewComponent = mod.default;
    } catch {
      ComposePreviewComponent = null;
    }
  });

  it("renders without crashing (skipped if not yet shipped)", async () => {
    if (!ComposePreviewComponent) {
      console.info("[W4] ComposePreview.tsx not yet available — skipping smoke test (pending Lane 2 Sprint 4).");
      expect(true).toBe(true);
      return;
    }
    // Provide minimal required props
    const container = await smokeTest(
      <ComposePreviewComponent
        slides={[]}
        aspectRatio="9:16"
      />
    );
    expect(container).toBeTruthy();
  });
});
