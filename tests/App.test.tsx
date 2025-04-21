import { render, screen } from "@testing-library/react";
import user from "@testing-library/user-event";
import App from "../src/App";

import { describe, expect, it } from "vitest";

describe("App", () => {
  describe("When loading app", () => {
    it("Add server should be visible", async () => {
      render(<App />);
      user.click(screen.getByTestId("server-list-options-button"));
      expect(await screen.findByText(/Add Server/i)).toBeInTheDocument();
    });
  });
});
