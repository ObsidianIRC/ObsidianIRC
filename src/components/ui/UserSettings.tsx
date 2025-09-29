import type React from "react";
import { useEffect, useState } from "react";
import { FaTimes } from "react-icons/fa";
import useStore from "../../store";

const UserSettings: React.FC = () => {
  const {
    toggleUserProfileModal,
    currentUser,
    servers,
    ui,
    metadataSet,
    sendRaw,
  } = useStore();
  const currentServer = servers.find((s) => s.id === ui.selectedServerId);
  const supportsMetadata =
    currentServer?.capabilities?.some((cap) =>
      cap.startsWith("draft/metadata"),
    ) || false;

  // Metadata state
  const [avatar, setAvatar] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [homepage, setHomepage] = useState("");
  const [status, setStatus] = useState("");
  const [color, setColor] = useState("#800040");
  const [bot, setBot] = useState("");

  // Load existing metadata on mount
  useEffect(() => {
    if (currentUser?.metadata) {
      setAvatar(currentUser.metadata.avatar?.value || "");
      setDisplayName(currentUser.metadata["display-name"]?.value || "");
      setHomepage(currentUser.metadata.homepage?.value || "");
      setStatus(currentUser.metadata.status?.value || "");
      setColor(currentUser.metadata.color?.value || "#800040");
      setBot(currentUser.metadata.bot?.value || "");
    }
  }, [currentUser]);

  const handleSaveMetadata = (key: string, value: string) => {
    if (currentServer && currentUser) {
      metadataSet(
        currentServer.id,
        currentUser.username,
        key,
        value || undefined,
      );
    }
  };

  const handleSaveAll = () => {
    if (currentServer && currentUser) {
      // Handle display name
      if (supportsMetadata) {
        try {
          metadataSet(
            currentServer.id,
            currentUser.username,
            "display-name",
            displayName || undefined,
          );
        } catch (error) {
          console.error("Failed to set display name metadata:", error);
        }
      } else {
        // Fall back to NICK command for servers that don't support metadata
        try {
          sendRaw(currentServer.id, `NICK ${displayName}`);
        } catch (error) {
          console.error("Failed to send NICK command:", error);
        }
      }

      if (supportsMetadata) {
        const metadataUpdates = [
          { key: "avatar", value: avatar },
          { key: "homepage", value: homepage },
          { key: "status", value: status },
          { key: "color", value: color },
          { key: "bot", value: bot },
        ];

        metadataUpdates.forEach(({ key, value }) => {
          try {
            metadataSet(
              currentServer.id,
              currentUser.username,
              key,
              value || undefined,
            );
          } catch (error) {
            console.error(`Failed to set ${key} metadata:`, error);
          }
        });
      }
    }
    toggleUserProfileModal(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-discord-dark-200 rounded-lg w-full max-w-md p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white text-xl font-bold">User Settings</h2>
          <button
            onClick={() => toggleUserProfileModal(false)}
            className="text-discord-text-muted hover:text-white"
          >
            <FaTimes />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-discord-text-muted text-sm font-medium mb-1">
              Username
            </label>
            <input
              type="text"
              value={currentUser?.username || ""}
              readOnly
              className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-discord-text-muted text-sm font-medium mb-1">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Alternative display name"
              className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary"
            />
          </div>

          {supportsMetadata && (
            <>
              <div>
                <label className="block text-discord-text-muted text-sm font-medium mb-1">
                  Avatar URL
                </label>
                <input
                  type="url"
                  value={avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                  placeholder="https://example.com/avatar.jpg"
                  className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary"
                />
              </div>

              <div>
                <label className="block text-discord-text-muted text-sm font-medium mb-1">
                  Homepage URL
                </label>
                <input
                  type="url"
                  value={homepage}
                  onChange={(e) => setHomepage(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary"
                />
              </div>

              <div>
                <label className="block text-discord-text-muted text-sm font-medium mb-1">
                  Status
                </label>
                <input
                  type="text"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  placeholder="Working from home"
                  className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary"
                />
              </div>

              <div>
                <label className="block text-discord-text-muted text-sm font-medium mb-1">
                  Color
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-12 h-8 rounded border-none cursor-pointer"
                  />
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="#800040"
                    className="flex-1 bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-discord-text-muted text-sm font-medium mb-1">
                  Bot Software (if applicable)
                </label>
                <input
                  type="text"
                  value={bot}
                  onChange={(e) => setBot(e.target.value)}
                  placeholder="Bot software name"
                  className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary"
                />
              </div>
            </>
          )}

          {!supportsMetadata && (
            <div className="bg-discord-dark-400 rounded px-3 py-2 text-discord-text-muted text-sm">
              This server does not support user metadata. Metadata options will
              appear here when connecting to a server with draft/metadata
              support.
            </div>
          )}

          <div>
            <label className="block text-discord-text-muted text-sm font-medium mb-1">
              Status
            </label>
            <select
              className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none"
              defaultValue={currentUser?.status || "online"}
            >
              <option value="online">Online</option>
              <option value="idle">Idle</option>
              <option value="dnd">Do Not Disturb</option>
              <option value="invisible">Invisible</option>
            </select>
          </div>

          <div>
            <label className="block text-discord-text-muted text-sm font-medium mb-1">
              Email (Read-Only)
            </label>
            <input
              type="email"
              value="user@example.com"
              readOnly
              className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end mt-6 space-x-3">
          <button
            onClick={() => toggleUserProfileModal(false)}
            className="px-4 py-2 bg-discord-dark-400 text-discord-text-normal rounded font-medium hover:bg-discord-dark-300"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveAll}
            disabled={!currentServer}
            className="px-4 py-2 bg-discord-primary text-white rounded font-medium hover:bg-opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {currentServer
              ? supportsMetadata
                ? "Save Changes"
                : "Save Display Name"
              : "No Server Selected"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserSettings;
