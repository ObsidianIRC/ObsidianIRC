import type * as React from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FaTimes } from "react-icons/fa";

interface GifSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectGif: (gifUrl: string) => void;
}

type GifProvider = "giphy" | "tenor";

interface Gif {
  id: string;
  url: string;
  previewUrl: string;
  title: string;
}

interface GiphyGif {
  id: string;
  images: {
    original: { url: string };
    fixed_height_small: { url: string };
  };
  title?: string;
}

interface TenorGif {
  id: string;
  media_formats: {
    gif: { url: string };
    tinygif: { url: string };
  };
  title?: string;
}

const GifSelector: React.FC<GifSelectorProps> = ({
  isOpen,
  onClose,
  onSelectGif,
}) => {
  const [activeProvider, setActiveProvider] = useState<GifProvider>("giphy");
  const [searchQuery, setSearchQuery] = useState("");
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: We want to clear GIFs and search when switching providers
  useEffect(() => {
    setGifs([]);
    setSearchQuery("");
  }, [activeProvider]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    try {
      let apiUrl = "";
      let apiKey = "";

      if (activeProvider === "giphy") {
        // GIPHY API
        apiKey = import.meta.env.VITE_GIPHY_API_KEY || ""; // You'll need to set this
        apiUrl = `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(searchQuery)}&limit=20&rating=g`;
      } else {
        // Tenor API
        apiKey = import.meta.env.VITE_TENOR_API_KEY || ""; // You'll need to set this
        apiUrl = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(searchQuery)}&key=${apiKey}&limit=20&contentfilter=medium`;
      }

      if (!apiKey) {
        console.warn(
          `No API key set for ${activeProvider}. Please add VITE_${activeProvider.toUpperCase()}_API_KEY to your .env file and restart the application`,
        );
        throw new Error(`Missing API key for ${activeProvider}`);
      }

      const response = await fetch(apiUrl);
      const data = await response.json();

      if (!response.ok) {
        console.error(
          `GIF API error (${activeProvider}):`,
          response.status,
          data,
        );
        throw new Error(`API request failed: ${response.status}`);
      }

      console.log(`GIF API success (${activeProvider}):`, data);

      let fetchedGifs: Gif[] = [];

      if (activeProvider === "giphy" && data.data) {
        fetchedGifs = data.data.map((gif: GiphyGif) => ({
          id: gif.id,
          url: gif.images.original.url,
          previewUrl: gif.images.fixed_height_small.url,
          title: gif.title || "GIF",
        }));
      } else if (activeProvider === "tenor" && data.results) {
        fetchedGifs = data.results.map((gif: TenorGif) => ({
          id: gif.id,
          url: gif.media_formats.gif.url,
          previewUrl: gif.media_formats.tinygif.url,
          title: gif.title || "GIF",
        }));
      }

      setGifs(fetchedGifs);
    } catch (error) {
      console.error("Error searching GIFs:", error);
      // Fallback to mock data if API fails
      const mockGifs: Gif[] = [
        {
          id: "1",
          url: "https://media.giphy.com/media/example1/giphy.gif",
          previewUrl: "https://media.giphy.com/media/example1/giphy.gif",
          title: "Example GIF 1",
        },
        {
          id: "2",
          url: "https://media.giphy.com/media/example2/giphy.gif",
          previewUrl: "https://media.giphy.com/media/example2/giphy.gif",
          title: "Example GIF 2",
        },
      ];
      setGifs(mockGifs);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGifClick = (gif: Gif) => {
    onSelectGif(gif.url);
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-discord-dark-400 rounded-lg shadow-lg border border-discord-dark-300 max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-discord-dark-300 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Send a GIF</h2>
          <button
            onClick={onClose}
            className="text-discord-text-muted hover:text-white"
          >
            <FaTimes />
          </button>
        </div>

        {/* Provider Switcher */}
        <div className="p-4 border-b border-discord-dark-300">
          <div className="flex space-x-2">
            <button
              className={`px-4 py-2 rounded ${
                activeProvider === "giphy"
                  ? "bg-discord-blue text-white"
                  : "bg-discord-dark-200 text-discord-text-muted hover:text-white"
              }`}
              onClick={() => setActiveProvider("giphy")}
            >
              GIPHY
            </button>
            <button
              className={`px-4 py-2 rounded ${
                activeProvider === "tenor"
                  ? "bg-discord-blue text-white"
                  : "bg-discord-dark-200 text-discord-text-muted hover:text-white"
              }`}
              onClick={() => setActiveProvider("tenor")}
            >
              Tenor
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-discord-dark-300">
          <div className="flex space-x-2">
            <input
              type="text"
              placeholder="Search GIFs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1 px-3 py-2 bg-discord-dark-200 border border-discord-dark-300 rounded text-white placeholder-discord-text-muted focus:outline-none focus:border-discord-blue"
            />
            <button
              onClick={handleSearch}
              disabled={isLoading}
              className="px-4 py-2 bg-discord-blue text-white rounded hover:bg-discord-blue-hover disabled:opacity-50"
            >
              {isLoading ? "Searching..." : "Search"}
            </button>
          </div>
        </div>

        {/* GIF Grid */}
        <div className="p-4 max-h-96 overflow-y-auto">
          {gifs.length === 0 && !isLoading && (
            <div className="text-center text-discord-text-muted py-8">
              Search for GIFs to get started
            </div>
          )}
          {isLoading && (
            <div className="text-center text-discord-text-muted py-8">
              Loading GIFs...
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {gifs.map((gif) => (
              <div
                key={gif.id}
                className="cursor-pointer rounded-lg overflow-hidden hover:ring-2 hover:ring-discord-blue transition-all"
                onClick={() => handleGifClick(gif)}
              >
                <img
                  src={gif.previewUrl}
                  alt={gif.title}
                  className="w-full h-32 object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default GifSelector;
