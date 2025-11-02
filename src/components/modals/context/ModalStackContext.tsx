import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

interface ModalInfo {
  id: string;
  preventClose: boolean;
  zIndex: number;
}

interface ModalStackContextValue {
  registerModal: (id: string, preventClose: boolean) => number;
  unregisterModal: (id: string) => void;
  isTopmost: (id: string) => boolean;
  canModalClose: (id: string) => boolean;
  getModalZIndex: (id: string) => number;
  getStackSize: () => number;
}

const ModalStackContext = createContext<ModalStackContextValue | null>(null);

export function ModalStackProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [modalStack, setModalStack] = useState<ModalInfo[]>([]);
  const stackRef = useRef<ModalInfo[]>([]);

  // Keep ref in sync with state for immediate access
  useEffect(() => {
    stackRef.current = modalStack;
  }, [modalStack]);

  const registerModal = useCallback(
    (id: string, preventClose: boolean): number => {
      let zIndex = 50;

      setModalStack((prev) => {
        // Check if already registered
        if (prev.some((m) => m.id === id)) {
          return prev;
        }

        // Calculate z-index
        zIndex = 50 + prev.length * 10;

        const newStack = [...prev, { id, preventClose, zIndex }];
        return newStack;
      });

      return zIndex;
    },
    [],
  );

  const unregisterModal = useCallback((id: string) => {
    setModalStack((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const isTopmost = useCallback((id: string): boolean => {
    const stack = stackRef.current;
    if (stack.length === 0) return false;
    return stack[stack.length - 1].id === id;
  }, []);

  const canModalClose = useCallback((id: string): boolean => {
    const stack = stackRef.current;
    const modalIndex = stack.findIndex((m) => m.id === id);

    if (modalIndex === -1) return false;

    // Modal can close if:
    // 1. It's the topmost modal
    // 2. No modals above it are blocking
    const isTop = modalIndex === stack.length - 1;

    return isTop;
  }, []);

  const getModalZIndex = useCallback((id: string): number => {
    const stack = stackRef.current;
    const modal = stack.find((m) => m.id === id);
    return modal?.zIndex ?? 50;
  }, []);

  const getStackSize = useCallback((): number => {
    return stackRef.current.length;
  }, []);

  return (
    <ModalStackContext.Provider
      value={{
        registerModal,
        unregisterModal,
        isTopmost,
        canModalClose,
        getModalZIndex,
        getStackSize,
      }}
    >
      {children}
    </ModalStackContext.Provider>
  );
}

// Fallback implementation for when no provider is available (e.g., in tests)
const fallbackContext: ModalStackContextValue = {
  registerModal: () => 50,
  unregisterModal: () => {},
  isTopmost: () => true,
  canModalClose: () => true,
  getModalZIndex: () => 50,
  getStackSize: () => 0,
};

export function useModalStackContext() {
  const context = useContext(ModalStackContext);

  // Provide fallback for testing - in production, the provider should always be present
  if (!context) {
    // If in development/production without provider, warn but provide fallback
    if (import.meta.env?.DEV) {
      console.warn(
        "useModalStackContext: No ModalStackProvider found, using fallback",
      );
    }
    return fallbackContext;
  }
  return context;
}
