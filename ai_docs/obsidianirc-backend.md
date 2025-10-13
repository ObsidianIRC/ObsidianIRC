# IRC Backend API Server

A comprehensive Go backend server providing REST APIs for IRC server management, account/channel administration, temporary image hosting, and JWT-authenticated IRC data access. Built with SQLite, Gorilla Mux, and WebSocket RPC connectivity.

## Features

- **IRC Server Integration**: WebSocket RPC connection to UnrealIRCd for real-time data
- **Account Management**: User registration, login verification, metadata, and email verification
- **Channel Management**: Channel creation, updates, permissions, and metadata
- **JWT Authentication**: IRCv3 extjwt support for secure client access
- **Image Upload Service**: Temporary image hosting with automatic cleanup
- **SQLite Database**: Full schema for users, channels, metadata, and permissions
- **Multiple Auth Methods**: JWT tokens, server API keys, and public endpoints
- **RESTful API**: Clean, well-documented endpoints for all operations

## Quick Start

### Prerequisites

- Go 1.16 or higher

### Installation & Running

```bash
# Clone or navigate to the project directory
cd backend

# Set required environment variables
export JWT_SECRET=testsecret
export IRC_SERVER_KEY=testkey

# Run directly
go run .

# Or build and run
CGO_ENABLED=1 go build .
./backend
```

The server starts on **`http://localhost:8080`**

**Note:** For full functionality, also set up the IRC server connection variables if using IRC features.

### Database

The server automatically creates an SQLite database (`irc_backend.db`) on first run with the following schema:

- **users**: Account information with Argon2id hashed passwords
- **user_metadata**: Key-value metadata for users
- **channels**: Channel information
- **channel_metadata**: Key-value metadata for channels  
- **channel_permissions**: User permissions for channels
- **email_verifications**: Email verification codes

An admin user is created automatically for testing.

## API Reference

### Authentication

This backend uses multiple authentication methods:

- **JWT Tokens**: For IRC clients accessing privileged data
- **Server API Key**: For IRC server managing accounts/channels (`X-ObsidianIRC-Key` header)
- **Public**: Image serving and some informational endpoints

### Endpoints Overview

| Endpoint | Method | Auth Required | Description |
|----------|--------|---------------|-------------|
| `/upload` | POST | JWT | Upload images |
| `/images/{filename}` | GET | None | Serve uploaded images |
| `/irc/users` | GET | JWT + IRCop | Get IRC users |
| `/irc/channels` | GET | JWT + IRCop | Get IRC channels |
| `/irc/bans` | GET | JWT + IRCop | Get server bans |
| `/irc/stats` | GET | JWT + IRCop | Get server stats |
| `/irc/server-uptime` | GET | JWT + IRCop | Get server uptime |
| `/irc/accounts/register` | POST | Server Key | Register account |
| `/irc/accounts/login` | POST | Server Key | Login (verify password) |
| `/irc/accounts/{id}` | GET | Server Key | Get account |
| `/irc/accounts/{id}` | PUT | Server Key | Update account |
| `/irc/accounts/{id}/metadata` | POST | Server Key | Set user metadata |
| `/irc/accounts/verify/{code}` | GET | Server Key | Verify email |
| `/irc/channels/register` | POST | Server Key | Register channel |
| `/irc/channels/{id}` | GET | Server Key | Get channel |
| `/irc/channels/{id}` | PUT | Server Key | Update channel |
| `/irc/channels/{id}/metadata` | POST | Server Key | Set channel metadata |
| `/irc/channels/{id}/permissions` | POST | Server Key | Set channel permissions |

### Upload Image

**Endpoint:** `POST /upload`

**Authentication:** JWT token required

Upload an image using one of three methods. All methods return the same response format.

**Image Processing:** All uploaded images are automatically processed:
- Resized to fit within 1080p resolution (1920x1080 max) when compression is enabled
- Converted to JPEG format when needed
- All existing EXIF data is stripped for privacy
- Custom metadata is added as JPEG comments containing the uploader's nick:account and expiration timestamps

