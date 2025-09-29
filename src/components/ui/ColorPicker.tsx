import type React from "react";
import { FaTimes } from "react-icons/fa";
import { ircColors } from "../../lib/ircUtils";
import type { FormattingType } from "../../lib/messageFormatter";

const ColorPicker: React.FC<{
  onSelect: (color: string, formatting: FormattingType[]) => void;
  onClose: () => void;
  selectedColor: string | null;
  selectedFormatting: FormattingType[];
  toggleFormatting: (format: FormattingType) => void;
}> = ({
  onSelect,
  onClose,
  selectedColor,
  selectedFormatting,
  toggleFormatting,
}) => {
  return (
    <div className="absolute bottom-16 right-4 z-50 bg-discord-dark-300 p-4 rounded shadow-lg">
      {/* Color Options */}
      <div className="grid grid-cols-8 gap-2 mb-4">
        {ircColors.map((color, index) => {
          const isSelected = selectedColor === color;

          // There are duplicate colors due to things like 98 being the same as white (00)
          const keyToken = `${color}-${index}-${Math.floor(Math.random() * 9999)}`;
          return (
            <button
              key={keyToken}
              className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
                isSelected
                  ? "border-purple-500 shadow-md shadow-purple-500"
                  : "border-gray-700"
              }`}
              style={{
                backgroundColor: color === "inherit" ? "transparent" : color,
              }}
              onClick={() => onSelect(color, selectedFormatting)}
            >
              {color === "inherit" && (
                <span className="text-xs text-purple-500 font-bold">
                  <FaTimes />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Formatting Options */}
      <div className="grid grid-cols-6 gap-2">
        <button
          className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
            selectedFormatting.includes("bold")
              ? "bg-discord-dark-200 text-white border-purple-500"
              : "bg-discord-dark-400 text-discord-text-muted hover:bg-discord-dark-300 border-gray-700"
          }`}
          onClick={() => toggleFormatting("bold")}
        >
          <span className="font-bold">B</span>
        </button>
        <button
          className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
            selectedFormatting.includes("italic")
              ? "bg-discord-dark-200 text-white border-purple-500"
              : "bg-discord-dark-400 text-discord-text-muted hover:bg-discord-dark-300 border-gray-700"
          }`}
          onClick={() => toggleFormatting("italic")}
        >
          <span className="italic">I</span>
        </button>
        <button
          className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
            selectedFormatting.includes("underline")
              ? "bg-discord-dark-200 text-white border-purple-500"
              : "bg-discord-dark-400 text-discord-text-muted hover:bg-discord-dark-300 border-gray-700"
          }`}
          onClick={() => toggleFormatting("underline")}
        >
          <span className="underline">U</span>
        </button>
        <button
          className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
            selectedFormatting.includes("strikethrough")
              ? "bg-discord-dark-200 text-white border-purple-500"
              : "bg-discord-dark-400 text-discord-text-muted hover:bg-discord-dark-300 border-gray-700"
          }`}
          onClick={() => toggleFormatting("strikethrough")}
        >
          <span className="line-through">S</span>
        </button>
        <button
          className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
            selectedFormatting.includes("monospace")
              ? "bg-discord-dark-200 text-white border-purple-500"
              : "bg-discord-dark-400 text-discord-text-muted hover:bg-discord-dark-300 border-gray-700"
          }`}
          onClick={() => toggleFormatting("monospace")}
        >
          <span className="font-mono text-xs">M</span>
        </button>
      </div>

      <button
        onClick={onClose}
        className="w-full mt-2 bg-discord-primary text-white py-2 rounded font-medium hover:bg-opacity-80 transition-opacity"
      >
        Close
      </button>
    </div>
  );
};

export default ColorPicker;
