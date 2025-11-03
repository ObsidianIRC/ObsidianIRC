import type React from "react";
import { useEffect, useState } from "react";
import { FaQuestionCircle } from "react-icons/fa";
import useStore from "../../store";
import { SimpleModal } from "../modals";

export const AddServerModal: React.FC = () => {
  const { closeModal, connect, isConnecting, connectionError, ui } = useStore();

  // Read prefill data from modal props (passed via openModal) or fallback to legacy prefillServerDetails
  const modalProps = ui.modals.addServer?.props as
    | {
        name?: string;
        host?: string;
        port?: string;
        nickname?: string;
        ui?: {
          disableServerConnectionInfo?: boolean;
          hideServerInfo?: boolean;
          title?: string;
          hideClose?: boolean;
        };
      }
    | undefined;
  const prefillServerDetails = modalProps || ui.prefillServerDetails;
  const isOpen = ui.modals.addServer?.isOpen || false;

  const [serverName, setServerName] = useState(
    prefillServerDetails?.name || "",
  );
  const [serverHost, setServerHost] = useState(
    prefillServerDetails?.host || "",
  );
  const [serverPort, setServerPort] = useState(
    prefillServerDetails?.port || "443",
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
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");

  const [error, setError] = useState("");

  // Update state when prefillServerDetails changes (e.g., when clicking a server in discovery)
  useEffect(() => {
    if (prefillServerDetails) {
      setServerName(prefillServerDetails.name || "");
      setServerHost(prefillServerDetails.host || "");
      setServerPort(prefillServerDetails.port || "443");
      setNickname(
        prefillServerDetails.nickname ||
          `user${Math.floor(Math.random() * 1000)}`,
      );
    }
  }, [prefillServerDetails]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Default server name to server host if empty
    const finalServerName = serverName.trim() || serverHost.trim();

    // Default SASL account name to nickname if empty
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
      await connect(
        finalServerName,
        serverHost,
        Number.parseInt(serverPort, 10),
        nickname,
        !!saslPassword,
        password,
        finalSaslAccountName,
        saslPassword,
        registerAccount,
        registerEmail,
        registerPassword,
      );
      closeModal("addServer");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(errorMessage);
    }
  };

  const disableServerConnectionInfo =
    prefillServerDetails?.ui?.disableServerConnectionInfo;
  const hideServerInfo = prefillServerDetails?.ui?.hideServerInfo;

  const modalTitle = prefillServerDetails?.ui?.title || "Add IRC Server";

  const footerContent = (
    <div className="flex justify-end">
      {!prefillServerDetails?.ui?.hideClose && (
        <button
          type="button"
          onClick={() => closeModal("addServer")}
          className="mr-3 px-4 py-2 text-discord-text-normal hover:underline"
        >
          Cancel
        </button>
      )}
      <button
        type="submit"
        form="add-server-form"
        disabled={isConnecting}
        className={`px-4 py-2 bg-discord-primary text-white rounded font-medium ${isConnecting ? "opacity-70 cursor-not-allowed" : "hover:bg-opacity-80"}`}
      >
        {isConnecting ? "Connecting..." : "Connect"}
      </button>
    </div>
  );

  return (
    <SimpleModal
      isOpen={isOpen}
      onClose={() => closeModal("addServer")}
      title={modalTitle}
      footer={footerContent}
      maxWidth="md"
      showClose={!prefillServerDetails?.ui?.hideClose}
    >
      <div className="max-h-[60vh] overflow-y-auto">
        <form id="add-server-form" onSubmit={handleSubmit}>
          {!hideServerInfo && (
            <>
              <div className="mb-4">
                <label className="block text-discord-text-muted text-sm font-medium mb-1">
                  Network Name
                </label>
                <input
                  type="text"
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
                  <input
                    type="text"
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
            <div className="mb-4 text-discord-red text-sm">
              {error || connectionError}
            </div>
          )}
        </form>
      </div>
    </SimpleModal>
  );
};

export default AddServerModal;
