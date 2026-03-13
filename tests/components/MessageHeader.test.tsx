import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageHeader } from "../../src/components/message/MessageHeader";

vi.mock("../../src/lib/ircUtils", () => ({
  getColorStyle: vi.fn(() => ({})),
}));

describe("MessageHeader", () => {
  it("renders the full nick when userId contains a hyphen", () => {
    render(
      <MessageHeader
        userId="user-something"
        timestamp={new Date("2024-01-01T12:00:00Z")}
        theme="discord"
      />,
    );

    expect(screen.getByText("user-something")).toBeInTheDocument();
    expect(screen.queryByText("user")).not.toBeInTheDocument();
  });
});
