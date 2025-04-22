import { render, screen } from "@testing-library/react";
import user from "@testing-library/user-event";
import App from "../src/App";

import { describe, expect, it } from "vitest";

describe("App", () => {
  describe("When loading app", () => {
    it("Can add servers", async () => {
      render(<App />);
      user.click(screen.getByTestId("server-list-options-button"));
      expect(await screen.findByText(/Add Server/i)).toBeInTheDocument();
      user.click(screen.getByText(/Add Server/i));
      expect(await screen.findByText(/Add IRC Server/i)).toBeInTheDocument();
      user.type(screen.getByPlaceholderText(/Server/i), "Test Server");
      user.type(
        screen.getByPlaceholderText(/irc\.example\.com/i),
        "irc.mattf.one",
      );
      user.type(screen.getByPlaceholderText(/443/i), "443");
      user.click(screen.getByText(/Connect/i));
      // expect(await screen.findByText(/Online/)).toBeInTheDocument();
    });
  });
});
