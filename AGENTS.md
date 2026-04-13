# ObsidianIRC — Agent Reference

React + TypeScript + TailwindCSS + DaisyUI + Zustand + Tauri (desktop/mobile).
WebSocket-only IRC client. Tauri wraps the web app with native bindings for TCP sockets
(WebSocket-compatible wrapper), file viewing (Swift plugin on iOS/macOS via `src-tauri/plugins/`),
and share-sheet. The web build also runs standalone via Docker/Nginx.

---

## Commands — run these every time

```bash
npm run format; npm run fix:unsafe; npm run test; npm run build
```

- `format` / `fix:unsafe` — Biome lint + format (pre-commit hook does this automatically)
- `test` — Vitest, all 45 test files must pass
- `build` — TypeScript compile + Vite bundle (must be clean)

---

## Project Layout

```
src/
  components/
    layout/       # AppLayout, ChatArea, ChannelList, MemberList, ChatHeader, ResizableSidebar
    mobile/       # Mobile-specific variants
    message/      # MessageItem, MediaPreview, MessageAvatar, MessageReply
    ui/           # Modals, dropdowns, settings panels
  hooks/          # Custom React hooks (useScrollToBottom, useTabCompletion, …)
  lib/
    irc/
      IRCClient.ts          # IRC client class
      handlers/             # IRC protocol dispatch (one file per domain)
        index.ts            # IRC_DISPATCH table + handleMessage()
        connection.ts / messages.ts / users.ts / channels.ts
        whois.ts / metadata.ts / auth.ts / monitoring.ts
    ircClient.ts            # Singleton: `export default new IRCClient()`  ← all imports point here
    mediaProbe.ts           # HEAD/GET probing (see URL Safety below)
    mediaUtils.ts           # Media type detection + trust logic
    settings/               # Settings definitions and helpers
  store/
    index.ts                # Zustand store: state shape + all action methods
    handlers/               # Store-side IRC event subscriptions (one file per domain)
      index.ts              # registerAllHandlers(store) — called by store/index.ts
      messages.ts / users.ts / channels.ts / batches.ts
      whois.ts / metadata.ts / auth.ts / connection.ts
    helpers.ts              # generateDeterministicId(serverId, name) — uuidv5 channel/user IDs
    types.ts                # UISelections and other store-specific types
    localStorage.ts         # loadUISelections / saveUISelections
  types/
    index.ts                # Shared types: Server, Channel, Message, User, …
tests/                      # Vitest tests — mirror src/ structure
src-tauri/                  # Tauri config, Rust backend, plugins (Swift share-sheet)
```

---

## IRC Event Flow — two layers

### Layer 1: Protocol parsing (`src/lib/irc/`)

`IRCClient.handleMessage()` calls `handleMessage(ctx, serverId, raw)` from `src/lib/irc/handlers/index.ts`,
which dispatches via `IRC_DISPATCH`:

```ts
const IRC_DISPATCH: Record<string, (ctx: IRCClientContext, serverId: string, msg: ParsedMessage) => void> = {
  PRIVMSG: handlePrivmsg,
  JOIN: handleJoin,
  "332": handleRplTopic,
  // …
};
```

Each handler in `src/lib/irc/handlers/*.ts` receives `ctx: IRCClientContext` (the client instance)
and calls `ctx.triggerEvent("EVENT_NAME", payload)` to emit to the store.

**To add a new IRC command:** add a handler function to the relevant `src/lib/irc/handlers/*.ts`
file and add it to `IRC_DISPATCH` in `index.ts`.

### Layer 2: Store subscriptions (`src/store/handlers/`)

`src/store/handlers/index.ts` exports `registerAllHandlers(store: StoreApi<AppState>)`,
which is called once at the bottom of `src/store/index.ts` after `useStore` is created.

Each handler file subscribes to `ircClient` events and updates the Zustand store:

```ts
// Pattern in every src/store/handlers/*.ts
export function registerXxxHandlers(store: StoreApi<AppState>) {
  ircClient.on("EVENT", (payload) => {
    store.setState((state) => ({ /* return Partial<AppState> — no mutation */ }));
  });
}
```

**To add a new store reaction to an IRC event:** add `ircClient.on(...)` in the relevant
`src/store/handlers/*.ts` and call the new register function from `handlers/index.ts`.

