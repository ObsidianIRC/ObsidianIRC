import { Trans, useLingui } from "@lingui/react/macro";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  FaExclamationCircle,
  FaLayerGroup,
  FaPencilAlt,
  FaPlus,
  FaTimes,
} from "react-icons/fa";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import useStore from "../../store";
import type { BouncerNetwork } from "../../types";
import { BouncerNetworkForm } from "./BouncerNetworkForm";

interface BouncerNetworksModalProps {
  bouncerServerId: string;
  onClose: () => void;
}

type Mode =
  | { kind: "list" }
  | { kind: "add" }
  | { kind: "edit"; netid: string };

const STATE_COPY: Record<
  string,
  { label: string; dotClass: string; pulse?: boolean }
> = {
  connected: { label: "Connected", dotClass: "bg-green-400" },
  connecting: { label: "Connecting…", dotClass: "bg-yellow-400", pulse: true },
  disconnected: { label: "Disconnected", dotClass: "bg-discord-text-muted" },
};

// Sort: connected first (alpha), then connecting, then disconnected,
// then unknown. Within a tier we sort by network name (falling back to
// netid so unnamed networks aren't all glued together).
function rankNetwork(n: BouncerNetwork): number {
  const s = n.attributes.state;
  if (s === "connected") return 0;
  if (s === "connecting") return 1;
  if (s === "disconnected") return 2;
  return 3;
}

