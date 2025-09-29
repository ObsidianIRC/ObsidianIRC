import type React from "react";
import { useState } from "react";
import { FaQuestionCircle, FaTimes } from "react-icons/fa";
import useStore from "../../store";

export const AddServerModal: React.FC = () => {
  const {
    toggleAddServerModal,
    connect,
    isConnecting,
    connectionError,
    ui: { prefillServerDetails },
  } = useStore();

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

  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!serverName.trim()) {
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
        serverHost,
        Number.parseInt(serverPort, 10),
        nickname,
        !!saslPassword,
        password,
        saslAccountName,
        saslPassword,
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
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-discord-dark-200 rounded-lg w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white text-xl font-bold">
            {prefillServerDetails?.ui?.title || "Add IRC Server"}
          </h2>
          {!prefillServerDetails?.ui?.hideClose && (
            <button
              onClick={() => toggleAddServerModal(false)}
              className="text-discord-text-muted hover:text-white"
            >
              <FaTimes />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit}>
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
            <>
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
            </>
          )}

          {(error || connectionError) && (
            <div className="mb-4 text-discord-red text-sm">
              {error || connectionError}
            </div>
          )}

          <div className="flex justify-end">
            {!prefillServerDetails?.ui?.hideClose && (
              <button
                type="button"
                onClick={() => toggleAddServerModal(false)}
                className="mr-3 px-4 py-2 text-discord-text-normal hover:underline"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isConnecting}
              className={`px-4 py-2 bg-discord-primary text-white rounded font-medium ${isConnecting ? "opacity-70 cursor-not-allowed" : "hover:bg-opacity-80"}`}
            >
              {isConnecting ? "Connecting..." : "Connect"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddServerModal;