#### Method 1: JSON URL Upload
Perfect for importing images from external sources.

**Request:**
```bash
curl -X POST http://localhost:8080/upload \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/image.jpg"}'
```

**JSON Payload:**
```json
{
  "url": "https://example.com/image.jpg"
}
```

#### Method 2: Multipart Form Upload
Standard HTML form upload—works with any HTTP client.

**Request:**
```bash
curl -X POST http://localhost:8080/upload \
  -F "image=@/path/to/image.jpg"
```

**Form Field:** `image` (required)

#### Method 3: Raw Binary Upload
Send image bytes directly with proper content-type header.

**Request:**
```bash
curl -X POST http://localhost:8080/upload \
  -H "Content-Type: image/jpeg" \
  --data-binary @/path/to/image.jpg
```

**Supported Content-Types:** `image/jpeg`, `image/png`, `image/gif`, `image/webp`, etc.

#### Success Response

**Status:** `200 OK`

```json
{
  "saved_url": "http://localhost:8080/images/1759624622919675760.jpg"
}
```

#### Error Responses

**Status:** `400 Bad Request`
```
Failed to parse multipart form
Invalid JSON
Failed to get uploaded file
```

**Status:** `405 Method Not Allowed`
```
Method not allowed
```

**Status:** `500 Internal Server Error`
```
Failed to download image
Failed to save image
```

### Access Image

**Endpoint:** `GET /images/{filename}`

Retrieve an uploaded image by its filename.

**Request:**
```bash
curl http://localhost:8080/images/1759624622919675760.jpg
```

**Response:** Image binary data with appropriate `Content-Type` header

**Status Codes:**
- `200 OK` - Image found and returned
- `404 Not Found` - Image expired or doesn't exist

## Image Lifecycle

```
Upload → Stored (2 minutes) → Automatically Deleted
```

All uploaded images are **automatically deleted 2 minutes** after upload. This ensures:
- Privacy protection
- Disk space management
- No manual cleanup required

**Status:** `404 Not Found`
```
Image expired or doesn't exist
```

## Avatar Uploads

Upload permanent avatar images for users and channels. Unlike regular image uploads, avatars are **never automatically deleted** and only one avatar per user/channel is allowed.

### User Avatars

Upload a permanent avatar for your IRC account.

**Endpoint:** `POST /upload/avatar/user`

**Requirements:**
- Valid JWT token required
- `account` field must be present in JWT
- Only one avatar per account (old avatars are automatically replaced)

**Request:**
```bash
curl -X POST http://localhost:8080/upload/avatar/user \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "image=@avatar.jpg"
```

**Response:**
```json
{
  "saved_url": "/images/avatar_user_testnick_1759624622919675760.jpg"
}
```

### Channel Avatars

Upload a permanent avatar for an IRC channel.

**Endpoint:** `POST /upload/avatar/channel/{channel}`

**Requirements:**
- Valid JWT token required
- `account` field must be present in JWT
- User must have channel operator (`o`), admin (`a`), or owner (`q`) permissions
- Only one avatar per channel (old avatars are automatically replaced)

**Request:**
```bash
curl -X POST http://localhost:8080/upload/avatar/channel/#mychannel \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "image=@channel-avatar.jpg"
```

**Response:**
```json
{
  "saved_url": "/images/avatar_channel_#mychannel_1759624622919675760.jpg"
}
```

**Permission Error:**
```json
{
  "error": "Channel operator/admin/owner permission required"
}
```

### Avatar Image Processing

Avatars undergo the same processing as regular uploads:
- Resized to fit within configured dimensions when compression is enabled
- Converted to JPEG format when needed
- All existing EXIF data is stripped for privacy
- Custom metadata is added as JPEG comments containing the uploader's nick:account and permanent timestamps

### Avatar Lifecycle

```
Upload → Stored Permanently → Replaced on next upload
```

Avatars are **never automatically deleted** but are replaced when the same user/channel uploads a new avatar.

## JWT Authentication for IRC Clients

This backend supports JWT-based authentication using the IRCv3 `extjwt` extension, allowing IRC clients to securely access privileged endpoints (e.g., IRC server information) without exposing credentials.