**Important:** `store.setState()` callbacks must **return** `Partial<AppState>`. The store
uses Immer (`immer` package is a dependency), but the Immer middleware is not currently wired
into `create()` — direct mutation of `state` inside `setState` will silently not work.

---

## Tests

Location: `tests/` — mirrors `src/` structure.

```
tests/
  hooks/        # React hook tests (renderHook + act)
  lib/          # Pure logic tests
  store/        # Store action/handler tests
  components/   # Component integration tests
  protocol/     # IRC mode/protocol tests
  setup.ts      # Global mocks (WebSocket, window, matchMedia, RAF)
```

Run: `npm run test`. Add tests for any business logic, hooks, and media/URL handling.
`requestAnimationFrame` is mocked as `setTimeout(cb, 0)` in `tests/setup.ts` —
always cancel nested RAFs in effect cleanup to avoid post-unmount setState errors.

---

## URL Safety — never leak user IP

**Critical invariant:** only make HTTP requests (HEAD or GET) for URLs from trusted origins.
Making a request to an arbitrary external URL reveals the user's IP.

Trust levels (checked before any network request):

1. **Safe media** — server-accepted filehost or server-marked-trusted origin → probe allowed
2. **Trusted sources** — embeddable services (YouTube, etc.) from a known-safe list → probe allowed
3. **External content** — user explicitly enabled "show all external content" → probe allowed
4. **Anything else** — show a plain link, no preview, no request

Logic lives in `src/lib/mediaUtils.ts` (trust detection) and `src/lib/mediaProbe.ts`
(HEAD → GET fallback). `src/components/message/MediaPreview.tsx` is the call site.

Do not add any fetch/HEAD/GET call that bypasses this trust check.

---

## External Link Protection — never open URLs without user confirmation

**Critical invariant:** every user-visible external URL opened by the app must pass through
`ExternalLinkWarningModal` before `openExternalUrl` is called. This protects users from
accidentally opening malicious links posted in chat.

The correct pattern in any component that opens external URLs:

```tsx
const [showWarning, setShowWarning] = useState(false);

// In JSX:
<button onClick={() => setShowWarning(true)}>Open link</button>
<ExternalLinkWarningModal
  isOpen={showWarning}
  url={url}
  onConfirm={() => { openExternalUrl(url); setShowWarning(false); }}
  onCancel={() => setShowWarning(false)}
/>
```

If a child component needs to open a URL, pass an `onRequestOpen` callback prop instead of
calling `openExternalUrl` directly — the parent controls the warning modal.

Do not call `openExternalUrl` directly from any UI element without this protection.

---

## Zustand + React Gotchas

**Store action refs are unstable.** Functions from `useStore((s) => s.someAction)` change
reference on every state update. Never put them in `useEffect` dependency arrays — it causes
infinite loops. Suppress Biome with:

```tsx
// biome-ignore lint/correctness/useExhaustiveDependencies: store actions have unstable refs
useEffect(() => { … }, [depA]);
```

Same applies to `useRef` values (read `.current` inside the effect, don't list in deps).

**macOS WKWebView scroll:** when `isScrolledUp` is true, freeze the slice start index
(see `scrollUpStartRef` in `ChatArea`) — never insert elements above the viewport or WKWebView
jumps to the top of history. See `MEMORY.md` for full explanation.

**Sentinel div:** `<div ref={messagesEndRef} className="h-px">` — must have non-zero height
for WKWebView's `IntersectionObserver`.

---

## Biome — intentional dep omissions

Always add suppression comment on the line **immediately before** the hook — pre-commit
`biome --write` silently adds missing deps otherwise:

```tsx
// biome-ignore lint/correctness/useExhaustiveDependencies: <reason>
useEffect(() => { … }, [depA]);
```

Same applies to intentionally omitted deps you want to keep out of the array (e.g. a value
that should not re-trigger the effect). The comment prevents Biome from silently adding it
back on the next lint pass.

---

## Comments

- Explain **why**, never **what** — if the code is readable, omit the comment entirely
- Keep to one line in most cases
- Write in the context of the project, not the change — a comment must make sense to someone reading the code cold, with no knowledge of what was previously there or why it was modified
