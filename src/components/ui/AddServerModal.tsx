import type React from "react";
import { useEffect, useState } from "react";
import { FaQuestionCircle } from "react-icons/fa";
import BaseModal from "../../lib/modal/BaseModal";
import { Button, ModalBody, ModalFooter } from "../../lib/modal/components";
import { isTauri } from "../../lib/platformUtils";
import useStore from "../../store";
import { TextInput } from "./TextInput";

export const AddServerModal: React.FC = () => {
  const {
    toggleAddServerModal,
    connect,
    isConnecting,
    connectionError,
    ui: { prefillServerDetails, isAddServerModalOpen },
  } = useStore();

  const [serverName, setServerName] = useState(
    prefillServerDetails?.name || "",
  );
  const [serverHost, setServerHost] = useState(
    prefillServerDetails?.host || "",
  );
  const [serverPort, setServerPort] = useState(
    prefillServerDetails?.port || (isTauri() ? "6697" : "443"),
  );
  const [nickname, setNickname] = useState(
    prefillServerDetails?.nickname || `user${Math.floor(Math.random() * 1000)}`,
  );
  const [password, setPassword] = useState("");
  const [saslAccountName, setSaslAccountName] = useState("");
  const [saslPassword, setSaslPassword] = useState("");
  const [saslEnabled, setSaslEnabled] = useState("");
  const [showServerPassword, setShowServerPassword] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [registerAccount, setRegisterAccount] = useState(false);
  const [useWebSocket, setUseWebSocket] = useState(
    prefillServerDetails?.useWebSocket ?? false,
  );
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");

  const [error, setError] = useState("");

  useEffect(() => {
    setServerName(prefillServerDetails?.name || "");
    setServerHost(prefillServerDetails?.host || "");
    setServerPort(prefillServerDetails?.port || (isTauri() ? "6697" : "443"));
    setNickname(
      prefillServerDetails?.nickname ||
        `user${Math.floor(Math.random() * 1000)}`,
    );
    setUseWebSocket(prefillServerDetails?.useWebSocket || false);
  }, [prefillServerDetails]);

  useEffect(() => {
    if (!isTauri()) return;

    const currentPort = serverPort;
    const ircPorts = ["6667", "6697"];
    const wssPorts = ["443"];

    if (useWebSocket && ircPorts.includes(currentPort)) {
      setServerPort("443");
    } else if (!useWebSocket && wssPorts.includes(currentPort)) {
      setServerPort("6697");
    }
  }, [useWebSocket, serverPort]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const finalServerName = serverName.trim() || serverHost.trim();
    const finalSaslAccountName = saslAccountName.trim() || nickname.trim();

    if (!finalServerName) {
      setError("Server name is required");
      return;
    }

    if (!serverHost.trim()) {
      setError("Server host is required");
      return;
    }

    if (!serverPort.trim() || Number.isNaN(Number.parseInt(serverPort, 10))) {
      setError("Valid server port is required");
      return;
    }

    if (!nickname.trim()) {
      setError("Nickname is required");
      return;
    }

    try {
      let finalHost = serverHost;
      if (isTauri()) {
        const port = Number.parseInt(serverPort, 10);
        const cleanHost = serverHost.replace(
          /^(https?|wss?|ircs?|irc):\/\//,
          "",
        );

        const isLocalhost =
          cleanHost.toLowerCase() === "localhost" ||
          cleanHost === "127.0.0.1" ||
          cleanHost === "::1";

        const isSSLPort =
          !isLocalhost &&
          (port === 6697 || port === 9999 || port === 443 || port === 993);

        if (useWebSocket) {
          finalHost = `${isSSLPort ? "wss" : "ws"}://${cleanHost}:${port}`;
        } else {
          finalHost = `${isSSLPort ? "ircs" : "irc"}://${cleanHost}:${port}`;
        }
      }

      await connect(
        finalServerName,
        finalHost,
        Number.parseInt(serverPort, 10),
        nickname,
        !!saslPassword,
        password,
        finalSaslAccountName,
        saslPassword,
        registerAccount,
        registerEmail,
        registerPassword,
        true,
      );
      toggleAddServerModal(false);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(errorMessage);
    }
  };

  const disableServerConnectionInfo =
    prefillServerDetails?.ui?.disableServerConnectionInfo;
  const hideServerInfo = prefillServerDetails?.ui?.hideServerInfo;

  return (
    <BaseModal
      isOpen={!!isAddServerModalOpen}
      onClose={() => toggleAddServerModal(false)}
      title={prefillServerDetails?.ui?.title || "Add IRC Server"}
      maxWidth="md"
      showCloseButton={!prefillServerDetails?.ui?.hideClose}
    >
      <form onSubmit={handleSubmit}>
        <ModalBody scrollable className="max-h-[60vh]">
          {!hideServerInfo && (
            <>
              <div className="mb-4">
                <label className="block text-discord-text-muted text-sm font-medium mb-1">
                  Network Name
                </label>
                <TextInput
                  value={serverName || serverHost || ""}
                  onChange={(e) => setServerName(e.target.value)}
                  onFocus={(e) => {
                    e.target.select();
                  }}
                  placeholder="ExampleNET"
                  className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-discord-primary"
                />
              </div>

              <div className="mb-4 flex gap-4">
                <div className="flex-1">
                  <label className="block text-discord-text-muted text-sm font-medium mb-1">
                    Server Host
                  </label>
                  <TextInput
                    value={serverHost || ""}
                    onChange={(e) => setServerHost(e.target.value)}
                    onFocus={(e) => {
                      e.target.select();
                    }}
                    placeholder="irc.example.com"
                    className={`w-full rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-discord-primary ${
                      disableServerConnectionInfo
                        ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                        : "bg-discord-dark-400 text-discord-text-normal"
                    }`}
                    disabled={disableServerConnectionInfo}
                  />
                </div>

                <div className="w-28">
                  <label className="block text-discord-text-muted text-sm font-medium mb-1">
                    Port{" "}
                    <FaQuestionCircle
                      title="Only secure websockets are supported"
                      className="inline-block text-discord-text-muted cursor-help text-xs ml-1"
                    />
                  </label>
                  <input
                    type="text"
                    value={serverPort}
                    onChange={(e) => setServerPort(e.target.value)}
                    onFocus={(e) => {
                      e.target.select();
                    }}
                    placeholder="443"
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className={`w-full rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-discord-primary ${
                      disableServerConnectionInfo
                        ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                        : "bg-discord-dark-400 text-discord-text-normal"
                    }`}
                    disabled={disableServerConnectionInfo}
                  />
                </div>
              </div>
            </>
          )}

          <div className="mb-4">
            <label className="block text-discord-text-muted text-sm font-medium mb-1">
              Nickname
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onFocus={(e) => {
                e.target.select();
              }}
              placeholder="YourNickname"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-discord-primary"
            />
          </div>

          <div className="mt-4 space-y-2">
            <div className="mb-3 flex gap-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="showAccount"
                  checked={showAccount}
                  onChange={() => setShowAccount(!showAccount)}
                  className="accent-discord-accent rounded"
                />
                <label
                  htmlFor="showAccount"
                  className="text-discord-text-muted text-sm"
                >
                  Login to an account
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="showServerPassword"
                  checked={showServerPassword}
                  onChange={() => setShowServerPassword(!showServerPassword)}
                  className="accent-discord-accent rounded"
                />
                <label
                  htmlFor="showServerPassword"
                  className="text-discord-text-muted text-sm"
                >
                  Use server password
                </label>
              </div>
              {isTauri() && (
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="useWebSocket"
                    checked={useWebSocket}
                    onChange={() => setUseWebSocket(!useWebSocket)}
                    className="accent-discord-accent rounded"
                  />
                  <label
                    htmlFor="useWebSocket"
                    className="text-discord-text-muted text-sm flex items-center"
                  >
                    WSS{" "}
                    <FaQuestionCircle
                      title="Use WebSocket instead of raw TCP"
                      className="inline-block text-discord-text-muted cursor-help text-xs ml-1"
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
          {showServerPassword && (
            <div className="mb-4">
              <label className="block text-discord-text-muted text-sm font-medium mb-1">
                Server Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={(e) => {
                  e.target.select();
                }}
                placeholder="Server Password"
                className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-discord-primary"
              />
            </div>
          )}
          {showAccount && (
            <div className="mb-4 flex gap-4">
              <div className="mb-4">
                <label className="block text-discord-text-muted text-sm font-medium mb-1">
                  Account details
                </label>
                <input
                  type="text"
                  value={saslAccountName || nickname}
                  onChange={(e) => setSaslAccountName(e.target.value)}
                  onFocus={(e) => {
                    e.target.select();
                  }}
                  placeholder="SASL Account Name"
                  className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-discord-primary"
                />
              </div>
              <div className="mb-4">
                <label className="block text-discord-text-muted text-sm font-medium mb-1 mt-6" />
                <input
                  type="password"
                  value={atob(saslPassword)}
                  onChange={(e) => setSaslPassword(btoa(e.target.value))}
                  onFocus={(e) => {
                    e.target.select();
                  }}
                  placeholder="Password"
                  className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-discord-primary"
                />
              </div>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="registerAccount"
              checked={registerAccount}
              onChange={() => setRegisterAccount(!registerAccount)}
              className="accent-discord-accent rounded"
            />
            <label
              htmlFor="registerAccount"
              className="text-discord-text-muted text-sm"
            >
              Register for an account
            </label>
          </div>
          {registerAccount && (
            <>
              <div className="mb-4">
                <label className="block text-discord-text-muted text-sm font-medium mb-1">
                  Account Email
                </label>
                <input
                  type="email"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  onFocus={(e) => {
                    e.target.select();
                  }}
                  placeholder="your@email.com"
                  className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-discord-primary"
                />
              </div>
              <div className="mb-4">
                <label className="block text-discord-text-muted text-sm font-medium mb-1">
                  Account Password
                </label>
                <input
                  type="password"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  onFocus={(e) => {
                    e.target.select();
                  }}
                  placeholder="Choose a secure password"
                  className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-discord-primary"
                />
              </div>
            </>
          )}

          {(error || connectionError) && (
            <div className="text-discord-red text-sm">
              {error || connectionError}
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          {!prefillServerDetails?.ui?.hideClose && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => toggleAddServerModal(false)}
            >
              Cancel
            </Button>
          )}
          <Button type="submit" variant="primary" disabled={isConnecting}>
            {isConnecting ? "Connecting..." : "Connect"}
          </Button>
        </ModalFooter>
      </form>
    </BaseModal>
  );
};

export default AddServerModal;
