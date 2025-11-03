import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { ModalStackProvider } from "../src/components/modals";

/**
 * Custom render function that wraps components with necessary providers
 */
export function renderWithProviders(ui: ReactElement) {
  return render(<ModalStackProvider>{ui}</ModalStackProvider>);
}

// Re-export everything from @testing-library/react
export * from "@testing-library/react";
