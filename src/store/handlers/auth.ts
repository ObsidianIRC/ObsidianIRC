import { v4 as uuidv4 } from "uuid";
import type { StoreApi } from "zustand";
import ircClient from "../../lib/ircClient";
import {
  buildIrcv3BearerPayload,
  chunkSaslPayload,
} from "../../lib/saslFrames";
import type { Message, ServerConfig, ServerOAuthConfig } from "../../types";
import { normalizeHost } from "../helpers";
import type { AppState } from "../index";
import * as storage from "../localStorage";

// OAuth path is active if the user enabled it AND we hold any token to send.
// We don't gate on local expiry: the server is the authority and surfaces a
// useful 904 if the token is bad, prompting the user to re-authenticate.
function getActiveOauth(
  serv: ServerConfig | undefined,
): ServerOAuthConfig | undefined {
  if (!serv?.oauth?.enabled) return undefined;
  if (!serv.oauth.accessToken && !serv.oauth.idToken) return undefined;
  return serv.oauth;
}

// Pick the best bearer to send. For JWT-validated providers (Logto, Auth0,
// Google id_token) the id_token is preferable since it's the JWT the
// server can verify locally; access_token may be opaque even when the
// IdP also issues a JWT id_token. For opaque providers (GitHub) we just
// send the access_token raw and let the server hit userinfo.
function pickBearer(oauth: ServerOAuthConfig): string | undefined {
  if (oauth.tokenKind === "opaque") return oauth.accessToken;
  return oauth.idToken ?? oauth.accessToken;
}

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
      const serv = servers.find((s) => s.id === serverId);
      if (!serv) return;
      if (getActiveOauth(serv)) {
        // Flip the SASL-pending flag so IRCClient.onCapAck's race-y CAP END
        // path waits for 903/904 before tearing down the negotiation.
        ircClient.setSaslEnabled(serverId, true);
        ircClient.sendRaw(serverId, "AUTHENTICATE IRCV3BEARER");
        return;
      }
      if (!serv.saslEnabled) return;
      ircClient.sendRaw(serverId, "AUTHENTICATE PLAIN");
    }
  });

  ircClient.on("AUTHENTICATE", ({ serverId, param }) => {
    if (param !== "+") return;

    // Don't respond to AUTHENTICATE if CAP negotiation is already complete
    if (ircClient.isCapNegotiationComplete(serverId)) return;

    const servers = storage.servers.load();
    const serv = servers.find((s) => s.id === serverId);
    if (!serv) return;

    const oauth = getActiveOauth(serv);
    if (oauth) {
      const token = pickBearer(oauth);
      if (token) {
        const isOpaque = oauth.tokenKind === "opaque";
        const b64 = buildIrcv3BearerPayload({
          token,
          tokenType: isOpaque ? "opaque" : "jwt",
          // Opaque tokens carry the provider name so the server can pick
          // the right userinfo-url. JWT path doesn't need it (the server
          // matches by `iss` claim).
          authzid: isOpaque ? oauth.serverProvider : undefined,
        });
        for (const chunk of chunkSaslPayload(b64)) {
          ircClient.sendRaw(serverId, `AUTHENTICATE ${chunk}`);
        }
        return;
      }
    }

    if (!serv.saslEnabled) return;
    const user = serv.saslAccountName?.length
      ? serv.saslAccountName
      : serv.nickname;
    const pass = serv.saslPassword ? atob(serv.saslPassword) : undefined;
    if (!user || !pass) return;

    ircClient.sendRaw(
      serverId,
      `AUTHENTICATE ${btoa(`${user}\x00${user}\x00${pass}`)}`,
    );
    // Note: CAP END will be sent by the IRC client when SASL authentication completes (903/904-907 responses)
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
      // Only prevent CAP END if we actually have SASL credentials --
      // either a PLAIN password or an OAuth bearer token.
      const servers = storage.servers.load();
      const savedServer = servers.find((s) => s.id === serverId);
      const hasPlain =
        savedServer?.saslEnabled && Boolean(savedServer?.saslPassword);
      const hasOauth =
        savedServer?.oauth?.enabled &&
        Boolean(savedServer?.oauth?.accessToken || savedServer?.oauth?.idToken);
      if (hasPlain || hasOauth) {
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
          content: `Account registration successful for ${account}: ${message}`,
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
            content: `Account registration for ${account} requires verification: ${message}`,
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
          content: `Account verification successful for ${account}: ${message}`,
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

  // obsidianirc/cmdslist: maintain a lowercase set of invocable
  // commands per server.  Additions and removals can arrive in the
  // same wire line, so apply both atomically.
  ircClient.on("CMDSLIST", ({ serverId, additions, removals }) => {
    store.setState((state) => ({
      servers: state.servers.map((server) => {
        if (server.id !== serverId) return server;
        const next = new Set(server.cmdsAvailable ?? []);
        for (const cmd of additions) next.add(cmd.toLowerCase());
        for (const cmd of removals) next.delete(cmd.toLowerCase());
        return { ...server, cmdsAvailable: Array.from(next).sort() };
      }),
    }));
  });
}
