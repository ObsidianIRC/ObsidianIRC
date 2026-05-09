import { v4 as uuidv4 } from "uuid";
import type { StoreApi } from "zustand";
import ircClient from "../../lib/ircClient";
import {
  type ScramState,
  sasl as saslChunk,
  scramFinal,
  scramStart,
  scramVerifyServerFinal,
} from "../../lib/sasl/scram";
import {
  b64StdDecode,
  bytesToB64Std,
  isWebAuthnAvailable,
  webauthnAssert,
} from "../../lib/sasl/webauthn";
import type { Message } from "../../types";
import { normalizeHost } from "../helpers";
import type { AppState } from "../index";
import * as storage from "../localStorage";

type SaslMech = "PLAIN" | "SCRAM-SHA-256" | "DRAFT-WEBAUTHN-BIO";

interface SaslSession {
  mech: SaslMech;
  username: string;
  password?: string;
  scram?: ScramState;
  step: number;
}

const sessions = new Map<string, SaslSession>();

function chooseMechanism(
  available: string[],
  pref: "auto" | "PLAIN" | "SCRAM-SHA-256" | "DRAFT-WEBAUTHN-BIO" | undefined,
): SaslMech {
  if (pref === "DRAFT-WEBAUTHN-BIO" && available.includes("DRAFT-WEBAUTHN-BIO"))
    return "DRAFT-WEBAUTHN-BIO";
  if (pref === "PLAIN") return "PLAIN";
  if (pref === "SCRAM-SHA-256" && available.includes("SCRAM-SHA-256"))
    return "SCRAM-SHA-256";
  // auto: prefer SCRAM-SHA-256 over PLAIN.
  if (available.includes("SCRAM-SHA-256")) return "SCRAM-SHA-256";
  return "PLAIN";
}

function loadCreds(
  serverId: string,
): { user: string; pass: string; mech: SaslMech } | null {
  const servers = storage.servers.load();
  const serv = servers.find((s) => s.id === serverId);
  if (!serv?.saslEnabled) return null;
  const user = serv.saslAccountName?.length
    ? serv.saslAccountName
    : serv.nickname;
  const pass = serv.saslPassword ? atob(serv.saslPassword) : undefined;
  if (!user || !pass) return null;
  const available = ircClient.getSaslMechanisms(serverId);
  const mech = chooseMechanism(available, serv.saslMechanism);
  return { user, pass, mech };
}

