import { useEffect, useState } from "react";
import { FaGithub } from "react-icons/fa";
import useStore from "../../store";

const DiscoverGrid = () => {
  const { toggleAddServerModal, connect, isConnecting, connectionError } =
    useStore();
  const [query, setQuery] = useState("");
  const [servers, setServers] = useState<
    { name: string; description: string; server?: string; port?: string }[]
  >([]);

  useEffect(() => {
    const fetchServers = async () => {
      try {
        const cachedData = localStorage.getItem("servers");
        const cachedTimestamp = localStorage.getItem("serversTimestamp");

        if (cachedData && cachedTimestamp) {
          const now = Date.now();
          const oneHour = 60 * 60 * 1000;
          if (now - Number.parseInt(cachedTimestamp, 10) < oneHour) {
            setServers(JSON.parse(cachedData));
            return;
          }
        }

        // Fetch new data if no valid cache exists
        const response = await fetch(
          "https://raw.githubusercontent.com/ObsidianIRC/server-list/refs/heads/main/servers.json",
        );
        if (!response.ok) {
          throw new Error("Failed to fetch servers");
        }
        const data = await response.json();
        setServers(data);

        // Save data and timestamp to localStorage
        localStorage.setItem("servers", JSON.stringify(data));
        localStorage.setItem("serversTimestamp", Date.now().toString());
      } catch (error) {
        console.error("Error fetching servers:", error);
      }
    };

    fetchServers();
  }, []); // Empty dependency array ensures this runs only once

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
    <div className="h-screen flex flex-col bg-discord-dark-200 text-white">
      <div className="sticky top-0 z-10 bg-discord-dark-300 border-b border-discord-dark-500 p-4">
        <h1 className="text-2xl font-bold mb-2">
          Discover the world of IRC with ObsidianIRC
        </h1>
        <input
          placeholder="Search servers..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full p-2 rounded-md bg-discord-dark-500 text-white placeholder-discord-text-muted focus:outline-none focus:ring-2 focus:ring-discord-dark-100 transition"
        />
      </div>

      <div className="overflow-y-auto ml-4 mr-4 mb-2">
        <div className="m-2 bg-discord-dark-100 border border-discord-dark-500 rounded-lg px-2 py-1 w-fit shadow hover:shadow-lg transition-shadow cursor-pointer">
          <a
            href="https://github.com/ObsidianIRC/server-list"
            target="_blank"
            rel="noreferrer"
            className="flex items-center space-x-2"
          >
            <small>
              <span className="inline-block pr-1">
                Want to see your server listed here? Contribute on GitHub
              </span>
              <FaGithub className="inline-block" />
            </small>
          </a>
        </div>
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
