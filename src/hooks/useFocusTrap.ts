/**
 * useFocusTrap.ts — Lane 5, Sprint 9 W4
 *
 * Custom hook that traps keyboard focus within a container element while
 * it is active. Implements WCAG 2.1 SC 2.1.2 "No Keyboard Trap" pattern
 * correctly: Tab cycles forward, Shift+Tab cycles backward within the modal.
 *
 * Usage:
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   useFocusTrap(containerRef, isOpen);
 *
 * When `active` is true:
 *  - Tab / Shift+Tab wrap within the container's focusable descendants.
 *  - The first focusable element receives focus on activation.
 *  - Focus is restored to the previously-focused element on deactivation.
 */

import { useEffect, RefObject } from "react";

const FOCUSABLE_SELECTORS = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "details > summary",
].join(", ");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)).filter(
    (el) => !el.closest("[hidden]") && el.offsetParent !== null
  );
}

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active || !ref.current) return;

    const container = ref.current;
    // Remember the element that opened the modal so we can restore focus
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Focus the first focusable element
    const focusables = getFocusableElements(container);
    if (focusables.length > 0) {
      focusables[0].focus();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const els = getFocusableElements(container);
      if (els.length === 0) return;

      const first = els[0];
      const last = els[els.length - 1];

      if (e.shiftKey) {
        // Shift+Tab: if focus is on the first element, wrap to last
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: if focus is on the last element, wrap to first
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Restore focus to the trigger element
      try {
        previouslyFocused?.focus();
      } catch {
        // Element may have been removed from DOM — safe to ignore
      }
    };
  }, [active, ref]);
}