export const BouncerNetworksModal: React.FC<BouncerNetworksModalProps> = ({
  bouncerServerId,
  onClose,
}) => {
  const { t } = useLingui();
  useModalBehavior({ onClose, isOpen: true });

  const bouncer = useStore((s) => s.bouncers[bouncerServerId]);
  const server = useStore((s) =>
    s.servers.find((srv) => srv.id === bouncerServerId),
  );
  const bouncerAddNetwork = useStore((s) => s.bouncerAddNetwork);
  const bouncerChangeNetwork = useStore((s) => s.bouncerChangeNetwork);
  const bouncerDelNetwork = useStore((s) => s.bouncerDelNetwork);

  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [pendingFor, setPendingFor] = useState<string | null>(null); // netid or "*" for add
  const [confirmedSuccessFor, setConfirmedSuccessFor] = useState<string | null>(
    null,
  );

  const networks = useMemo(() => {
    if (!bouncer) return [];
    return Object.values(bouncer.networks).sort((a, b) => {
      const ra = rankNetwork(a);
      const rb = rankNetwork(b);
      if (ra !== rb) return ra - rb;
      const na = a.attributes.name || a.netid;
      const nb = b.attributes.name || b.netid;
      return na.localeCompare(nb);
    });
  }, [bouncer]);

  // Close success-toast after a moment. Bouncer state updates first
  // (BOUNCER NETWORK <id> <newAttrs>), then we briefly highlight the
  // row to ack the action; the row settles back to its normal style.
  useEffect(() => {
    if (!confirmedSuccessFor) return;
    const t = setTimeout(() => setConfirmedSuccessFor(null), 1400);
    return () => clearTimeout(t);
  }, [confirmedSuccessFor]);

  // Watch for the matching BOUNCER ADD/CHANGE/DEL ACK to dismiss the
  // form. We listen via the store's lastError + the network list
  // changing -- when the operation completes successfully the network
  // list changes (or the form's target appears/disappears) and we
  // close the form. lastError set means the form stays open with the
  // server-side error shown.
  useEffect(() => {
    if (!bouncer || !pendingFor) return;
    // For add: pendingFor is "*" -- wait for a network with no current
    // local match to appear.
    if (pendingFor === "*") {
      // We can't reliably detect "the new one" from here without an
      // ack channel, so the parent closes the form after a brief
      // optimistic delay if no error came in.
      const timer = setTimeout(() => {
        if (!bouncer.lastError) {
          setMode({ kind: "list" });
          setPendingFor(null);
          setConfirmedSuccessFor(null);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
    // For change/delete on a real netid: if state mutates while no
    // error is present, success.
    const timer = setTimeout(() => {
      if (!bouncer.lastError) {
        setMode({ kind: "list" });
        setConfirmedSuccessFor(pendingFor);
        setPendingFor(null);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [bouncer, pendingFor]);

  // If lastError is present and matches our pending op, surface it.
  const lastError = bouncer?.lastError;
  const errorForForm = useMemo(() => {
    if (!lastError || !pendingFor) return undefined;
    // For ADD: only show the error when we're adding (pendingFor === "*")
    if (pendingFor === "*" && lastError.subcommand !== "ADDNETWORK")
      return undefined;
    if (
      pendingFor !== "*" &&
      lastError.netid &&
      lastError.netid !== pendingFor &&
      lastError.netid !== "*"
    )
      return undefined;
    return lastError;
  }, [lastError, pendingFor]);

  const onSubmitAdd = (attrs: Record<string, string>) => {
    setPendingFor("*");
    bouncerAddNetwork(bouncerServerId, attrs);
  };
  const onSubmitEdit = (netid: string, attrs: Record<string, string>) => {
    setPendingFor(netid);
    bouncerChangeNetwork(bouncerServerId, netid, attrs);
  };
  const onDelete = (netid: string) => {
    setPendingFor(netid);
    bouncerDelNetwork(bouncerServerId, netid);
  };

  const editingNetwork =
    mode.kind === "edit" ? bouncer?.networks[mode.netid] : undefined;

  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-discord-dark-200 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-discord-dark-300">
        <header className="flex items-center justify-between px-5 py-4 border-b border-discord-dark-300">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-primary/20 text-primary flex items-center justify-center shrink-0">
              <FaLayerGroup />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-white truncate">
                {mode.kind === "add" ? (
                  <Trans>Add Network</Trans>
                ) : mode.kind === "edit" ? (
                  <Trans>
                    Edit{" "}
                    {editingNetwork?.attributes.name || editingNetwork?.netid}
                  </Trans>
                ) : (
                  <Trans>Networks on {server?.name ?? bouncerServerId}</Trans>
                )}
              </h2>
              {mode.kind === "list" && (
                <p className="text-xs text-discord-text-muted truncate">
                  {networks.length === 0 ? (
                    <Trans>No upstream networks yet.</Trans>
                  ) : (
                    <Trans>
                      {networks.length} upstream network
                      {networks.length === 1 ? "" : "s"}
                    </Trans>
                  )}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded text-discord-text-muted hover:text-white hover:bg-discord-dark-300 flex items-center justify-center transition-colors"
            aria-label={t`Close`}
          >
            <FaTimes />
          </button>
        </header>

        <div className="overflow-y-auto flex-1 min-h-0">
          {mode.kind === "list" && (
            <div>
              {!bouncer?.listed && networks.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 p-10 text-discord-text-muted">
                  <div className="w-8 h-8 border-2 border-discord-text-muted border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm">
                    <Trans>Loading networks from your bouncer…</Trans>
                  </p>
                </div>
              ) : networks.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
                  <FaLayerGroup className="text-4xl text-discord-text-muted" />
                  <div className="text-sm text-discord-text-muted">
                    <Trans>
                      Your bouncer doesn't have any networks yet. Add one to get
                      started.
                    </Trans>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMode({ kind: "add" })}
                    className="mt-2 px-4 py-2 rounded bg-primary hover:bg-primary-hover text-white text-sm font-semibold flex items-center gap-2 transition-colors"
                  >
                    <FaPlus /> <Trans>Add your first network</Trans>
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-discord-dark-300/50">
                  {networks.map((net) => {
                    const stateKey = net.attributes.state ?? "disconnected";
                    const visual =
                      STATE_COPY[stateKey] ?? STATE_COPY.disconnected;
                    const isHighlighted = confirmedSuccessFor === net.netid;
                    return (
                      <li
                        key={net.netid}
                        className={`group flex items-center gap-4 px-5 py-3 transition-colors ${
                          isHighlighted
                            ? "bg-green-600/10"
                            : "hover:bg-discord-dark-300/40"
                        }`}
                      >
                        <span className="relative flex items-center justify-center shrink-0">
                          <span
                            className={`w-3 h-3 rounded-full ${visual.dotClass}`}
                            role="img"
                            aria-label={visual.label}
                          />
                          {visual.pulse && (
                            <span
                              className={`absolute w-3 h-3 rounded-full ${visual.dotClass} opacity-70 animate-ping`}
                            />
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="font-medium text-white truncate">
                              {net.attributes.name || net.netid}
                            </span>
                            <span className="text-xs text-discord-text-muted">
                              {visual.label}
                            </span>
                          </div>
                          <div className="text-xs text-discord-text-muted truncate">
                            {net.attributes.host || <Trans>no host set</Trans>}
                            {net.attributes.port
                              ? `:${net.attributes.port}`
                              : ""}
                            {net.attributes.nickname
                              ? ` · ${net.attributes.nickname}`
                              : ""}
                          </div>
                          {net.attributes.error && (
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-red-400">
                              <FaExclamationCircle />
                              <span className="truncate">
                                {net.attributes.error}
                              </span>
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setMode({ kind: "edit", netid: net.netid })
                          }
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded text-discord-text-muted hover:text-white hover:bg-discord-dark-300"
                          aria-label={t`Edit`}
                          data-testid={`bouncer-row-edit-${net.netid}`}
                        >
                          <FaPencilAlt />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {networks.length > 0 && (
                <div className="p-4">
                  <button
                    type="button"
                    onClick={() => setMode({ kind: "add" })}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded border-2 border-dashed border-discord-dark-300 hover:border-primary text-discord-text-muted hover:text-primary transition-colors"
                    data-testid="bouncer-add-network-button"
                  >
                    <FaPlus /> <Trans>Add Network</Trans>
                  </button>
                </div>
              )}
            </div>
          )}

          {mode.kind === "add" && (
            <BouncerNetworkForm
              errorAttribute={errorForForm?.attribute}
              errorMessage={errorForForm?.description}
              isSaving={pendingFor === "*"}
              onSave={onSubmitAdd}
              onCancel={() => {
                setMode({ kind: "list" });
                setPendingFor(null);
              }}
            />
          )}

          {mode.kind === "edit" && editingNetwork && (
            <BouncerNetworkForm
              initial={editingNetwork.attributes}
              errorAttribute={errorForForm?.attribute}
              errorMessage={errorForForm?.description}
              isSaving={pendingFor === editingNetwork.netid}
              isDeleting={pendingFor === editingNetwork.netid}
              onSave={(attrs) => onSubmitEdit(editingNetwork.netid, attrs)}
              onDelete={() => onDelete(editingNetwork.netid)}
              onCancel={() => {
                setMode({ kind: "list" });
                setPendingFor(null);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default BouncerNetworksModal;
