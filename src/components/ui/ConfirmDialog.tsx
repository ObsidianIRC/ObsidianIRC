import { Trans, useLingui } from "@lingui/react/macro";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { FaExclamationTriangle } from "react-icons/fa";
import BaseModal from "../../lib/modal/BaseModal";
import { Button, ModalBody, ModalFooter } from "../../lib/modal/components";

export interface ConfirmOptions {
  /** Title shown in the modal header. Defaults to "Are you sure?". */
  title?: ReactNode;
  /** Body text. Required. */
  message: ReactNode;
  /** Label for the primary (confirm) button. */
  confirmLabel?: ReactNode;
  /** Label for the secondary (cancel) button. */
  cancelLabel?: ReactNode;
  /** Style the confirm button as destructive (red). */
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Imperative confirmation hook. Replaces window.confirm() with a styled
 * in-app modal that works across the platforms ObsidianIRC ships on
 * (Tauri webview, browser, mobile).
 *
 * Usage:
 *   const confirm = useConfirm();
 *   if (await confirm({ message: "Delete this?", danger: true })) {
 *     // ... user said yes
 *   }
 *
 * Requires a <ConfirmProvider> mounted higher in the tree (we mount
 * one at the app root in main.tsx).
 */
export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (fn) return fn;
  // Fallback when no provider is mounted (e.g. unit tests rendering a
  // component in isolation).  Defer to the native confirm so behaviour
  // stays predictable without forcing every test to wrap with the
  // provider.  Production paths always have the provider mounted at
  // the app root in main.tsx.
  return ({ message }) =>
    Promise.resolve(
      typeof window !== "undefined" && typeof window.confirm === "function"
        ? window.confirm(typeof message === "string" ? message : "")
        : true,
    );
}

interface ProviderProps {
  children: ReactNode;
}

export function ConfirmProvider({ children }: ProviderProps) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        // If a previous prompt is still open (shouldn't happen often)
        // resolve it as false so the new one supersedes it cleanly.
        if (resolver.current) {
          resolver.current(false);
        }
        resolver.current = resolve;
        setOpts(options);
      }),
    [],
  );

  const settle = (result: boolean) => {
    const r = resolver.current;
    resolver.current = null;
    setOpts(null);
    r?.(result);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        opts={opts}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmContext.Provider>
  );
}

interface DialogProps {
  opts: ConfirmOptions | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<DialogProps> = ({
  opts,
  onConfirm,
  onCancel,
}) => {
  const { t } = useLingui();
  const isOpen = opts !== null;
  const title = opts?.title ?? t`Are you sure?`;
  const danger = opts?.danger ?? false;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onCancel}
      title={
        danger ? (
          <div className="flex items-center gap-3">
            <FaExclamationTriangle className="text-yellow-500 text-xl flex-shrink-0" />
            <span>{title}</span>
          </div>
        ) : (
          title
        )
      }
      maxWidth="md"
    >
      <ModalBody>
        <div className="text-discord-text-normal whitespace-pre-line">
          {opts?.message}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onCancel}>
          {opts?.cancelLabel ?? <Trans>Cancel</Trans>}
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
          {opts?.confirmLabel ?? <Trans>Confirm</Trans>}
        </Button>
      </ModalFooter>
    </BaseModal>
  );
};

export default ConfirmProvider;
