import "@testing-library/jest-dom";
import { vi } from "vitest";

window.HTMLElement.prototype.scrollIntoView = vi.fn();
