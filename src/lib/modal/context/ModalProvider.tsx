import type React from "react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";

export type ModalType =
  | "settings"
  | "quickActions"
  | "serverSettings"
  | "channelSettings"
  | "userProfile"
  | "search"
  | "confirmation"
  | "custom";

export interface ModalState {
  type: ModalType;
  props?: unknown;
  isOpen: boolean;
}

export interface ModalContextValue {
  // Current modal state
  currentModal: ModalState | null;
  modalStack: ModalState[];

  // Modal operations
  openModal: (type: ModalType, props?: unknown) => void;
  closeModal: (type?: ModalType) => void;
  closeAllModals: () => void;
  replaceModal: (type: ModalType, props?: unknown) => void;

  // Stack operations
  pushModal: (type: ModalType, props?: unknown) => void;
  popModal: () => void;

  // State checks
  isModalOpen: (type?: ModalType) => boolean;
  getModalProps: (type: ModalType) => unknown;

  // Global modal settings
  setModalSettings: (settings: Partial<ModalSettings>) => void;
  modalSettings: ModalSettings;
}

export interface ModalSettings {
  closeOnEsc: boolean;
  closeOnClickOutside: boolean;
  showOverlay: boolean;
  animate: boolean;
  stackModals: boolean;
  maxStackSize: number;
}

const defaultModalSettings: ModalSettings = {
  closeOnEsc: true,
  closeOnClickOutside: true,
  showOverlay: true,
  animate: true,
  stackModals: false,
  maxStackSize: 3,
};

const ModalContext = createContext<ModalContextValue | undefined>(undefined);

export interface ModalProviderProps {
  children: ReactNode;
  settings?: Partial<ModalSettings>;
}

export const ModalProvider: React.FC<ModalProviderProps> = ({
  children,
  settings = {},
}) => {
  const [modalStack, setModalStack] = useState<ModalState[]>([]);
  const [modalSettings, setModalSettingsState] = useState<ModalSettings>({
    ...defaultModalSettings,
    ...settings,
  });

  const currentModal = modalStack[modalStack.length - 1] || null;

  const openModal = useCallback(
    (type: ModalType, props?: unknown) => {
      const newModal: ModalState = { type, props, isOpen: true };

      setModalStack((prev) => {
        if (!modalSettings.stackModals) {
          // Replace current modal
          return [newModal];
        }

        // Stack modal
        if (prev.length >= modalSettings.maxStackSize) {
          // Remove oldest modal if stack is full
          return [...prev.slice(1), newModal];
        }

        return [...prev, newModal];
      });
    },
    [modalSettings.stackModals, modalSettings.maxStackSize],
  );

  const closeModal = useCallback((type?: ModalType) => {
    setModalStack((prev) => {
      if (!type) {
        // Close the topmost modal
        return prev.slice(0, -1);
      }

      // Close specific modal type
      return prev.filter((modal) => modal.type !== type);
    });
  }, []);

  const closeAllModals = useCallback(() => {
    setModalStack([]);
  }, []);

  const replaceModal = useCallback((type: ModalType, props?: unknown) => {
    const newModal: ModalState = { type, props, isOpen: true };
    setModalStack((prev) => {
      if (prev.length === 0) {
        return [newModal];
      }
      return [...prev.slice(0, -1), newModal];
    });
  }, []);

  const pushModal = useCallback(
    (type: ModalType, props?: unknown) => {
      const newModal: ModalState = { type, props, isOpen: true };
      setModalStack((prev) => {
        if (prev.length >= modalSettings.maxStackSize) {
          return [...prev.slice(1), newModal];
        }
        return [...prev, newModal];
      });
    },
    [modalSettings.maxStackSize],
  );

  const popModal = useCallback(() => {
    setModalStack((prev) => prev.slice(0, -1));
  }, []);

  const isModalOpen = useCallback(
    (type?: ModalType): boolean => {
      if (!type) {
        return modalStack.length > 0;
      }
      return modalStack.some((modal) => modal.type === type);
    },
    [modalStack],
  );

  const getModalProps = useCallback(
    (type: ModalType): unknown => {
      const modal = modalStack.find((m) => m.type === type);
      return modal?.props;
    },
    [modalStack],
  );

  const setModalSettings = useCallback((settings: Partial<ModalSettings>) => {
    setModalSettingsState((prev) => ({
      ...prev,
      ...settings,
    }));
  }, []);

  const value: ModalContextValue = {
    currentModal,
    modalStack,
    openModal,
    closeModal,
    closeAllModals,
    replaceModal,
    pushModal,
    popModal,
    isModalOpen,
    getModalProps,
    setModalSettings,
    modalSettings,
  };

  return (
    <ModalContext.Provider value={value}>{children}</ModalContext.Provider>
  );
};

/**
 * Hook to use modal context
 */
export const useModalContext = (): ModalContextValue => {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error("useModalContext must be used within a ModalProvider");
  }
  return context;
};

/**
 * Hook for specific modal type
 */
export const useModalForType = (type: ModalType) => {
  const context = useModalContext();

  return {
    isOpen: context.isModalOpen(type),
    open: (props?: unknown) => context.openModal(type, props),
    close: () => context.closeModal(type),
    replace: (props?: unknown) => context.replaceModal(type, props),
    props: context.getModalProps(type),
  };
};

export default ModalProvider;
