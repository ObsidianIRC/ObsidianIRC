import type { ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "success";

interface ButtonProps {
  variant?: ButtonVariant;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit" | "reset";
}

const variantStyles = {
  primary: "bg-discord-primary hover:bg-opacity-80 text-white",
  secondary:
    "bg-discord-dark-400 hover:bg-discord-dark-500 text-discord-text-normal",
  danger: "bg-discord-red hover:bg-opacity-80 text-white",
  success: "bg-discord-green hover:bg-opacity-80 text-white",
};

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  children,
  onClick,
  disabled = false,
  className = "",
  type = "button",
}) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className={`px-4 py-2 rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantStyles[variant]} ${className}`}
  >
    {children}
  </button>
);
