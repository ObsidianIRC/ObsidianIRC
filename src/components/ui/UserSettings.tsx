import React from 'react';
import { FaTimes } from 'react-icons/fa';
import useStore from '../../store';

const UserSettings: React.FC = () => {
  const { toggleUserProfileModal, currentUser } = useStore();

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
              value={currentUser?.username || ''}
              readOnly
              className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-discord-text-muted text-sm font-medium mb-1">
              Status
            </label>
            <select
              className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none"
              defaultValue={currentUser?.status || 'online'}
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

        <div className="flex justify-end mt-6">
          <button
            onClick={() => toggleUserProfileModal(false)}
            className="px-4 py-2 bg-discord-primary text-white rounded font-medium hover:bg-opacity-80"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserSettings;