import { Trans, useLingui } from "@lingui/react/macro";
import type React from "react";
import { useState } from "react";
import { FaQuestionCircle, FaTimes } from "react-icons/fa";
import useStore, { loadSavedServers } from "../../store";
import type { ServerConfig } from "../../types";
import { TextInput } from "./TextInput";

interface EditServerModalProps {
  serverId: string;
  onClose: () => void;
}

export const EditServerModal: React.FC<EditServerModalProps> = ({
  serverId,
  onClose,
}) => {
  const { t } = useLingui();
  const { servers, updateServer, sendRaw, isConnecting } = useStore();

  const server = servers.find((s) => s.id === serverId);
  const savedServers = loadSavedServers();
  const serverConfig = savedServers.find((s) => s.id === serverId);

  // Initialize state with current server values
  const [serverName, setServerName] = useState(
    serverConfig?.name || server?.name || "",
  );
  const [serverHost, setServerHost] = useState(
    serverConfig?.host || server?.host || "",
  );
  const [serverPort, setServerPort] = useState(
    serverConfig?.port?.toString() || server?.port?.toString() || "443",
  );
  const [nickname, setNickname] = useState(serverConfig?.nickname || "");
  const [password, setPassword] = useState("");
  const [saslAccountName, setSaslAccountName] = useState(
    serverConfig?.saslAccountName || "",
  );
  const [saslPassword, setSaslPassword] = useState("");
  const [saslEnabled, setSaslEnabled] = useState(
    serverConfig?.saslEnabled ? "true" : "",
  );

  // IRC Operator fields
  const [operName, setOperName] = useState(serverConfig?.operUsername || "");
  const [operPassword, setOperPassword] = useState("");
  const [operOnConnect, setOperOnConnect] = useState(
    serverConfig?.operOnConnect || false,
  );
  const [forgetOperCredentials, setForgetOperCredentials] = useState(false);

  const [showServerPassword, setShowServerPassword] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [registerAccount, setRegisterAccount] = useState(false);
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");

  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Default server name to server host if empty
    const finalServerName = serverName.trim() || serverHost.trim();

    // Default SASL account name to nickname if empty
    const finalSaslAccountName = saslAccountName.trim() || nickname.trim();

    if (!finalServerName) {
      setError(t`Server name is required`);
      return;
    }

    if (!serverHost.trim()) {
      setError(t`Server host is required`);
      return;
    }

    if (!serverPort.trim() || Number.isNaN(Number.parseInt(serverPort, 10))) {
      setError(t`Valid server port is required`);
      return;
    }

    if (!nickname.trim()) {
      setError(t`Nickname is required`);
      return;
    }

    try {
      // Update server configuration
      const updatedConfig: Partial<ServerConfig> = {
        name: finalServerName,
        host: serverHost.trim(),
        port: Number.parseInt(serverPort, 10),
        nickname: nickname.trim(),
        password: password.trim() || undefined,
        saslAccountName: finalSaslAccountName || undefined,
        saslPassword: saslPassword.trim() || undefined,
        saslEnabled: !!saslPassword.trim(),
        // Handle oper credentials: only update if explicitly provided, or forget if requested
        ...(forgetOperCredentials
          ? { operUsername: undefined, operPassword: undefined }
          : operName.trim()
            ? {
                operUsername: operName.trim(),
                ...(operPassword.trim()
                  ? { operPassword: btoa(operPassword.trim()) }
                  : {}),
              }
            : {}),
        operOnConnect,
      };

      updateServer(serverId, updatedConfig);
      onClose();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(errorMessage);
    }
  };

  const handleOperUp = () => {
    if (operName.trim() && operPassword.trim()) {
      sendRaw(serverId, `OPER ${operName.trim()} ${operPassword.trim()}`);
    } else {
      setError(t`Oper name and password are required`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 modal-container">
      <div className="bg-discord-dark-200 rounded-lg w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white text-xl font-bold">
            <Trans>Edit Server</Trans>
          </h2>
          <button
            onClick={onClose}
            className="text-discord-text-muted hover:text-white"
          >
            <FaTimes />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-discord-text-muted text-sm font-medium mb-1">
              <Trans>Network Name</Trans>
            </label>
            <TextInput
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder={t`ExampleNET`}
              className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-discord-primary"
            />
          </div>

          <div className="mb-4 flex gap-4">
            <div className="flex-1">
              <label className="block text-discord-text-muted text-sm font-medium mb-1">
                <Trans>Server Host</Trans>
              </label>
              <TextInput
                value={serverHost}
                onChange={(e) => setServerHost(e.target.value)}
                placeholder="irc.example.com"
                className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-discord-primary"
              />
            </div>

            <div className="w-28">
              <label className="block text-discord-text-muted text-sm font-medium mb-1">
                <Trans>Port</Trans>{" "}
                <FaQuestionCircle
                  title={t`Only secure websockets are supported`}
                  className="inline-block text-discord-text-muted cursor-help text-xs ml-1"
                />
              </label>
              <TextInput
                value={serverPort}
                onChange={(e) => setServerPort(e.target.value)}
                placeholder="443"
                className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-discord-primary"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-discord-text-muted text-sm font-medium mb-1">
              <Trans>Nickname</Trans>
            </label>
            <TextInput
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t`YourNickname`}
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
                  <Trans>Login to an account</Trans>
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
                  <Trans>Use server password</Trans>
                </label>
              </div>
            </div>
          </div>

          {showServerPassword && (
            <div className="mb-4">
              <label className="block text-discord-text-muted text-sm font-medium mb-1">
                <Trans>Server Password</Trans>
              </label>
              <TextInput
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t`Server Password`}
                className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-discord-primary"
              />
            </div>
          )}

          {showAccount && (
            <div className="mb-4 flex gap-4">
              <div className="mb-4">
                <label className="block text-discord-text-muted text-sm font-medium mb-1">
                  <Trans>Account details</Trans>
                </label>
                <TextInput
                  value={saslAccountName || nickname}
                  onChange={(e) => setSaslAccountName(e.target.value)}
                  placeholder={t`SASL Account Name`}
                  className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-discord-primary"
                />
              </div>
              <div className="mb-4">
                <label className="block text-discord-text-muted text-sm font-medium mb-1 mt-6" />
                <TextInput
                  type="password"
                  value={saslPassword ? atob(saslPassword) : ""}
                  onChange={(e) => setSaslPassword(btoa(e.target.value))}
                  placeholder={t`Password`}
                  className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-discord-primary"
                />
              </div>
            </div>
          )}

          {/* IRC Operator Section */}
          <div className="mb-4 border-t border-discord-dark-300 pt-4">
            <h3 className="text-discord-text-normal text-lg font-semibold mb-3">
              <Trans>IRC Operator</Trans>
            </h3>

            <div className="mb-4 flex gap-4">
              <div className="flex-1">
                <label className="block text-discord-text-muted text-sm font-medium mb-1">
                  <Trans>Oper Name</Trans>
                </label>
                <TextInput
                  value={operName}
                  onChange={(e) => setOperName(e.target.value)}
                  placeholder={t`Operator username`}
                  className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-discord-primary"
                />
              </div>
              <div className="flex-1">
                <label className="block text-discord-text-muted text-sm font-medium mb-1">
                  <Trans>Oper Password</Trans>
                </label>
                <TextInput
                  type="password"
                  value={operPassword}
                  onChange={(e) => setOperPassword(e.target.value)}
                  placeholder={t`Operator password`}
                  className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-discord-primary"
                />
              </div>
            </div>

            <div className="mb-4 text-xs text-discord-text-muted">
              {forgetOperCredentials ? (
                <span className="text-red-400">
                  <Trans>⚠️ Existing oper credentials will be forgotten</Trans>
                </span>
              ) : operName.trim() && operPassword.trim() ? (
                <span className="text-green-400">
                  <Trans>✓ Both username and password will be updated</Trans>
                </span>
              ) : operName.trim() ? (
                <span className="text-blue-400">
                  <Trans>✓ Username will be updated, password preserved</Trans>
                </span>
              ) : serverConfig?.operUsername ? (
                <span>
                  <Trans>Existing credentials will be preserved</Trans>
                </span>
              ) : (
                <span>
                  <Trans>No oper credentials configured</Trans>
                </span>
              )}
            </div>

            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="operOnConnect"
                  checked={operOnConnect}
                  onChange={() => setOperOnConnect(!operOnConnect)}
                  className="accent-discord-accent rounded"
                />
                <label
                  htmlFor="operOnConnect"
                  className="text-discord-text-muted text-sm"
                >
                  <Trans>Oper on connect</Trans>
                </label>
              </div>

              <div className="flex gap-2">
                {serverConfig?.operUsername && (
                  <button
                    type="button"
                    onClick={() =>
                      setForgetOperCredentials(!forgetOperCredentials)
                    }
                    className={`px-3 py-1 text-sm rounded font-medium ${
                      forgetOperCredentials
                        ? "bg-red-600 text-white hover:bg-red-700"
                        : "bg-gray-600 text-gray-300 hover:bg-gray-500"
                    }`}
                  >
                    {forgetOperCredentials ? (
                      <Trans>Will Forget</Trans>
                    ) : (
                      <Trans>Forget Credentials</Trans>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleOperUp}
                  disabled={!operName.trim() || !operPassword.trim()}
                  className={`px-3 py-1 text-sm rounded font-medium ${
                    operName.trim() && operPassword.trim()
                      ? "bg-discord-primary text-white hover:bg-opacity-80"
                      : "bg-gray-600 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  <Trans>Oper Up</Trans>
                </button>
              </div>
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
              <Trans>Register for an account</Trans>
            </label>
          </div>

          {registerAccount && (
            <>
              <div className="mb-4">
                <label className="block text-discord-text-muted text-sm font-medium mb-1">
                  <Trans>Account Email</Trans>
                </label>
                <TextInput
                  type="email"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  placeholder={t`your@email.com`}
                  className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-discord-primary"
                />
              </div>
              <div className="mb-4">
                <label className="block text-discord-text-muted text-sm font-medium mb-1">
                  <Trans>Account Password</Trans>
                </label>
                <TextInput
                  type="password"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  placeholder={t`Choose a secure password`}
                  className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-discord-primary"
                />
              </div>
            </>
          )}

          {error && (
            <div className="mb-4 text-discord-red text-sm">{error}</div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="mr-3 px-4 py-2 text-discord-text-normal hover:underline"
            >
              <Trans>Cancel</Trans>
            </button>
            <button
              type="submit"
              disabled={isConnecting}
              className={`px-4 py-2 bg-discord-primary text-white rounded font-medium ${isConnecting ? "opacity-70 cursor-not-allowed" : "hover:bg-opacity-80"}`}
            >
              {isConnecting ? (
                <Trans>Updating...</Trans>
              ) : (
                <Trans>Update Server</Trans>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditServerModal;
