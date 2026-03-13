import type React from "react";

interface DateSeparatorProps {
  date: Date;
  theme: string;
}

export const DateSeparator: React.FC<DateSeparatorProps> = ({
  date,
  theme,
}) => {
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(date);
  };

  return (
    <div
      className={`flex items-center text-xs text-${theme}-text-muted mb-2 select-none`}
    >
      <div className={`flex-grow border-t border-${theme}-dark-400`} />
      <div className="px-2">{formatDate(date)}</div>
      <div className={`flex-grow border-t border-${theme}-dark-400`} />
    </div>
  );
};
