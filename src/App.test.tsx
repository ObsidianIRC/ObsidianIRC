import { render, screen } from "@testing-library/react";
import user from "@testing-library/user-event";
import App from "./App";

describe("App", () => {
  describe("when button is clicked", () => {
    it("should increment the counter", async () => {
      render(<App />);
      user.click(screen.getByRole("button"));
      expect(await screen.findByText(/count is 1/i)).toBeInTheDocument();
    });
  });
});
