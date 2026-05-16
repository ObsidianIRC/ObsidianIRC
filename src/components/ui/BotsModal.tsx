// Bot management modal.
//
// Populated from the obby.world/channel-bots cap (Server.bots), pushed
// by the IRCd at welcome time and incrementally on lifecycle events
// (add / update / remove).  Shows every bot the current user can see;
// non-opers only see ACTIVE bots, opers also see pending and suspended.
//
// Each row badges scope (channel vs server) and live status (online /
// offline, suspended, pending).  Clicking a row drills into a detail
// pane showing the bot's command schemas and IRCop action buttons.
// Actions are issued by sending the matching /PUSHBOT subcommand —
// the server pushes the resulting state change back through the cap
// and the modal re-renders without a manual refresh.

import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type React from "react";
import { useMemo, useState } from "react";
import ircClient from "../../lib/ircClient";
import BaseModal from "../../lib/modal/BaseModal";
import { Button, ModalBody } from "../../lib/modal/components";
import useStore from "../../store";
import type { PushBotInfo } from "../../types";

interface BotsModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string;
}

type FilterMode = "all" | "server" | "channel";

const STATUS_BADGE: Record<
  PushBotInfo["status"],
  { label: string; cls: string }
> = {
  active: {
    label: "active",
    cls: "bg-emerald-700/40 text-emerald-300 border border-emerald-600/60",
  },
  pending: {
    label: "pending",
    cls: "bg-amber-700/40 text-amber-300 border border-amber-600/60",
  },
  suspended: {
    label: "suspended",
    cls: "bg-red-700/40 text-red-300 border border-red-600/60",
  },
  deleted: {
    label: "deleted",
    cls: "bg-discord-dark-200 text-discord-text-muted border border-discord-dark-500",
  },
};

const SCOPE_BADGE: Record<
  PushBotInfo["scope"],
  { label: string; title: string; cls: string }
> = {
  server: {
    label: "server-bot",
    title: "Reachable from any channel",
    cls: "bg-discord-primary/30 text-discord-primary border border-discord-primary/40",
  },
  channel: {
    label: "channel-bot",
    title: "Active only in joined channels",
    cls: "bg-amber-700/30 text-amber-300 border border-amber-600/50",
  },
};

