import { useCallback, useEffect, useRef, useState } from "react";

export interface UseModalOptions {
  defaultOpen?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  closeOnRouteChange?: boolean;
}

export interface UseModalReturn {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setIsOpen: (open: boolean) => void;
}

/**
 * Hook for managing modal state with callbacks and automatic cleanup
 */
export const useModal = (options: UseModalOptions = {}): UseModalReturn => {
  const {
    defaultOpen = false,
    onOpen,
    onClose,
    closeOnRouteChange = true,
  } = options;

  const [isOpen, setIsOpen] = useState(defaultOpen);
  const isMountedRef = useRef(true);

  const open = useCallback(() => {
    if (!isMountedRef.current) return;
    setIsOpen(true);
    onOpen?.();
  }, [onOpen]);

  const close = useCallback(() => {
    if (!isMountedRef.current) return;
    setIsOpen(false);
    onClose?.();
  }, [onClose]);

  const toggle = useCallback(() => {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }, [isOpen, open, close]);

  const setIsOpenWrapped = useCallback(
    (shouldOpen: boolean) => {
      shouldOpen ? open() : close();
    },
    [open, close],
  );

  // Close modal on route change if enabled
  useEffect(() => {
    if (!closeOnRouteChange || !isOpen) return;

    const handleRouteChange = () => {
      close();
    };

    // Listen for popstate (browser back/forward)
    window.addEventListener("popstate", handleRouteChange);

    return () => {
      window.removeEventListener("popstate", handleRouteChange);
    };
  }, [closeOnRouteChange, isOpen, close]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    isOpen,
    open,
    close,
    toggle,
    setIsOpen: setIsOpenWrapped,
  };
};

/**
 * Hook for managing multiple modals with unique keys
 */
export const useModals = () => {
  const [openModals, setOpenModals] = useState<Set<string>>(new Set());

  const isOpen = useCallback(
    (key: string) => {
      return openModals.has(key);
    },
    [openModals],
  );

  const open = useCallback((key: string) => {
    setOpenModals((prev) => new Set(prev).add(key));
  }, []);

  const close = useCallback((key: string) => {
    setOpenModals((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const toggle = useCallback(
    (key: string) => {
      if (isOpen(key)) {
        close(key);
      } else {
        open(key);
      }
    },
    [isOpen, open, close],
  );

  const closeAll = useCallback(() => {
    setOpenModals(new Set());
  }, []);

  return {
    isOpen,
    open,
    close,
    toggle,
    closeAll,
    openModals: Array.from(openModals),
  };
};

export default useModal;