### Prerequisites

- UnrealIRCd server with `extjwt` module enabled
- IRC client that supports `EXTJWT` command
- `JWT_SECRET` environment variable set on the backend

### How It Works

1. **IRC Server Generates Token**: When you send `EXTJWT *` in IRC, the server creates a signed JWT containing your user info (nick, account, modes).
2. **Client Receives Token**: The JWT is sent back via IRC protocol.
3. **Client Uses Token**: Include the JWT in API requests to access protected endpoints.

**Note:** The `/irc/accounts/login` endpoint is for IRC servers to verify passwords during login, not for clients to obtain JWTs. JWTs are provided by the IRC server via the `EXTJWT` command.

### IRC Client Implementation

#### Step 1: Request JWT Token

Send the `EXTJWT` command to your IRC server:

```
/EXTJWT *
```

The server responds with something like:
```
EXTJWT * * eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Step 2: Extract the Token

Parse the IRC message to extract the JWT token (the long base64 string).

#### Step 3: Use Token in API Requests

Include the token in the `Authorization` header for protected endpoints:

```bash
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  http://localhost:8080/irc/users
```

### Protected Endpoints

All `/irc/*` endpoints require:
- Valid JWT token
- User must be an IRC operator (`umodes` includes `"o"`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/irc/users` | GET | List all IRC users |
| `/irc/channels` | GET | List all channels |
| `/irc/bans` | GET | List server bans |
| `/irc/stats` | GET | Server statistics |
| `/irc/server-uptime?server=name` | GET | Server uptime info |

#### Example: Get IRC Users

```bash
# First get JWT token via IRC
/EXTJWT *

# Then use it in API
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:8080/irc/users
```

**Response:**
```json
[
  {
    "name": "user1",
    "hostname": "example.com",
    "ip": "192.168.1.1",
    "connected_since": 1638360000,
    "modes": ["o"]
  }
]
```

### JavaScript IRC Client Example

```javascript
// Assuming you have an IRC client library
const ircClient = new IRCClient('irc.example.com', 'mynick');

// Connect and request JWT
ircClient.connect().then(() => {
  ircClient.send('EXTJWT *');
});

// Listen for EXTJWT response
ircClient.on('message', (message) => {
  if (message.command === 'EXTJWT') {
    const jwtToken = message.params[2]; // Extract token
    
    // Use token for API calls
    fetch('http://localhost:8080/irc/users', {
      headers: {
        'Authorization': `Bearer ${jwtToken}`
      }
    })
    .then(res => res.json())
    .then(users => console.log('IRC Users:', users));
  }
});
```

### Python IRC Client Example

```python
import irc.client
import requests

class JWTIRCClient(irc.client.SimpleIRCClient):
    def __init__(self, server, nick):
        super().__init__()
        self.server = server
        self.nick = nick
        self.jwt_token = None

    def on_welcome(self, connection, event):
        # Request JWT token
        connection.send_raw('EXTJWT *')

    def on_extjwt(self, connection, event):
        # Parse EXTJWT response
        self.jwt_token = event.arguments[2]
        print(f"Received JWT: {self.jwt_token}")
        
        # Use token for API
        headers = {'Authorization': f'Bearer {self.jwt_token}'}
        response = requests.get('http://localhost:8080/irc/users', headers=headers)
        users = response.json()
        print('IRC Users:', users)

# Usage
client = JWTIRCClient('irc.example.com', 'mynick')
client.connect('irc.example.com', 6667, 'mynick')
client.start()
```

### Token Expiration

- Tokens expire in **30 seconds** (IRC server setting)
- Clients must request fresh tokens via `EXTJWT *` before each API call
- Expired tokens return `401 Unauthorized`

### Error Responses

**Invalid/Missing Token:**
```
HTTP 401 Unauthorized
Authorization header required
```

**Not an IRC Operator:**
```
HTTP 403 Forbidden
IRCop status required
```

**Token Expired:**
```
HTTP 401 Unauthorized
Invalid token
```

## IRC Server Management Endpoints

These endpoints are intended **only for the IRC server** to manage accounts and channels. They require the `X-ObsidianIRC-Key` header with the server API key.

### Prerequisites

- `IRC_SERVER_KEY` environment variable set
- Requests must include: `X-ObsidianIRC-Key: <server_key>`

### Account Management

#### Register Account

**Endpoint:** `POST /irc/accounts/register`

**Request:**
```json
{
  "account_name": "johndoe",
  "email_address": "john@example.com",
  "password_b64": "cGFzc3dvcmQ="  // base64 encoded password
}
```

**Response:**
```json
{
  "success": true,
  "code": "ACCOUNT_CREATED",
  "message": "Account created successfully",
  "data": {
    "user_id": 1,
    "verification_code": "abc123..."
  }
}
```

#### Login

**Endpoint:** `POST /irc/accounts/login`

**Authentication:** Server API key required

Used by IRC servers to verify user passwords during login. Returns user information on successful authentication.

**Request:**
```json
{
  "account_name": "johndoe",
  "password_b64": "cGFzc3dvcmQ="
}
```

**Response:**
```json
{
  "success": true,
  "code": "LOGIN_SUCCESS",
  "message": "Login successful",
  "data": {
    "id": 1,
    "account_name": "johndoe",
    "email_address": "john@example.com",
    "date_registered": "2025-10-12T10:00:00Z",
    "last_logged_in": "2025-10-12T12:00:00Z"
  }
}
```

#### Update Account

**Endpoint:** `PUT /irc/accounts/{id}`

**Request:**
```json
{
  "email_address": "newemail@example.com",
  "password_b64": "bmV3cGFzcw=="
}
```

#### Get Account

**Endpoint:** `GET /irc/accounts/{id}`

#### Set User Metadata

**Endpoint:** `POST /irc/accounts/{id}/metadata`

**Request:**
```json
{
  "key": "avatar",
  "value": "https://example.com/avatar.jpg"
}
```

#### Verify Email

**Endpoint:** `GET /irc/accounts/verify/{code}`

### Channel Management

#### Register Channel

**Endpoint:** `POST /irc/channels/register`

**Request:**
```json
{
  "channel_name": "#mychannel",
  "channel_topic": "Welcome to my channel",
  "modes": "+nt"
}
```

#### Update Channel

**Endpoint:** `PUT /irc/channels/{id}`

**Request:**
```json
{
  "channel_topic": "Updated topic",
  "modes": "+nt"
}
```

#### Get Channel

**Endpoint:** `GET /irc/channels/{id}`

#### Set Channel Metadata

**Endpoint:** `POST /irc/channels/{id}/metadata`

**Request:**
```json
{
  "key": "description",
  "value": "A cool channel"
}
```

#### Set Channel Permissions

**Endpoint:** `POST /irc/channels/{id}/permissions`

**Request:**
```json
{
  "user_id": 1,
  "permissions": "o"  // IRC mode: o=op, ao=auto-op, qo=quiet-op, v=voice
}
```

### Database Schema

The backend uses SQLite with the following tables:

- **users**: id, account_name, email_address, date_registered, last_logged_in, password_hash
- **user_metadata**: id, user_id, key, value
- **channels**: id, channel_name, channel_topic, modes
- **channel_metadata**: id, channel_id, key, value
- **channel_permissions**: id, user_id, channel_id, permissions
- **email_verifications**: id, user_id, code, expires_at, verified

### Security Notes

- Passwords are hashed with Argon2id
- All endpoints require the server API key
- Email verification codes expire in 24 hours
- Permissions use IRC mode syntax (o, ao, qo, v)

### Security Notes

- **JWT Authentication**: Tokens are signed by the IRC server using `JWT_SECRET`
- **Server API Key**: All `/irc/accounts/*` and `/irc/channels/*` endpoints require `X-ObsidianIRC-Key` header
- **IRC Operator Check**: IRC data endpoints require the user to have operator status (`"o"` in `umodes`)
- **Password Security**: Passwords are hashed with Argon2id using configurable salt size (`PASSWORD_SALT_SIZE`)
- **File Uploads**: Require valid JWT but not operator status
- **Image Expiration**: Automatic cleanup prevents storage abuse

## Image Lifecycle

```
Upload → Stored (2 minutes) → Automatically Deleted
```

All uploaded images are **automatically deleted 2 minutes** after upload. This ensures:
- Privacy protection
- Disk space management
- No manual cleanup required

> **Note:** Accessing an expired image URL will return a `404 Not Found` error.

## Project Structure

```
backend/
├── main.go              # Main server implementation and routing
├── auth.go              # JWT and server key authentication middleware
├── account.go           # Account management endpoints
├── channel.go           # Channel management endpoints
├── irc.go               # IRC RPC communication handlers
├── db.go                # SQLite database operations
├── go.mod               # Go module definition
├── go.sum               # Go module checksums
├── .env                 # Environment variables (create this)
├── images/              # Temporary image storage (auto-created)
├── ai_docs/             # Documentation for IRC extensions
├── README.md            # This file
└── backend              # Compiled binary (after go build)
```

## Building for Production

```bash
# Enable CGO for SQLite support
export CGO_ENABLED=1

# Build optimized binary
go build -ldflags="-s -w" -o backend .

# Run in background
nohup ./backend > server.log 2>&1 &

# Or use systemd, docker, or your preferred deployment method
```

## Testing

### Quick Test Suite

```bash
# Test 1: URL Upload
curl -X POST http://localhost:8080/upload \
  -H "Content-Type: application/json" \
  -d '{"url": "https://httpbin.org/image/png"}'

# Test 2: File Upload
echo "test image" > test.jpg
curl -X POST http://localhost:8080/upload \
  -F "image=@test.jpg"

# Test 3: Binary Upload
curl -X POST http://localhost:8080/upload \
  -H "Content-Type: image/jpeg" \
  --data-binary @test.jpg

# Verify image is accessible
curl -I http://localhost:8080/images/{filename_from_response}

# Wait 2+ minutes and verify expiration
sleep 120
curl -I http://localhost:8080/images/{filename_from_response}  # Should return 404
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Server port |
| `DELETE_TIMEOUT_MINUTES` | `2` | Image auto-deletion time in minutes |
| `MAX_UPLOAD_SIZE_MB` | `32` | Maximum upload size in MB |
| `JWT_SECRET` | (required) | Secret key for JWT token verification |
| `IRC_SERVER_KEY` | (required) | API key for server-only endpoints |
| `PASSWORD_SALT_SIZE` | `32` | Size of salt for password hashing in bytes |
| `UNREALIRCD_WS_URL` | `wss://127.0.0.1:8600/` | IRC server WebSocket URL |
| `UNREALIRCD_API_USERNAME` | `adminpanel` | IRC API username |
| `UNREALIRCD_API_PASSWORD` | `password` | IRC API password |
| `IMAGE_COMPRESSION_ENABLED` | `false` | Enable image compression and resizing |
| `IMAGE_MAX_WIDTH` | `1920` | Maximum width for compressed images |
| `IMAGE_MAX_HEIGHT` | `1080` | Maximum height for compressed images |
| `IMAGE_JPEG_QUALITY` | `85` | JPEG quality (1-100) when converting to JPEG |
| `IMAGE_CONVERT_TO_JPEG` | `false` | Force conversion of all images to JPEG format |

### Example .env file

```bash
PORT=8080
DELETE_TIMEOUT_MINUTES=2
MAX_UPLOAD_SIZE_MB=32
JWT_SECRET=your_jwt_secret_here
IRC_SERVER_KEY=your_server_key_here
PASSWORD_SALT_SIZE=32
UNREALIRCD_WS_URL=wss://127.0.0.1:8600/
UNREALIRCD_API_USERNAME=adminpanel
UNREALIRCD_API_PASSWORD=password
IMAGE_COMPRESSION_ENABLED=false
IMAGE_MAX_WIDTH=1920
IMAGE_MAX_HEIGHT=1080
IMAGE_JPEG_QUALITY=85
IMAGE_CONVERT_TO_JPEG=false
```

### Currently configurable values:

| Setting | Environment Variable | Default |
|---------|---------------------|---------|
| Port | `PORT` | `8080` |
| Image deletion timeout | `DELETE_TIMEOUT_MINUTES` | `2 minutes` |
| Max upload size | `MAX_UPLOAD_SIZE_MB` | `32MB` |
| Password salt size | `PASSWORD_SALT_SIZE` | `32 bytes` |
| Image compression | `IMAGE_COMPRESSION_ENABLED` | `false` |
| Max image width | `IMAGE_MAX_WIDTH` | `1920px` |
| Max image height | `IMAGE_MAX_HEIGHT` | `1080px` |
| JPEG quality | `IMAGE_JPEG_QUALITY` | `85%` |
| Force JPEG conversion | `IMAGE_CONVERT_TO_JPEG` | `false` |

## Example Use Cases

- **Temporary Screenshot Sharing** - Share screenshots that auto-delete
- **Image Proxy Service** - Download and cache external images temporarily
- **Development & Testing** - Quick image hosting for dev environments
- **Mobile App Backend** - Temporary image uploads for user avatars/previews
- **Bot Integration** - Process and host images from chat bots

## Integration Examples

### JavaScript (Fetch API)

```javascript
// URL Upload
const uploadFromUrl = async (imageUrl) => {
  const response = await fetch('http://localhost:8080/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: imageUrl })
  });
  return await response.json();
};

// File Upload
const uploadFile = async (file) => {
  const formData = new FormData();
  formData.append('image', file);
  const response = await fetch('http://localhost:8080/upload', {
    method: 'POST',
    body: formData
  });
  return await response.json();
};
```

### Python (Requests)

```python
import requests

# URL Upload
def upload_from_url(image_url):
    response = requests.post(
        'http://localhost:8080/upload',
        json={'url': image_url}
    )
    return response.json()

# File Upload
def upload_file(file_path):
    with open(file_path, 'rb') as f:
        response = requests.post(
            'http://localhost:8080/upload',
            files={'image': f}
        )
    return response.json()
```

### HTML Form

```html
<form action="http://localhost:8080/upload" method="POST" enctype="multipart/form-data">
  <input type="file" name="image" accept="image/*" required>
  <button type="submit">Upload Image</button>
</form>
```

## Performance

- **Concurrency:** Handles multiple simultaneous uploads
- **Memory:** Efficient streaming for large files
- **Startup:** < 50ms cold start
- **Response Time:** < 10ms for local uploads, variable for URL downloads

## Security Considerations

**This is a basic implementation. For production use, consider:**

- Rate limiting to prevent abuse
- Authentication/authorization
- File type validation beyond extension
- Size limits per user/IP
- HTTPS/TLS encryption
- CORS configuration (currently allows all origins for development)
- Input sanitization
- Virus scanning for uploaded files

## License

Open source - use freely for any purpose.

## Troubleshooting

### SQLite Driver Error
```bash
# Enable CGO for SQLite support
export CGO_ENABLED=1
go build
```

### Port Already in Use
```bash
# Find and kill existing process
lsof -i :8080
kill -9 <PID>
```

### Permission Denied (images directory)
```bash
mkdir -p images
chmod 755 images
```

### Connection Refused
- Ensure server is running: `ps aux | grep backend`
- Check server logs: `tail -f server.log`
- Verify port is listening: `netstat -an | grep 8080`

### IRC Connection Issues
- Verify IRC server is running on port 8600
- Check `UNREALIRCD_*` environment variables
- Ensure JSON-RPC is enabled on the IRC server

## Future Enhancements

- [ ] Configurable expiration time via environment variables
- [ ] Multiple storage backends (S3, local, memory)
- [ ] Image transformation (resize, compress, format conversion)
- [ ] Upload history and analytics
- [ ] Webhook notifications on upload/expiration
- [ ] Docker containerization
- [ ] Health check endpoint
- [ ] Prometheus metrics

---

**Built with Go** | **Server ready in < 100 lines of code**
