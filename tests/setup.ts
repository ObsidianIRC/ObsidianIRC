import "@testing-library/jest-dom";
import { vi } from "vitest";

window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.matchMedia = vi.fn(() => ({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})) as unknown as MediaQueryList;
