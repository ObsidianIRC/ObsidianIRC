# Pinned Private Messages & MONITOR Implementation

## Summary

This feature adds comprehensive support for pinned private messages with MONITOR/extended-monitor protocol support, enabling users to keep important private conversations persistent across page refreshes and see real-time online/away/offline status.

## Features Implemented

### 1. **Pinned Private Messages**
- Private messages can be pinned to keep them visible even after page refresh
- Pinned PMs are stored in localStorage per server
- Pin/unpin functionality available via context menu and right-click
- Pinned PMs appear at the top of the private messages list

### 2. **Drag-and-Drop Reordering**
- Pinned private messages can be reordered via drag-and-drop
- Order is persisted to localStorage
- Only pinned PMs are draggable (similar to channel behavior)
- Visual feedback during drag operations

### 3. **MONITOR Protocol Support**
- Full implementation of IRC MONITOR extension (IRCv3)
- Commands: MONITOR +, MONITOR -, MONITOR C, MONITOR L, MONITOR S
- Numerics: 730 (RPL_MONONLINE), 731 (RPL_MONOFFLINE), 732 (RPL_MONLIST), 733 (RPL_ENDOFMONLIST), 734 (ERR_MONLISTFULL)
- Server-specific MONITOR lists (not global)

### 4. **Extended-Monitor Support**
- Integrates with away-notify for tracking away status
- Tracks AWAY, ACCOUNT, CHGHOST, SETNAME notifications for monitored users
- Real-time status updates for users in private message tabs

### 5. **Status Indicators**
- **Green** dot: User is online
- **Yellow** dot: User is away
- **Grey** dot: User is offline (only visible for pinned PMs)
- Status indicator positioned on the user icon
- Tooltips show current status on hover

### 6. **Automatic MONITOR Management**
- When opening a PM tab: automatically MONITOR + the user
- When closing an unpinned PM tab: automatically MONITOR - the user
- Pinned PM users remain monitored even when tab is closed
- Restores MONITOR list on server reconnection

### 7. **METADATA Integration**
- Automatically requests user metadata when PM is opened
- Subscribes to avatar, status, url, and website metadata keys
- Unsubscribes when unpinned PM is closed
- Metadata updates reflected in real-time

## Files Modified

### Type Definitions
- **src/types/index.ts**
  - Added `isPinned`, `order`, `isOnline`, `isAway` to `PrivateChat` interface

### IRC Client
- **src/lib/ircClient.ts**
  - Added MONITOR event types to `EventMap`
  - Implemented MONITOR command methods: `monitorAdd`, `monitorRemove`, `monitorClear`, `monitorList`, `monitorStatus`
  - Added parsing for numerics 730-734
  - Added `monitor` and `extended-monitor` to capability list

### Store
- **src/store/index.ts**
  - Added localStorage functions: `loadPinnedPrivateChats`, `savePinnedPrivateChats`
  - Added MONITOR event handlers: `MONONLINE`, `MONOFFLINE`, `AWAY` (for extended-monitor)
  - Implemented store actions: `pinPrivateChat`, `unpinPrivateChat`, `reorderPrivateChats`
  - Modified `openPrivateChat` to automatically MONITOR users and request metadata
  - Modified `deletePrivateChat` to clean up MONITOR and metadata subscriptions
  - Added pinned PM restoration in `ready` event handler

### UI Components
- **src/components/layout/ChannelList.tsx**
  - Added `FaThumbtack` icon import for pin indicator
  - Added drag-and-drop state for private messages
  - Implemented PM drag handlers: `handlePMDragStart`, `handlePMDragOver`, `handlePMDragLeave`, `handlePMDrop`, `handlePMDragEnd`
  - Added `sortedPrivateChats` memo to sort pinned PMs by order
  - Updated private message rendering with:
    - Status indicators (green/yellow/grey dots)
    - Pin indicators (thumbtack icon)
    - Drag-and-drop support
    - Pin/unpin context menu items
    - Visual drag feedback

## Technical Details

### localStorage Structure

```typescript
// Key: "pinnedPrivateChats"
{
  "[serverId]": [
    { username: "alice", order: 0 },
    { username: "bob", order: 1 },
    { username: "charlie", order: 2 }
  ]
}
```

### MONITOR Protocol Flow

1. **PM Opened**: `MONITOR + username` → Server sends 730/731 → Status updated in state
2. **PM Pinned**: Saved to localStorage → Persisted across sessions
3. **Server Ready**: Load pinned PMs → `MONITOR + username1,username2,...` → Request metadata
4. **Status Change**: Server sends 730/731/AWAY → State updated → UI reflects change
5. **PM Closed (unpinned)**: `MONITOR - username` → Clean up

### Event Flow

```
User Action → Store Action → IRC Command → Server Response → Event Handler → State Update → UI Update
```

## Usage

### Pin a Private Message
1. Right-click (or long-press on mobile) a private message tab
2. Select "Pin Private Chat"
3. The PM will move to the top with a thumbtack icon

### Reorder Pinned PMs
1. Click and hold on a pinned PM tab
2. Drag to desired position
3. Release to drop
4. Order is automatically saved

### Status Indicators
- Look for the colored dot on the user icon:
  - 🟢 Green = Online
  - 🟡 Yellow = Away
  - ⚫ Grey = Offline

## Benefits

1. **Persistence**: Important conversations stay visible across page refreshes
2. **Organization**: Drag-and-drop to prioritize conversations
3. **Awareness**: Real-time status updates via MONITOR
4. **Efficiency**: Automatic cleanup of MONITOR entries
5. **Privacy**: Server-specific MONITOR lists prevent cross-server leakage
6. **Standards Compliant**: Full IRCv3 MONITOR and extended-monitor support

## Compatibility

- Requires IRC server support for MONITOR capability
- Extended-monitor features require server support for extended-monitor capability
- Falls back gracefully if server doesn't support MONITOR
- Works with all servers that support IRCv3 capabilities

## Future Enhancements

- Notification preferences per pinned PM
- Pin limits and management UI
- Bulk pin/unpin operations
- Export/import pinned PM lists
- Cross-server PM organization
