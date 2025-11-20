import { XMarkIcon } from "@heroicons/react/24/solid";
import type React from "react";
import { useState } from "react";
import type { SettingComponentProps } from "../../../lib/settings/types";

/**
 * Custom component for managing custom mentions list
 */
export const CustomMentionsField: React.FC<SettingComponentProps> = ({
  value,
  onChange,
  disabled,
}) => {
  const [newMention, setNewMention] = useState("");
  const mentions = (value as string[]) || [];

  const handleAddMention = () => {
    if (newMention.trim() && !mentions.includes(newMention.trim())) {
      onChange([...mentions, newMention.trim()]);
      setNewMention("");
    }
  };

  const handleRemoveMention = (mention: string) => {
    onChange(mentions.filter((m) => m !== mention));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddMention();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex space-x-2">
        <input
          type="text"
          value={newMention}
          onChange={(e) => setNewMention(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={disabled}
          placeholder="Add a word or phrase..."
          className="flex-1 rounded border border-discord-button-secondary-default bg-discord-input-bg px-3 py-2 text-discord-text-normal placeholder-discord-text-muted focus:border-discord-text-link focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleAddMention}
          disabled={disabled || !newMention.trim()}
          className="rounded bg-discord-button-success-default px-4 py-2 text-white hover:bg-discord-button-success-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>
      {mentions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {mentions.map((mention) => (
            <span
              key={mention}
              className="inline-flex items-center rounded-full bg-discord-mention-bg px-3 py-1 text-sm text-discord-mention-color"
            >
              {mention}
              <button
                type="button"
                onClick={() => handleRemoveMention(mention)}
                disabled={disabled}
                className="ml-2 text-discord-text-muted hover:text-discord-text-normal disabled:opacity-50"
              >
                <XMarkIcon className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default CustomMentionsField;
