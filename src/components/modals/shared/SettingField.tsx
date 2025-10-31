import type React from "react";

/**
 * Shared SettingField component used in modal settings interfaces
 * Provides consistent layout for settings with label, description, and input control
 */
export interface SettingFieldProps {
  label: string;
  description: string;
  children: React.ReactNode;
}

export const SettingField: React.FC<SettingFieldProps> = ({
  label,
  description,
  children,
}) => (
  <div className="space-y-2">
    <div>
      <label className="block text-discord-text-normal text-sm font-medium">
        {label}
      </label>
      <p className="text-discord-text-muted text-xs">{description}</p>
    </div>
    {children}
  </div>
);
