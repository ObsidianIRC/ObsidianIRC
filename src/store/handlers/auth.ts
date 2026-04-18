import { t } from "@lingui/core/macro";
import { v4 as uuidv4 } from "uuid";
import type { StoreApi } from "zustand";
import ircClient from "../../lib/ircClient";
import type { Message } from "../../types";
import { normalizeHost } from "../helpers";
import type { AppState } from "../index";
import * as storage from "../localStorage";

export function registerAuthHandlers(store: StoreApi<AppState>): void {
  ircClient.on("CAP_ACKNOWLEDGED", ({ serverId, key, capabilities }) => {
    if (capabilities?.startsWith("draft/metadata")) {
      const currentSubs =
        store.getState().metadataSubscriptions[serverId] || [];
      if (currentSubs.length === 0) {
        const defaultKeys = [
          "url",
          "website",
          "status",
          "location",
          "avatar",
          "color",
          "display-name",
          "bot",
        ];
        store.getState().metadataSub(serverId, defaultKeys);
      }

      // Note: Metadata restoration/sending is now handled in the "ready" event
      // to ensure the server is ready to receive METADATA commands
    }
    if (key === "sasl") {
      const servers = storage.servers.load();
      for (const serv of servers) {
        if (serv.id !== serverId) continue;

        if (!serv.saslEnabled) return;
      }
      ircClient.sendRaw(serverId, "AUTHENTICATE PLAIN");
    }
  });

  ircClient.on("AUTHENTICATE", ({ serverId, param }) => {
    if (param !== "+") return;

    // Don't respond to AUTHENTICATE if CAP negotiation is already complete
    if (ircClient.isCapNegotiationComplete(serverId)) return;

    let user: string | undefined;
    let pass: string | undefined;
    const servers = storage.servers.load();
    for (const serv of servers) {
      if (serv.id !== serverId) continue;

      if (!serv.saslEnabled) return;

      user = serv.saslAccountName?.length
        ? serv.saslAccountName
        : serv.nickname;
      pass = serv.saslPassword ? atob(serv.saslPassword) : undefined;
    }
    if (!user || !pass)
      // wtf happened lol
      return;

    ircClient.sendRaw(
      serverId,
      `AUTHENTICATE ${btoa(`${user}\x00${user}\x00${pass}`)}`,
    );
    // Note: CAP END will be sent by the IRC client when SASL authentication completes (903/904-907 responses)
    // ircClient.sendRaw(serverId, "CAP END");
    // ircClient.userOnConnect(serverId);
  });

  // Handle CAP LS to get informational capabilities like unrealircd.org/link-security
  ircClient.on("CAP LS", ({ serverId, cliCaps }) => {
    // Parse link-security from CAP LS (informational capability)
    if (cliCaps.includes("unrealircd.org/link-security=")) {
      const match = cliCaps.match(/unrealircd\.org\/link-security=(\d+)/);
      if (match) {
        const linkSecurityValue = Number.parseInt(match[1], 10) || 0;

        // Update server with link security value
        store.setState((state) => {
          const updatedServers = state.servers.map((server) => {
            if (server.id === serverId) {
              return {
                ...server,
                linkSecurity: linkSecurityValue,
              };
            }
            return server;
          });

          return { servers: updatedServers };
        });

        // Show warning modal for low UnrealIRCd link-security value
        const currentState = store.getState();
        const currentServer = currentState.servers.find(
          (s) => s.id === serverId,
        );
        const hasLowLinkSecurity = linkSecurityValue < 2;

        // Check if we should show warning based on individual skip preferences
        const savedServers = storage.servers.load();
        const serverConfig = currentServer
          ? savedServers.find(
              (s) =>
                normalizeHost(s.host) === normalizeHost(currentServer.host) &&
                s.port === currentServer.port,
            )
          : undefined;

        const shouldWarnLinkSecurity =
          hasLowLinkSecurity && !serverConfig?.skipLinkSecurityWarning;

        if (shouldWarnLinkSecurity) {
          store.setState((state) => {
            // Check if warning already exists for this server
            const existingWarning = state.ui.linkSecurityWarnings.find(
              (w) => w.serverId === serverId,
            );
            if (existingWarning) {
              return state; // Don't add duplicate warning
            }

            return {
              ui: {
                ...state.ui,
                linkSecurityWarnings: [
                  ...state.ui.linkSecurityWarnings,
                  { serverId, timestamp: Date.now() },
                ],
              },
            };
          });
        }
      }
    }
  });

  ircClient.on("CAP ACK", ({ serverId, cliCaps }) => {
    const caps = cliCaps.split(" ");

    for (const cap of caps) {
      const tok = cap.split("=");
      const capName = tok[0];
      const capValue = tok[1];

      ircClient.capAck(serverId, capName, capValue ?? null);
    }

    // Update server capabilities in store (merge, don't overwrite)
    store.setState((state) => {
      const updatedServers = state.servers.map((server) => {
        if (server.id === serverId) {
          const existing = server.capabilities ?? [];
          const newCaps = cliCaps.split(" ");
          const merged = [...existing];
          for (const cap of newCaps) {
            if (!merged.includes(cap)) {
              merged.push(cap);
            }
          }
          return {
            ...server,
            capabilities: merged,
          };
        }
        return server;
      });
      return { servers: updatedServers };
    });

    // Check if we should prevent CAP END (for SASL, account registration, or link security warning)
    const state = store.getState();
    const server = state.servers.find((s) => s.id === serverId);
    let preventCapEnd = false;

    // Check if SASL was requested and acknowledged, AND we have credentials
    if (caps.some((cap) => cap.startsWith("sasl"))) {
      // Only prevent CAP END if we actually have SASL credentials
      const servers = storage.servers.load();
      const savedServer = servers.find((s) => s.id === serverId);
      if (savedServer?.saslEnabled && savedServer?.saslPassword) {
        preventCapEnd = true;
      }
    }

    // Check if there's pending account registration
    const pendingReg = state.pendingRegistration;
    if (pendingReg && pendingReg.serverId === serverId) {
      preventCapEnd = true;
      // Check if server supports account registration
      if (server?.capabilities?.includes("draft/account-registration")) {
        store
          .getState()
          .registerAccount(
            serverId,
            pendingReg.account,
            pendingReg.email,
            pendingReg.password,
          );
        // Clear the pending registration
        store.setState({ pendingRegistration: null });
      } else {
        // Clear the pending registration
        store.setState({ pendingRegistration: null });
        // Send CAP END since registration is not possible
        preventCapEnd = false;
      }
    }

    // Check if link security warning modal is showing - prevent CAP END until user responds
    if (state.ui.linkSecurityWarnings.some((w) => w.serverId === serverId)) {
      preventCapEnd = true;
    }

    if (!preventCapEnd) {
      ircClient.sendRaw(serverId, "CAP END");
      ircClient.userOnConnect(serverId);
    } else {
    }
  });

  // Account registration event handlers
  ircClient.on("REGISTER_SUCCESS", ({ serverId, account, message }) => {
    const state = store.getState();
    const server = state.servers.find((s) => s.id === serverId);
    if (server) {
      const channel = server.channels[0];
      if (channel) {
        const notificationMessage: Message = {
          id: uuidv4(),
          type: "system",
          content: t`Account registration successful for ${account}: ${message}`,
          timestamp: new Date(),
          userId: "system",
          channelId: channel.id,
          serverId: serverId,
          reactions: [],
          replyMessage: null,
          mentioned: [],
        };

        const key = `${serverId}-${channel.id}`;
        store.setState((state) => ({
          messages: {
            ...state.messages,
            [key]: [...(state.messages[key] || []), notificationMessage],
          },
        }));
      }
    }
  });

  ircClient.on(
    "REGISTER_VERIFICATION_REQUIRED",
    ({ serverId, account, message }) => {
      const state = store.getState();
      const server = state.servers.find((s) => s.id === serverId);
      if (server) {
        const channel = server.channels[0];
        if (channel) {
          const notificationMessage: Message = {
            id: uuidv4(),
            type: "system",
            content: t`Account registration for ${account} requires verification: ${message}`,
            timestamp: new Date(),
            userId: "system",
            channelId: channel.id,
            serverId: serverId,
            reactions: [],
            replyMessage: null,
            mentioned: [],
          };

          const key = `${serverId}-${channel.id}`;
          store.setState((state) => ({
            messages: {
              ...state.messages,
              [key]: [...(state.messages[key] || []), notificationMessage],
            },
          }));
        }
      }
    },
  );

  ircClient.on("VERIFY_SUCCESS", ({ serverId, account, message }) => {
    const state = store.getState();
    const server = state.servers.find((s) => s.id === serverId);
    if (server) {
      const channel = server.channels[0];
      if (channel) {
        const notificationMessage: Message = {
          id: uuidv4(),
          type: "system",
          content: t`Account verification successful for ${account}: ${message}`,
          timestamp: new Date(),
          userId: "system",
          channelId: channel.id,
          serverId: serverId,
          reactions: [],
          replyMessage: null,
          mentioned: [],
        };

        const key = `${serverId}-${channel.id}`;
        store.setState((state) => ({
          messages: {
            ...state.messages,
            [key]: [...(state.messages[key] || []), notificationMessage],
          },
        }));
      }
    }
  });

  ircClient.on(
    "EXTJWT",
    ({ serverId, requestedTarget, serviceName, jwtToken }) => {
      console.log("🔑 EXTJWT received:", {
        serverId,
        requestedTarget,
        serviceName,
        jwtToken: jwtToken ? "present" : "missing",
      });
      store.setState((state) => {
        const updatedServers = state.servers.map((server) => {
          if (server.id === serverId) {
            return { ...server, jwtToken };
          }
          return server;
        });
        return { servers: updatedServers };
      });
    },
  );
}
