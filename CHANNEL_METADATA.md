# Channel Metadata Implementation

This document describes the implementation of channel metadata support based on the [IRCv3 METADATA specification](https://ircv3.net/specs/extensions/metadata).

## Supported Metadata Keys

Channels now support the following metadata keys:

### `avatar`
- **Type**: URL with optional `{size}` substitution
- **Description**: An avatar image that graphical clients can show alongside the channel's name
- **Example**: `https://example.com/avatar/{size}/channel.jpg`
- **Size substitution**: If the URL contains `{size}`, it will be replaced with the requested pixel size (e.g., 16, 20, etc.)

### `display-name`
- **Type**: String (may contain emoji and special characters)
- **Description**: Alternative name to use instead of the channel name for display purposes
- **Example**: `General Support Channel`
- **Purpose**: Useful for gateways to chat services that allow spaces and other characters in names. The channel name (e.g., `#general`) is still required for standard IRC protocol operations but can be less prominent in the UI.

## Implementation Details

### 1. Metadata Subscription

When joining a channel, the client automatically requests channel metadata:

```typescript
// In src/store/index.ts - JOIN event handler
if (username === ourNick) {
  // Request channel metadata if server supports it
  if (serverSupportsMetadata(serverId)) {
    setTimeout(() => {
      ircClient.metadataGet(serverId, channelName, ["avatar", "display-name"]);
    }, 100);
  }
}
```

### 2. Helper Functions

Two utility functions were added to `src/lib/ircUtils.tsx`:

#### `getChannelDisplayName()`
```typescript
/**
 * Get the display name for a channel, using metadata display-name if available
 * or falling back to the channel name with # prefix removed.
 */
export function getChannelDisplayName(
  channelName: string,
  metadata?: Record<string, { value: string | undefined; visibility: string }>,
): string
```

#### `getChannelAvatarUrl()`
```typescript
/**
 * Get the avatar URL for a channel from metadata, with optional size substitution
 */
export function getChannelAvatarUrl(
  metadata?: Record<string, { value: string | undefined; visibility: string }>,
  size?: number,
): string | undefined
```

### 3. UI Updates

#### Channel List (`src/components/layout/ChannelList.tsx`)
- Displays channel avatar (if available) instead of the `#` hashmark icon
- Shows channel display name when available
- Falls back to `#` icon and regular name if metadata is not set
- Includes error handling to show fallback icon if avatar fails to load

#### Chat Area Header (`src/components/layout/ChatArea.tsx`)
- Shows channel avatar in the header (20px size)
- Displays channel display name
- Maintains the same fallback behavior as the channel list

### 4. Protocol Integrity

All IRC protocol commands (PART, MODE, TOPIC, etc.) continue to use the real channel name, not the display name. This ensures:

- `PART` commands use the actual channel name
- `MODE` commands target the correct channel
- All IRC protocol operations work correctly regardless of display name

The display name is purely cosmetic and only affects the user interface.

### 5. Data Storage

Channel metadata is stored in the channel object:

```typescript
interface Channel {
  id: string;
  name: string;  // Real channel name (e.g., "#general")
  // ... other fields
  metadata?: Record<string, { 
    value: string | undefined; 
    visibility: string 
  }>;
}
```

The metadata is automatically updated when `METADATA_KEYVALUE` events are received from the IRC server.

### 6. Channel Settings Modal UI

Users with operator (@) or higher status can edit channel metadata through a dedicated UI:

#### Permission Check (`src/lib/ircUtils.tsx`)
```typescript
/**
 * Check if a user has operator (or higher) permissions in a channel
 * Operator status is indicated by @ or higher (~, &, etc.) in the user's status string
 */
export function hasOpPermission(userStatus?: string): boolean {
  if (!userStatus) return false;
  
  // Check for op (@), admin (&), or owner (~) status
  return userStatus.includes("@") || userStatus.includes("&") || userStatus.includes("~");
}
```

#### Metadata Tab
The Channel Settings modal now includes a "Metadata" tab that:
- Only appears for users with @ or higher status
- Only shows when the server supports METADATA
- Provides separate fields for avatar and display name
- Has individual "Apply" buttons for each field
- Shows live preview for avatar URLs
- Includes helpful descriptions and examples

The tab is conditionally rendered based on:
```typescript
const userHasOpPermission = hasOpPermission(currentUserInChannel?.status);
const supportsMetadata = serverSupportsMetadata(serverId);
```

Only when both conditions are true will the Metadata tab be visible.

## Usage Examples

### Setting Channel Avatar (Server Admin)
```
/METADATA #channel SET avatar :https://example.com/avatar/{size}/channel.jpg
```

### Setting Channel Display Name (Server Admin)
```
/METADATA #channel SET display-name :General Support Channel
```

### Setting Channel Metadata via Channel Settings Modal

Users with operator (@) or higher permissions can update channel metadata through the Channel Settings modal:

1. Right-click on a channel or click the settings icon
2. Navigate to the **Metadata** tab (only visible if you have @ or higher status)
3. Update the **Channel Avatar URL** or **Channel Display Name**
4. Click the **Apply** button next to each field to save changes

The Metadata tab includes:
- **Avatar URL field** with preview functionality
  - Supports `{size}` substitution placeholders
  - Live preview at 64px size
- **Display Name field** with helpful hints
  - Shows the actual channel name for reference
  - Allows spaces, emoji, and special characters
- **Individual Apply buttons** for each field
  - Separate buttons allow updating fields independently
  - Visual feedback with spinner during updates

### Permissions

Channel metadata editing requires:
- Operator status (@) or higher (~, &)
- Server must support the METADATA capability
- Both conditions must be met for the Metadata tab to appear

### Size Substitution in Avatar URLs
If the avatar URL is `https://example.com/avatar/{size}/channel.jpg`:
- Requesting size 16: `https://example.com/avatar/16/channel.jpg`
- Requesting size 20: `https://example.com/avatar/20/channel.jpg`
- No size specified: `https://example.com/avatar/{size}/channel.jpg` (literal)

## Compatibility

- Works seamlessly with servers that don't support METADATA (graceful degradation)
- Channel names remain the source of truth for all IRC protocol operations
- Display names are only used in the UI layer
- Avatar URLs with `{size}` placeholders work even if the server doesn't replace them

## Future Enhancements

Potential future improvements:
- Allow users to customize which channels show avatars
- Add support for additional channel metadata keys (description, website, etc.)
- ~~Implement channel metadata editing UI for channel operators~~ ✅ **Implemented**
- Add metadata caching to reduce server requests
- Bulk metadata operations for multiple channels
- Import/export channel metadata configurations

## Screenshots

### Channel List with Metadata
Channels display their custom avatars and display names in the sidebar.

### Chat Header with Metadata
Channel avatars and display names appear in the chat area header.

### Channel Settings - Metadata Tab
Operators can edit channel metadata through the dedicated Metadata tab in Channel Settings modal (requires @ or higher status).
