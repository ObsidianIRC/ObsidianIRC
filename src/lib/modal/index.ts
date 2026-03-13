/**
 * Modal Library - Main exports
 */

export type { BaseModalProps } from "./BaseModal";
// Components
export { BaseModal } from "./BaseModal";
export type {
  ModalContextValue,
  ModalProviderProps,
  ModalSettings,
  ModalState,
  ModalType,
} from "./context/ModalProvider";
// Context
export {
  ModalProvider,
  useModalContext,
  useModalForType,
} from "./context/ModalProvider";
export type {
  UseKeyboardNavigationOptions,
  UseKeyboardNavigationReturn,
} from "./hooks/useKeyboardNavigation";
export {
  useCommandShortcut,
  useKeyboardNavigation,
} from "./hooks/useKeyboardNavigation";
export type {
  UseModalOptions,
  UseModalReturn,
} from "./hooks/useModal";
// Hooks
export {
  useModal,
  useModals,
} from "./hooks/useModal";
export type { SearchableItem, SearchableModalProps } from "./SearchableModal";
export { SearchableModal } from "./SearchableModal";
export type { FocusTrapOptions } from "./utils/focusTrap";
// Utils
export {
  FocusTrap,
  getFocusableElements,
  useFocusTrap,
} from "./utils/focusTrap";
