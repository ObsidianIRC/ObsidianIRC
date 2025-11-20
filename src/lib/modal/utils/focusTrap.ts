/**
 * Focus trap utility for managing focus within modals
 */

export interface FocusTrapOptions {
  initialFocus?: HTMLElement | string | null;
  returnFocus?: boolean;
  escapeDeactivates?: boolean;
  clickOutsideDeactivates?: boolean;
  allowOutsideClick?: boolean | ((event: MouseEvent) => boolean);
  preventScroll?: boolean;
  delayInitialFocus?: boolean;
}

/**
 * Get all focusable elements within a container
 */
export const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
  const focusableSelectors = [
    "a[href]:not([disabled])",
    "button:not([disabled])",
    "textarea:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    '[tabindex]:not([tabindex="-1"]):not([disabled])',
    "[contenteditable]:not([disabled])",
  ].join(", ");

  const elements = container.querySelectorAll<HTMLElement>(focusableSelectors);
  return Array.from(elements).filter((el) => {
    // Filter out elements that are not visible
    const style = window.getComputedStyle(el);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      el.offsetParent !== null
    );
  });
};

/**
 * Create a focus trap within a container
 */
export class FocusTrap {
  private container: HTMLElement;
  private options: FocusTrapOptions;
  private previousActiveElement: HTMLElement | null = null;
  private handleKeyDown: (event: KeyboardEvent) => void;
  private handleClickOutside: (event: MouseEvent) => void;
  private isActive = false;

  constructor(container: HTMLElement, options: FocusTrapOptions = {}) {
    this.container = container;
    this.options = {
      returnFocus: true,
      escapeDeactivates: true,
      clickOutsideDeactivates: false,
      allowOutsideClick: false,
      preventScroll: false,
      delayInitialFocus: false,
      ...options,
    };

    this.handleKeyDown = this.onKeyDown.bind(this);
    this.handleClickOutside = this.onClickOutside.bind(this);
  }

  /**
   * Activate the focus trap
   */
  activate() {
    if (this.isActive) return;

    this.isActive = true;
    this.previousActiveElement = document.activeElement as HTMLElement;

    // Set initial focus
    if (this.options.delayInitialFocus) {
      requestAnimationFrame(() => this.setInitialFocus());
    } else {
      this.setInitialFocus();
    }

    // Add event listeners
    document.addEventListener("keydown", this.handleKeyDown, true);
    if (this.options.clickOutsideDeactivates) {
      document.addEventListener("click", this.handleClickOutside, true);
    }

    // Prevent body scroll if specified
    if (this.options.preventScroll) {
      document.body.style.overflow = "hidden";
    }
  }

  /**
   * Deactivate the focus trap
   */
  deactivate() {
    if (!this.isActive) return;

    this.isActive = false;

    // Remove event listeners
    document.removeEventListener("keydown", this.handleKeyDown, true);
    document.removeEventListener("click", this.handleClickOutside, true);

    // Restore body scroll
    if (this.options.preventScroll) {
      document.body.style.overflow = "";
    }

    // Return focus to previous element
    if (this.options.returnFocus && this.previousActiveElement) {
      requestAnimationFrame(() => {
        this.previousActiveElement?.focus();
      });
    }
  }

  /**
   * Set initial focus when trap is activated
   */
  private setInitialFocus() {
    const { initialFocus } = this.options;

    if (initialFocus) {
      if (typeof initialFocus === "string") {
        const element = this.container.querySelector<HTMLElement>(initialFocus);
        element?.focus();
      } else if (initialFocus instanceof HTMLElement) {
        initialFocus.focus();
      }
    } else {
      // Focus first focusable element
      const focusableElements = getFocusableElements(this.container);
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      } else {
        // If no focusable elements, focus the container itself
        this.container.setAttribute("tabindex", "-1");
        this.container.focus();
      }
    }
  }

  /**
   * Handle keyboard events
   */
  private onKeyDown(event: KeyboardEvent) {
    if (!this.isActive) return;

    if (event.key === "Tab") {
      this.handleTab(event);
    } else if (event.key === "Escape" && this.options.escapeDeactivates) {
      event.preventDefault();
      this.deactivate();
    }
  }

  /**
   * Handle Tab key navigation
   */
  private handleTab(event: KeyboardEvent) {
    const focusableElements = getFocusableElements(this.container);
    if (focusableElements.length === 0) {
      event.preventDefault();
      return;
    }

    const currentFocusIndex = focusableElements.indexOf(
      document.activeElement as HTMLElement,
    );

    if (event.shiftKey) {
      // Shift+Tab - move focus backward
      if (currentFocusIndex <= 0) {
        event.preventDefault();
        focusableElements[focusableElements.length - 1].focus();
      }
    } else {
      // Tab - move focus forward
      if (
        currentFocusIndex === focusableElements.length - 1 ||
        currentFocusIndex === -1
      ) {
        event.preventDefault();
        focusableElements[0].focus();
      }
    }
  }

  /**
   * Handle clicks outside the container
   */
  private onClickOutside(event: MouseEvent) {
    if (!this.isActive) return;

    const target = event.target as HTMLElement;
    if (!this.container.contains(target)) {
      const { allowOutsideClick } = this.options;

      if (allowOutsideClick) {
        if (typeof allowOutsideClick === "function") {
          if (!allowOutsideClick(event)) {
            event.preventDefault();
            event.stopPropagation();
          }
        }
        // If allowOutsideClick is true, do nothing
      } else {
        event.preventDefault();
        event.stopPropagation();
        if (this.options.clickOutsideDeactivates) {
          this.deactivate();
        }
      }
    }
  }

  /**
   * Update the container element
   */
  updateContainer(container: HTMLElement) {
    this.container = container;
    if (this.isActive) {
      this.setInitialFocus();
    }
  }

  /**
   * Check if the trap is active
   */
  get active() {
    return this.isActive;
  }
}

/**
 * React hook for using focus trap
 */
import { useEffect, useRef } from "react";

export const useFocusTrap = (
  containerRef: React.RefObject<HTMLElement>,
  options: FocusTrapOptions & { enabled?: boolean } = {},
) => {
  const trapRef = useRef<FocusTrap | null>(null);
  const { enabled = true, ...trapOptions } = options;

  // Store trapOptions in ref to avoid recreating on every render
  const trapOptionsRef = useRef(trapOptions);
  trapOptionsRef.current = trapOptions;

  useEffect(() => {
    if (!containerRef.current || !enabled) {
      trapRef.current?.deactivate();
      trapRef.current = null;
      return;
    }

    if (!trapRef.current) {
      trapRef.current = new FocusTrap(
        containerRef.current,
        trapOptionsRef.current,
      );
    } else {
      trapRef.current.updateContainer(containerRef.current);
    }

    trapRef.current.activate();

    return () => {
      trapRef.current?.deactivate();
    };
  }, [containerRef, enabled]);

  return trapRef.current;
};

export default FocusTrap;
