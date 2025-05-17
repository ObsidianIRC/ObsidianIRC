import { useState } from "react";
import useStore from "../../store";

const servers = [
  {
    name: "h4ks.com",
    description: "A cool place for tech talk, randomness and nerding.",
    server: "irc.h4ks.com",
    port: "8097", // websocket port
  },
  {
    name: "UnrealIRCd Support",
    description:
      "Get help with UnrealIRCd configuration, installation and usage.",
    server: "irc.unrealircd.org",
    port: "443",
  },
];

const DiscoverGrid = () => {
  const { toggleAddServerModal, connect, isConnecting, connectionError } =
    useStore();
  const [query, setQuery] = useState("");

  const filteredServers = servers.filter(
    (server) =>
      server.name.toLowerCase().includes(query.toLowerCase()) ||
      server.description.toLowerCase().includes(query.toLowerCase()),
  );

  const handleServerClick = (server: Record<string, string>) => {
    toggleAddServerModal(true, {
      name: server.name,
      host: server.server || "", // Use empty string if server is undefined
      port: server.port || "443", // Default to 443 if port is undefined
      nickname: "", // Generate a default nickname
    });
  };

  return (
    <div className="h-screen flex flex-col bg-discord-dark-400 text-white">
      <div className="sticky top-0 z-10 bg-discord-dark-300 border-b border-discord-dark-500 p-4">
        <h1 className="text-2xl font-bold mb-2">
          Discover the world with ObsidianIRC
        </h1>
        <input
          placeholder="Search servers..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full p-2 rounded-md bg-discord-dark-500 text-white placeholder-discord-text-muted focus:outline-none focus:ring-2 focus:ring-discord-dark-100 transition"
        />
      </div>

      <div className="overflow-y-auto p-4">
        {filteredServers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredServers.map((server) => (
              <div
                key={server.name} // Use a unique identifier as the key
                className="bg-discord-dark-300 border border-discord-dark-500 rounded-lg p-4 shadow hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => handleServerClick(server)} // Add click handler
              >
                <h2 className="text-lg font-semibold">{server.name}</h2>
                <p className="text-sm text-discord-text-muted">
                  {server.description}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-discord-text-muted">No servers found.</p>
        )}
      </div>
    </div>
  );
};

export default DiscoverGrid;
