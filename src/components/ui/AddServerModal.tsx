import type React from 'react';
import { useState } from 'react';
import { FaTimes } from 'react-icons/fa';
import useStore from '../../store';

export const AddServerModal: React.FC = () => {
  const {
    toggleAddServerModal,
    connect,
    isConnecting,
    connectionError
  } = useStore();

  const [serverName, setServerName] = useState('');
  const [serverHost, setServerHost] = useState('irc.example.com');
  const [serverPort, setServerPort] = useState('443');
  const [nickname, setNickname] = useState(`user${Math.floor(Math.random() * 1000)}`);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!serverName.trim()) {
      setError('Server name is required');
      return;
    }

    if (!serverHost.trim()) {
      setError('Server host is required');
      return;
    }

    if (!serverPort.trim() || Number.isNaN(Number.parseInt(serverPort))) {
      setError('Valid server port is required');
      return;
    }

    if (!nickname.trim()) {
      setError('Nickname is required');
      return;
    }

    try {
      await connect(serverHost, Number.parseInt(serverPort), nickname, password);
      toggleAddServerModal(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-discord-dark-200 rounded-lg w-full max-w-md p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white text-xl font-bold">Add IRC Server</h2>
          <button
            onClick={() => toggleAddServerModal(false)}
            className="text-discord-text-muted hover:text-white"
          >
            <FaTimes />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-discord-text-muted text-sm font-medium mb-1">
              Server Name
            </label>
            <input
              type="text"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="My IRC Server"
              className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-discord-primary"
            />
          </div>

          <div className="mb-4">
            <label className="block text-discord-text-muted text-sm font-medium mb-1">
              Server Host
            </label>
            <input
              type="text"
              value={serverHost}
              onChange={(e) => setServerHost(e.target.value)}
              placeholder="irc.example.com"
              className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-discord-primary"
            />
          </div>

          <div className="mb-4">
            <label className="block text-discord-text-muted text-sm font-medium mb-1">
              Server Port
            </label>
            <input
              type="text"
              value={serverPort}
              onChange={(e) => setServerPort(e.target.value)}
              placeholder="6667"
              className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-discord-primary"
            />
          </div>

          <div className="mb-4">
            <label className="block text-discord-text-muted text-sm font-medium mb-1">
              Nickname
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="YourNickname"
              className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-discord-primary"
            />
          </div>

          <div className="mb-6">
            <label className="block text-discord-text-muted text-sm font-medium mb-1">
              Password (Optional)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-discord-primary"
            />
          </div>

          {(error || connectionError) && (
            <div className="mb-4 text-discord-red text-sm">
              {error || connectionError}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => toggleAddServerModal(false)}
              className="mr-3 px-4 py-2 text-discord-text-normal hover:underline"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isConnecting}
              className={`px-4 py-2 bg-discord-primary text-white rounded font-medium ${isConnecting ? 'opacity-70 cursor-not-allowed' : 'hover:bg-opacity-80'}`}
            >
              {isConnecting ? 'Connecting...' : 'Connect'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddServerModal;
