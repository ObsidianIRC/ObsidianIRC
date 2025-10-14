import type React from "react";
import { useRef, useState } from "react";
import { FaSpinner, FaTimes, FaUpload } from "react-icons/fa";
import ircClient from "../../lib/ircClient";
import useStore from "../../store";

interface AvatarUploadProps {
  currentAvatarUrl?: string;
  onAvatarUrlChange: (url: string) => void;
  serverId: string;
  channelName?: string; // For channel avatars
  className?: string;
}

const AvatarUpload: React.FC<AvatarUploadProps> = ({
  currentAvatarUrl,
  onAvatarUrlChange,
  serverId,
  channelName,
  className = "",
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { servers } = useStore();

  const server = servers.find((s) => s.id === serverId);
  const filehostUrl = server?.filehost;

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setUploadError("Please select an image file");
      return;
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("File size must be less than 5MB");
      return;
    }

    setUploadError(null);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Start upload
    uploadAvatar(file);
  };

  const uploadAvatar = async (file: File) => {
    if (!filehostUrl || !serverId) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      // Clear any existing JWT token to ensure we get a fresh one
      useStore.setState((state) => ({
        servers: state.servers.map((server) =>
          server.id === serverId ? { ...server, jwtToken: undefined } : server
        ),
      }));

      // Request a fresh JWT token with the correct target
      const target = channelName || "*";
      console.log(
        "🔑 Requesting fresh JWT token for avatar upload, target:",
        target,
      );
      ircClient.requestExtJwt(serverId, target, "filehost");

      // Wait for token
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const updatedServer = useStore
        .getState()
        .servers.find((s) => s.id === serverId);
      const jwtToken = updatedServer?.jwtToken;

      if (!jwtToken) {
        throw new Error("Failed to obtain JWT token for avatar upload");
      }

      const formData = new FormData();
      formData.append("image", file);

      // Determine upload endpoint
      const endpoint = channelName
        ? `/upload/avatar/channel/${encodeURIComponent(channelName)}`
        : "/upload/avatar/user";

      const uploadUrl = `${filehostUrl}${endpoint}`;

      console.log("🔄 Avatar upload: Starting upload to", uploadUrl);

      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(
          `Upload failed: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      console.log("📡 Avatar upload response:", data);

      if (data.saved_url) {
        const fullUrl = `${filehostUrl}${data.saved_url}`;
        onAvatarUrlChange(fullUrl);
        setPreviewUrl(null); // Clear preview since we have the uploaded URL
      } else {
        throw new Error("Invalid response: no saved_url");
      }
    } catch (error) {
      console.error("Avatar upload error:", error);
      setUploadError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const clearPreview = () => {
    setPreviewUrl(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  if (!filehostUrl) {
    // Fallback to URL input if no filehost
    return (
      <input
        type="url"
        value={currentAvatarUrl || ""}
        onChange={(e) => onAvatarUrlChange(e.target.value)}
        placeholder="https://example.com/avatar.jpg"
        className={`w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary ${className}`}
      />
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleUploadClick}
          disabled={isUploading}
          className="flex items-center gap-2 px-3 py-2 bg-discord-primary hover:bg-discord-primary-hover text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isUploading ? <FaSpinner className="animate-spin" /> : <FaUpload />}
          {isUploading ? "Uploading..." : "Upload Avatar"}
        </button>

        {(previewUrl || currentAvatarUrl) && (
          <button
            type="button"
            onClick={clearPreview}
            className="flex items-center gap-2 px-3 py-2 bg-discord-dark-300 hover:bg-discord-dark-200 text-white rounded"
          >
            <FaTimes />
            Clear
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {uploadError && <p className="text-red-400 text-sm">{uploadError}</p>}

      {(previewUrl || currentAvatarUrl) && (
        <div className="flex items-center gap-3">
          <img
            src={previewUrl || currentAvatarUrl}
            alt="Avatar preview"
            className="w-16 h-16 rounded-full object-cover border-2 border-discord-dark-300"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <div className="text-sm text-discord-text-muted">
            {previewUrl ? "Preview (not yet uploaded)" : "Current avatar"}
          </div>
        </div>
      )}
    </div>
  );
};

export default AvatarUpload;