const BotsModal: React.FC<BotsModalProps> = ({ isOpen, onClose, serverId }) => {
  const server = useStore((s) => s.servers.find((srv) => srv.id === serverId));
  const currentUser = useStore((s) => s.currentUser);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [query, setQuery] = useState("");
  const [selectedNick, setSelectedNick] = useState<string | null>(null);

  const isOper = (() => {
    const myNick = currentUser?.username;
    if (!myNick || !server) return false;
    const me = server.users.find((u) => u.username === myNick);
    return !!me?.isIrcOp;
  })();

  const bots: PushBotInfo[] = useMemo(() => {
    if (!server?.bots) return [];
    const all = Object.values(server.bots);
    return all
      .filter((b) => filter === "all" || b.scope === filter)
      .filter((b) =>
        query
          ? b.nick.toLowerCase().includes(query.toLowerCase()) ||
            b.realname.toLowerCase().includes(query.toLowerCase())
          : true,
      )
      .sort((a, b) => {
        // active first, then alpha by nick
        const sa = a.status === "active" ? 0 : a.status === "pending" ? 1 : 2;
        const sb = b.status === "active" ? 0 : b.status === "pending" ? 1 : 2;
        if (sa !== sb) return sa - sb;
        return a.nick.localeCompare(b.nick);
      });
  }, [server?.bots, filter, query]);

  const selected = selectedNick
    ? server?.bots?.[selectedNick.toLowerCase()]
    : undefined;

  const send = (subcmd: string, nick: string) => {
    if (!isOper) return;
    ircClient.sendRaw(serverId, `PUSHBOT ${subcmd} ${nick}`);
  };

  if (!isOpen) return null;
  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={t`Bots on this network`}
    >
      <ModalBody className="!p-0">
        <div className="flex flex-col md:flex-row min-h-[28rem] max-h-[70vh]">
          {/* left pane: filter + list */}
          <div className="md:w-2/5 border-r border-discord-dark-500 flex flex-col">
            <div className="p-3 border-b border-discord-dark-500 flex flex-col gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t`Search by nick or description`}
                className="w-full bg-discord-dark-200 rounded px-2 py-1 text-sm text-discord-text-normal placeholder:text-discord-text-muted focus:outline-none focus:ring-1 focus:ring-discord-text-link"
              />
              <div className="flex gap-1 text-xs">
                {(["all", "server", "channel"] as FilterMode[]).map((f) => (
                  <button
                    type="button"
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-2 py-1 rounded ${
                      filter === f
                        ? "bg-discord-text-link text-white"
                        : "bg-discord-dark-200 text-discord-text-muted hover:text-white"
                    }`}
                  >
                    {f === "all"
                      ? t`All`
                      : f === "server"
                        ? t`Server-wide`
                        : t`Channel`}
                  </button>
                ))}
                <div className="ml-auto text-discord-text-muted self-center">
                  {bots.length}
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {bots.length === 0 && (
                <div className="p-4 text-sm text-discord-text-muted">
                  <Trans>No bots registered on this network yet.</Trans>
                </div>
              )}
              {bots.map((b) => {
                const isSel =
                  selectedNick?.toLowerCase() === b.nick.toLowerCase();
                return (
                  <button
                    type="button"
                    key={b.bot_id || b.nick}
                    onClick={() => setSelectedNick(b.nick)}
                    className={`w-full text-left px-3 py-2 border-b border-discord-dark-500 flex flex-col gap-1 ${
                      isSel
                        ? "bg-discord-dark-200"
                        : "hover:bg-discord-dark-200/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${b.online ? "bg-emerald-400" : "bg-discord-text-muted"}`}
                        title={b.online ? t`Gateway connected` : t`Offline`}
                      />
                      <span className="font-mono text-sm text-discord-text-normal">
                        {b.nick}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${SCOPE_BADGE[b.scope].cls}`}
                        title={SCOPE_BADGE[b.scope].title}
                      >
                        {SCOPE_BADGE[b.scope].label}
                      </span>
                      {b.status !== "active" && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${STATUS_BADGE[b.status].cls}`}
                        >
                          {STATUS_BADGE[b.status].label}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-discord-text-muted truncate">
                      {b.realname}
                    </div>
                    {b.scope === "channel" && b.channels.length > 0 && (
                      <div className="text-[11px] text-discord-text-muted truncate">
                        {b.channels.join(" ")}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* right pane: detail */}
          <div className="flex-1 flex flex-col">
            {!selected ? (
              <div className="m-auto text-sm text-discord-text-muted px-6 text-center">
                <Trans>
                  Select a bot on the left to see its commands and management
                  actions.
                </Trans>
              </div>
            ) : (
              <div className="overflow-y-auto p-4 flex flex-col gap-3">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h3 className="text-lg font-semibold text-discord-text-normal">
                    {selected.nick}
                  </h3>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${SCOPE_BADGE[selected.scope].cls}`}
                  >
                    {SCOPE_BADGE[selected.scope].label}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${STATUS_BADGE[selected.status].cls}`}
                  >
                    {STATUS_BADGE[selected.status].label}
                  </span>
                  <span className="text-xs text-discord-text-muted">
                    {selected.online ? t`gateway online` : t`offline`}
                  </span>
                </div>
                <div className="text-sm text-discord-text-muted">
                  {selected.realname}
                </div>
                <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
                  <dt className="text-discord-text-muted">
                    <Trans>Transport</Trans>
                  </dt>
                  <dd className="text-discord-text-normal">
                    {selected.transport}
                  </dd>
                  <dt className="text-discord-text-muted">
                    <Trans>Source</Trans>
                  </dt>
                  <dd className="text-discord-text-normal">
                    {selected.from_config
                      ? t`config-defined`
                      : t`self-registered`}
                  </dd>
                  {selected.scope === "channel" && (
                    <>
                      <dt className="text-discord-text-muted">
                        <Trans>Channels</Trans>
                      </dt>
                      <dd className="text-discord-text-normal font-mono">
                        {selected.channels.length
                          ? selected.channels.join(", ")
                          : "—"}
                      </dd>
                    </>
                  )}
                  {selected.webhook_url !== undefined && (
                    <>
                      <dt className="text-discord-text-muted">
                        <Trans>Webhook</Trans>
                      </dt>
                      <dd className="text-discord-text-normal break-all">
                        {selected.webhook_url || "—"}
                        {selected.webhook_suspended && (
                          <span className="ml-2 text-red-400">
                            <Trans>(suspended)</Trans>
                          </span>
                        )}
                      </dd>
                    </>
                  )}
                </dl>

                <div>
                  <div className="text-xs text-discord-text-muted font-semibold uppercase tracking-wide mt-2 mb-1">
                    <Trans>Slash commands</Trans>
                  </div>
                  {selected.commands.length === 0 ? (
                    <div className="text-sm text-discord-text-muted italic">
                      <Trans>
                        Bot hasn't registered any slash commands yet.
                      </Trans>
                    </div>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {selected.commands.map((cmd) => (
                        <li
                          key={cmd.name}
                          className="bg-discord-dark-200 rounded p-2 text-sm"
                        >
                          <div className="font-mono text-discord-text-normal">
                            /{cmd.name}{" "}
                            {(cmd.options ?? [])
                              .map((o) =>
                                o.required ? `<${o.name}>` : `[${o.name}]`,
                              )
                              .join(" ")}
                          </div>
                          {cmd.description && (
                            <div className="text-xs text-discord-text-muted mt-1">
                              {cmd.description}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {isOper && !selected.from_config && (
                  <div className="mt-3 border-t border-discord-dark-500 pt-3">
                    <div className="text-xs text-discord-text-muted font-semibold uppercase tracking-wide mb-2">
                      <Trans>Operator actions</Trans>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {selected.status === "pending" && (
                        <Button onClick={() => send("APPROVE", selected.nick)}>
                          <Trans>Approve</Trans>
                        </Button>
                      )}
                      {selected.status === "active" && (
                        <Button
                          variant="danger"
                          onClick={() => send("SUSPEND", selected.nick)}
                        >
                          <Trans>Suspend</Trans>
                        </Button>
                      )}
                      {selected.status === "suspended" && (
                        <Button
                          onClick={() => send("UNSUSPEND", selected.nick)}
                        >
                          <Trans>Unsuspend</Trans>
                        </Button>
                      )}
                      <Button
                        variant="danger"
                        onClick={() => {
                          if (
                            window.confirm(
                              t`Delete bot ${selected.nick}?  This soft-deletes the database row; reuse the nick later only after a /REHASH.`,
                            )
                          ) {
                            send("DELETE", selected.nick);
                            setSelectedNick(null);
                          }
                        }}
                      >
                        <Trans>Delete</Trans>
                      </Button>
                    </div>
                  </div>
                )}
                {isOper && selected.from_config && (
                  <div className="mt-3 text-xs text-discord-text-muted italic">
                    <Trans>
                      Config-defined bot. Edit obbyircd.conf and /REHASH to
                      change state.
                    </Trans>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </ModalBody>
    </BaseModal>
  );
};

export default BotsModal;
