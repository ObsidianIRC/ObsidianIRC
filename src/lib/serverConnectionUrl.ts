import { parseIrcUrl } from "./ircUrlParser";

export interface ServerConnectionFields {
  host: string;
  port: string;
  useWebSocket: boolean;
}

function parseStandardUrl(url: string): {
  host: string;
  port: string;
  useWebSocket: boolean;
} | null {
  try {
    const parsed = new URL(url);
    const useWebSocket =
      parsed.protocol === "wss:" || parsed.protocol === "ws:";
    return {
      host: parsed.hostname,
      port: parsed.port,
      useWebSocket,
    };
  } catch {
    return null;
  }
}

function parseHostWithOptionalPort(value: string): {
  host: string;
  port?: string;
} {
  const trimmed = value.trim();
  const match = trimmed.match(/^([^:/?#\s]+):(\d+)$/);
  if (!match) {
    return { host: trimmed };
  }

  return {
    host: match[1],
    port: match[2],
  };
}

export function getServerConnectionFields(
  rawHost: string | null | undefined,
  rawPort: string | number | null | undefined,
  fallbackUseWebSocket = false,
): ServerConnectionFields {
  const fallbackPort = String(rawPort ?? "").trim();
  const host = rawHost?.trim() ?? "";

  if (!host) {
    return {
      host: "",
      port: fallbackPort,
      useWebSocket: fallbackUseWebSocket,
    };
  }

  if (host.startsWith("ircs://") || host.startsWith("irc://")) {
    const parsed = parseIrcUrl(host);
    return {
      host: parsed.host,
      port: String(parsed.port || fallbackPort),
      useWebSocket: false,
    };
  }

  if (host.startsWith("wss://") || host.startsWith("ws://")) {
    const parsed = parseStandardUrl(host);
    if (parsed) {
      return {
        host: parsed.host,
        port: parsed.port || fallbackPort,
        useWebSocket: parsed.useWebSocket,
      };
    }
  }

  const parsedHost = parseHostWithOptionalPort(host);
  return {
    host: parsedHost.host,
    port: parsedHost.port || fallbackPort,
    useWebSocket: fallbackUseWebSocket,
  };
}

export function buildServerConnectionUrl(
  hostInput: string,
  port: number,
  options: {
    isTauri: boolean;
    useWebSocket: boolean;
  },
): string {
  const { host } = getServerConnectionFields(
    hostInput,
    String(port),
    options.useWebSocket,
  );
  const trimmedHost = host.trim();
  if (!trimmedHost) return "";

  const scheme = options.isTauri
    ? options.useWebSocket
      ? "wss"
      : "ircs"
    : "wss";

  return `${scheme}://${trimmedHost}:${port}`;
}
