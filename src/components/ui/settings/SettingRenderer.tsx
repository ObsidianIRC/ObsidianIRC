import type React from "react";
import { useCallback } from "react";
import type {
  SettingDefinition,
  SettingValue,
} from "../../../lib/settings/types";

export interface SettingRendererProps {
  setting: SettingDefinition;
  value: SettingValue;
  onChange: (value: SettingValue) => void;
  error?: string;
  disabled?: boolean;
  isHighlighted?: boolean;
}

/**
 * Renders a setting field based on its type definition
 */
export const SettingRenderer: React.FC<SettingRendererProps> = ({
  setting,
  value,
  onChange,
  error,
  disabled = false,
  isHighlighted = false,
}) => {
  const handleChange = useCallback(
    (newValue: SettingValue) => {
      onChange(newValue);
    },
    [onChange],
  );

  // Render custom component if specified
  if (setting.customComponent) {
    const CustomComponent = setting.customComponent;
    return (
      <CustomComponent
        setting={setting}
        value={value}
        onChange={handleChange}
        error={error}
        disabled={disabled}
      />
    );
  }

  // Render based on type
  switch (setting.type) {
    case "toggle":
      return (
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={value as boolean}
            onChange={(e) => handleChange(e.target.checked)}
            disabled={disabled}
            className="mr-3 accent-discord-primary disabled:opacity-50"
          />
          <span className="text-discord-text-normal">{setting.title}</span>
        </label>
      );

    case "text":
      return (
        <input
          type="text"
          value={value as string}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={setting.placeholder}
          disabled={disabled}
          className={`w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary disabled:opacity-50 ${
            error ? "border-2 border-red-500" : ""
          }`}
        />
      );

    case "number":
      return (
        <input
          type="number"
          value={value as number}
          onChange={(e) => handleChange(Number(e.target.value))}
          placeholder={setting.placeholder}
          min={setting.min}
          max={setting.max}
          step={setting.step}
          disabled={disabled}
          className={`w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary disabled:opacity-50 ${
            error ? "border-2 border-red-500" : ""
          }`}
        />
      );

    case "textarea":
      return (
        <textarea
          value={value as string}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={setting.placeholder}
          disabled={disabled}
          rows={4}
          className={`w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary disabled:opacity-50 ${
            error ? "border-2 border-red-500" : ""
          }`}
        />
      );

    case "select":
      return (
        <select
          value={value as string}
          onChange={(e) => handleChange(e.target.value)}
          disabled={disabled}
          className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary disabled:opacity-50"
        >
          {setting.options?.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>
      );

    case "radio":
      return (
        <div className="space-y-2">
          {setting.options?.map((option) => (
            <label
              key={option.value}
              className="flex items-center cursor-pointer"
            >
              <input
                type="radio"
                value={option.value}
                checked={value === option.value}
                onChange={() => handleChange(option.value)}
                disabled={disabled || option.disabled}
                className="mr-3 accent-discord-primary disabled:opacity-50"
              />
              <div>
                <div className="text-discord-text-normal">{option.label}</div>
                {option.description && (
                  <div className="text-sm text-discord-text-muted">
                    {option.description}
                  </div>
                )}
              </div>
            </label>
          ))}
        </div>
      );

    case "color":
      return (
        <div className="flex items-center space-x-2">
          <input
            type="color"
            value={value as string}
            onChange={(e) => handleChange(e.target.value)}
            disabled={disabled}
            className="w-12 h-8 rounded border-none cursor-pointer disabled:opacity-50"
          />
          <input
            type="text"
            value={value as string}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={setting.placeholder || "#000000"}
            disabled={disabled}
            className="flex-1 bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary disabled:opacity-50"
          />
        </div>
      );

    case "range":
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <input
              type="range"
              value={value as number}
              onChange={(e) => handleChange(Number(e.target.value))}
              min={setting.min}
              max={setting.max}
              step={setting.step}
              disabled={disabled}
              className="flex-1 accent-discord-primary disabled:opacity-50"
            />
            <span className="ml-4 text-discord-text-normal font-medium">
              {String(value)}
              {setting.unit || ""}
            </span>
          </div>
        </div>
      );

    case "file":
      return (
        <input
          type="file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = () => handleChange(reader.result as string);
              reader.readAsDataURL(file);
            }
          }}
          accept={setting.accept}
          multiple={setting.multiple}
          disabled={disabled}
          className="w-full text-discord-text-normal file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-discord-primary file:text-white hover:file:bg-discord-primary-hover disabled:opacity-50"
        />
      );

    case "custom":
      return (
        <div className="text-discord-text-muted text-sm">
          Custom renderer not implemented for {setting.id}
        </div>
      );

    default:
      return (
        <div className="text-red-400 text-sm">
          Unknown setting type: {setting.type}
        </div>
      );
  }
};

/**
 * Wrapper component for a setting with label and description
 */
export const SettingField: React.FC<{
  setting: SettingDefinition;
  value: SettingValue;
  onChange: (value: SettingValue) => void;
  error?: string;
  disabled?: boolean;
  isHighlighted?: boolean;
  showLabel?: boolean;
}> = ({
  setting,
  value,
  onChange,
  error,
  disabled,
  isHighlighted,
  showLabel = true,
}) => {
  return (
    <div
      id={`setting-${setting.id}`}
      className={`space-y-2 p-4 rounded-lg transition-all duration-300 ${
        isHighlighted ? "bg-yellow-400/20 ring-2 ring-yellow-400" : ""
      }`}
      style={
        isHighlighted
          ? {
              animation: "blink 0.5s ease-in-out 1",
            }
          : undefined
      }
    >
      {showLabel && (
        <div>
          <label className="block text-discord-text-normal text-sm font-medium">
            {setting.title}
          </label>
          {setting.description && (
            <p className="text-discord-text-muted text-xs mt-1">
              {setting.description}
            </p>
          )}
          {setting.tooltip && (
            <p className="text-discord-text-muted text-xs italic mt-1">
              💡 {setting.tooltip}
            </p>
          )}
        </div>
      )}
      <SettingRenderer
        setting={setting}
        value={value}
        onChange={onChange}
        error={error}
        disabled={disabled}
        isHighlighted={isHighlighted}
      />
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
};

export default SettingRenderer;
