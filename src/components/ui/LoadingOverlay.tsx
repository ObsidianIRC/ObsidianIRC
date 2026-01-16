import type React from "react";
import LoadingSpinner from "./LoadingSpinner";

export const LoadingOverlay: React.FC = () => {
  return (
    <div className="fixed inset-0 z-[100001] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <LoadingSpinner size="lg" text="" />
    </div>
  );
};

export default LoadingOverlay;