function clearSession(serverId: string) {
  sessions.delete(serverId);
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
    }
    if (key !== "sasl") return;

    // Pick mechanism up-front so the AUTHENTICATE event handler knows what
    // to do when the server says "+".
    const servers = storage.servers.load();
    const serv = servers.find((s) => s.id === serverId);
    if (!serv?.saslEnabled) return;

    const available = ircClient.getSaslMechanisms(serverId);
    const mech = chooseMechanism(available, serv.saslMechanism);
    const username = serv.saslAccountName?.length
      ? serv.saslAccountName
      : serv.nickname;
    const password = serv.saslPassword ? atob(serv.saslPassword) : undefined;

    sessions.set(serverId, {
      mech,
      username,
      password,
      step: 0,
    });
    ircClient.sendRaw(serverId, `AUTHENTICATE ${mech}`);
  });

  ircClient.on("AUTHENTICATE", async ({ serverId, param }) => {
    if (ircClient.isCapNegotiationComplete(serverId)) return;

    // Synthetic step-up signal from the server (draft/account-2fa).
    if (param === "2FA-REQUIRED") {
      const session = sessions.get(serverId);
      const acct = session?.username ?? "";
      store.setState({ pendingTotpStepUp: { serverId, account: acct } });
      return;
    }

    const session = sessions.get(serverId);
    if (!session) {
      // Either no SASL is in flight or a fresh PLAIN exchange started before
      // our session was set up.  Fall back to the legacy PLAIN behaviour so
      // older test fixtures still work.
      if (param !== "+") return;
      const creds = loadCreds(serverId);
      if (!creds || creds.mech !== "PLAIN") return;
      ircClient.sendRaw(
        serverId,
        `AUTHENTICATE ${btoa(`${creds.user}\x00${creds.user}\x00${creds.pass}`)}`,
      );
      return;
    }

    try {
      if (session.mech === "PLAIN") {
        if (param !== "+") return;
        if (!session.password) return;
        ircClient.sendRaw(
          serverId,
          `AUTHENTICATE ${btoa(`${session.username}\x00${session.username}\x00${session.password}`)}`,
        );
        return;
      }

      if (session.mech === "SCRAM-SHA-256") {
        if (session.step === 0 && param === "+") {
          if (!session.password) return;
          const { state, message } = scramStart(
            session.username,
            session.password,
          );
          session.scram = state;
          session.step = 1;
          ircClient.sendRaw(
            serverId,
            `AUTHENTICATE ${saslChunk.encodeUtf8(message)}`,
          );
          return;
        }
        if (session.step === 1 && session.scram) {
          const serverFirst = saslChunk.decodeUtf8(param);
          const clientFinal = await scramFinal(session.scram, serverFirst);
          session.step = 2;
          ircClient.sendRaw(
            serverId,
            `AUTHENTICATE ${saslChunk.encodeUtf8(clientFinal)}`,
          );
          return;
        }
        if (session.step === 2 && session.scram) {
          const serverFinal = saslChunk.decodeUtf8(param);
          const ok = scramVerifyServerFinal(session.scram, serverFinal);
          if (!ok) {
            ircClient.sendRaw(serverId, "AUTHENTICATE *");
          }
          // On success the server completes the exchange itself by
          // emitting 900/903 (normal) or AUTHENTICATE 2FA-REQUIRED
          // (step-up). Sending another "AUTHENTICATE +" here is read
          // as an empty/abort payload by saslserv and trips 904.
          session.step = 3;
          return;
        }
        return;
      }

      if (session.mech === "DRAFT-WEBAUTHN-BIO") {
        if (session.step === 0 && param === "+") {
          // Send hello identifying the account; the server will reply with
          // a challenge JSON in the next AUTHENTICATE message.
          const hello = JSON.stringify({ username: session.username });
          session.step = 1;
          ircClient.sendRaw(serverId, `AUTHENTICATE ${btoa(hello)}`);
          return;
        }
        if (session.step === 1) {
          if (!isWebAuthnAvailable()) {
            ircClient.sendRaw(serverId, "AUTHENTICATE *");
            return;
          }
          const challengeJson = JSON.parse(
            new TextDecoder().decode(b64StdDecode(param)),
          );
          const assertion = await webauthnAssert(challengeJson);
          const reply = JSON.stringify(assertion);
          session.step = 2;
          ircClient.sendRaw(
            serverId,
            `AUTHENTICATE ${bytesToB64Std(new TextEncoder().encode(reply))}`,
          );
          return;
        }
        return;
      }
    } catch (err) {
      console.error("[SASL] error:", err);
      ircClient.sendRaw(serverId, "AUTHENTICATE *");
      clearSession(serverId);
    }
  });

  // 2FA replies: server uses NOTE 2FA <code> <args...> :<desc>.
  // `args` here is everything after the code; the trailing description is
  // the LAST entry (parsed by the IRC layer as a single trailing param).
  ircClient.on("TWOFA_NOTE", ({ serverId, code, args }) => {
    // args[0..len-2] are positional, args[len-1] is the description.
    const positional = args.slice(0, Math.max(0, args.length - 1));
    if (code === "ENABLED") {
      store.setState((s) => ({
        twofaStatus: { ...s.twofaStatus, [serverId]: "enabled" },
      }));
    } else if (code === "DISABLED") {
      store.setState((s) => ({
        twofaStatus: { ...s.twofaStatus, [serverId]: "disabled" },
      }));
    } else if (code === "REGISTRATION_CHALLENGE") {
      const type = positional[0] ?? "";
      const blob = positional[1] ?? "";
      store.setState({
        pendingTwofaChallenge: { serverId, type, blob },
      });
    } else if (code === "CREDENTIAL") {
      const id = positional[0] ?? "";
      const credType = positional[1] ?? "";
      const name = positional[2] ?? "";
      const ts = positional[3] ?? "";
      store.setState((s) => ({
        twofaCredentials: {
          ...s.twofaCredentials,
          [serverId]: [
            ...(s.twofaCredentials[serverId] ?? []),
            { id, type: credType, name, createdAt: ts },
          ],
        },
      }));
    } else if (code === "NO_CREDENTIALS") {
      store.setState((s) => ({
        twofaCredentials: { ...s.twofaCredentials, [serverId]: [] },
      }));
    }
  });

  // `2FA <subcommand> SUCCESS ...` lands in the dedicated TWOFA event.
  ircClient.on("TWOFA", ({ serverId, subcommand, status, args }) => {
    if (status !== "SUCCESS") return;
    if (subcommand === "ADD") {
      // Args: <type> <id> :<description>
      // We don't know the name from the success line alone; the LIST query
      // below refreshes the table.
      store.getState().twofaListQuery(serverId);
      store.setState({ pendingTwofaChallenge: null });
    } else if (subcommand === "REMOVE") {
      const id = args[0] ?? "";
      store.setState((s) => ({
        twofaCredentials: {
          ...s.twofaCredentials,
          [serverId]: (s.twofaCredentials[serverId] ?? []).filter(
            (c) => c.id !== id,
          ),
        },
      }));
    } else if (subcommand === "ENABLE") {
      store.setState((s) => ({
        twofaStatus: { ...s.twofaStatus, [serverId]: "enabled" },
      }));
    } else if (subcommand === "DISABLE") {
      store.setState((s) => ({
        twofaStatus: { ...s.twofaStatus, [serverId]: "disabled" },
      }));
    }
  });

  // Handle CAP LS to get informational capabilities like unrealircd.org/link-security
  ircClient.on("CAP LS", ({ serverId, cliCaps }) => {
    if (cliCaps.includes("unrealircd.org/link-security=")) {
      const match = cliCaps.match(/unrealircd\.org\/link-security=(\d+)/);
      if (match) {
        const linkSecurityValue = Number.parseInt(match[1], 10) || 0;
        store.setState((state) => {
          const updatedServers = state.servers.map((server) =>
            server.id === serverId
              ? { ...server, linkSecurity: linkSecurityValue }
              : server,
          );
          return { servers: updatedServers };
        });

        const currentState = store.getState();
        const currentServer = currentState.servers.find(
          (s) => s.id === serverId,
        );
        const hasLowLinkSecurity = linkSecurityValue < 2;
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
            const existingWarning = state.ui.linkSecurityWarnings.find(
              (w) => w.serverId === serverId,
            );
            if (existingWarning) return state;
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

    store.setState((state) => {
      const updatedServers = state.servers.map((server) => {
        if (server.id === serverId) {
          const existing = server.capabilities ?? [];
          const newCaps = cliCaps.split(" ");
          const merged = [...existing];
          for (const cap of newCaps) {
            if (!merged.includes(cap)) merged.push(cap);
          }
          return { ...server, capabilities: merged };
        }
        return server;
      });
      return { servers: updatedServers };
    });

    const state = store.getState();
    const server = state.servers.find((s) => s.id === serverId);
    let preventCapEnd = false;

    if (caps.some((cap) => cap.startsWith("sasl"))) {
      const servers = storage.servers.load();
      const savedServer = servers.find((s) => s.id === serverId);
      if (savedServer?.saslEnabled && savedServer?.saslPassword) {
        preventCapEnd = true;
      }
    }

    const pendingReg = state.pendingRegistration;
    if (pendingReg && pendingReg.serverId === serverId) {
      preventCapEnd = true;
      if (server?.capabilities?.includes("draft/account-registration")) {
        store
          .getState()
          .registerAccount(
            serverId,
            pendingReg.account,
            pendingReg.email,
            pendingReg.password,
          );
        store.setState({ pendingRegistration: null });
      } else {
        store.setState({ pendingRegistration: null });
        preventCapEnd = false;
      }
    }

    if (state.ui.linkSecurityWarnings.some((w) => w.serverId === serverId)) {
      preventCapEnd = true;
    }

    if (!preventCapEnd) {
      ircClient.sendRaw(serverId, "CAP END");
      ircClient.userOnConnect(serverId);
    }
  });

  // Account registration event handlers
  ircClient.on("REGISTER_SUCCESS", ({ serverId, account, message }) => {
    const state = store.getState();
    const server = state.servers.find((s) => s.id === serverId);
    if (!server) return;
    const channel = server.channels[0];
    if (!channel) return;
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
    store.setState((s) => ({
      messages: {
        ...s.messages,
        [key]: [...(s.messages[key] || []), notificationMessage],
      },
    }));
  });

  ircClient.on(
    "REGISTER_VERIFICATION_REQUIRED",
    ({ serverId, account, message }) => {
      const state = store.getState();
      const server = state.servers.find((s) => s.id === serverId);
      if (!server) return;
      const channel = server.channels[0];
      if (!channel) return;
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
      store.setState((s) => ({
        messages: {
          ...s.messages,
          [key]: [...(s.messages[key] || []), notificationMessage],
        },
      }));
    },
  );

  ircClient.on("VERIFY_SUCCESS", ({ serverId, account, message }) => {
    const state = store.getState();
    const server = state.servers.find((s) => s.id === serverId);
    if (!server) return;
    const channel = server.channels[0];
    if (!channel) return;
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
    store.setState((s) => ({
      messages: {
        ...s.messages,
        [key]: [...(s.messages[key] || []), notificationMessage],
      },
    }));
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
        const updatedServers = state.servers.map((server) =>
          server.id === serverId ? { ...server, jwtToken } : server,
        );
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
