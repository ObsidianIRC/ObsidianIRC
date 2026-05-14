import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { BouncerNetworksModal } from "../../src/components/ui/BouncerNetworksModal";
import useStore from "../../src/store";

vi.mock("../../src/store", () => {
  const mockStore = vi.fn();
  return {
    default: Object.assign(mockStore, {
      setState: vi.fn(),
      getState: vi.fn(),
    }),
  };
});

const mockStore = vi.mocked(useStore);

const baseState = {
  servers: [{ id: "srv1", name: "TestBNC" }],
  bouncers: {
    srv1: {
      supported: true,
      notifyEnabled: true,
      boundNetid: null,
      listed: true,
      networks: {
        n1: {
          netid: "n1",
          attributes: {
            name: "Libera",
            host: "irc.libera.chat",
            port: "6697",
            state: "connected",
          },
        },
        n2: {
          netid: "n2",
          attributes: {
            name: "OFTC",
            host: "irc.oftc.net",
            port: "6697",
            state: "disconnected",
          },
        },
      },
      lastError: null,
    },
  },
  bouncerAddNetwork: vi.fn(),
  bouncerChangeNetwork: vi.fn(),
  bouncerDelNetwork: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockStore.mockImplementation((selector) => {
    if (typeof selector === "function") {
      // @ts-expect-error partial mock state
      return selector(baseState);
    }
    return baseState;
  });
});

describe("<BouncerNetworksModal/>", () => {
  test("renders header with server name and network count", () => {
    render(<BouncerNetworksModal bouncerServerId="srv1" onClose={vi.fn()} />);
    expect(screen.getByText(/Networks on TestBNC/)).toBeInTheDocument();
    expect(screen.getByText(/2 upstream network/)).toBeInTheDocument();
  });

  test("lists networks with their state labels", () => {
    render(<BouncerNetworksModal bouncerServerId="srv1" onClose={vi.fn()} />);
    expect(screen.getByText("Libera")).toBeInTheDocument();
    expect(screen.getByText("OFTC")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
  });

  test("clicking add button switches to add-mode form", () => {
    render(<BouncerNetworksModal bouncerServerId="srv1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("bouncer-add-network-button"));
    expect(screen.getByTestId("bouncer-form-host")).toBeInTheDocument();
    expect(screen.getByTestId("bouncer-form-save")).toBeInTheDocument();
  });

  test("submitting add calls bouncerAddNetwork", () => {
    render(<BouncerNetworksModal bouncerServerId="srv1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("bouncer-add-network-button"));
    fireEvent.change(screen.getByTestId("bouncer-form-host"), {
      target: { value: "irc.example.org" },
    });
    fireEvent.click(screen.getByTestId("bouncer-form-save"));
    expect(baseState.bouncerAddNetwork).toHaveBeenCalledWith(
      "srv1",
      expect.objectContaining({ host: "irc.example.org" }),
    );
  });

  test("clicking row edit button switches to edit-mode form prefilled", () => {
    render(<BouncerNetworksModal bouncerServerId="srv1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("bouncer-row-edit-n1"));
    expect(screen.getByTestId("bouncer-form-host")).toHaveValue(
      "irc.libera.chat",
    );
  });

  test("close button calls onClose", () => {
    const onClose = vi.fn();
    render(<BouncerNetworksModal bouncerServerId="srv1" onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  test("renders empty state when no networks", () => {
    mockStore.mockImplementation((selector) => {
      const state = {
        ...baseState,
        bouncers: { srv1: { ...baseState.bouncers.srv1, networks: {} } },
      };
      // @ts-expect-error partial mock state
      return typeof selector === "function" ? selector(state) : state;
    });
    render(<BouncerNetworksModal bouncerServerId="srv1" onClose={vi.fn()} />);
    expect(
      screen.getByText(/doesn't have any networks yet/),
    ).toBeInTheDocument();
  });
});
