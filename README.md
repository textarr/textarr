# Textarr 📱🎬

A multi-platform messaging bot that lets you request movies and TV shows using natural language. It uses AI to understand your requests and submits them to Sonarr (TV) or Radarr (Movies). Works with SMS (Twilio), Telegram, Discord, and Slack.

## Features

- 📱 **Multi-Platform** - SMS, Telegram, Discord, and Slack support
- 🤖 **AI-Powered** - Natural language understanding (OpenAI/Anthropic/Google)
- 📺 **Sonarr Integration** - Automatically add TV shows
- 🎬 **Radarr Integration** - Automatically add movies
- 🔒 **User Authorization** - Only authorized users can make requests
- 💬 **Conversational** - Multi-turn conversations with interactive buttons
- 🖥️ **Web UI** - Beautiful configuration interface
- 👤 **Multi-Identity Users** - One user can link SMS, Telegram, Discord, and Slack accounts

## Quick Start

### Prerequisites

- Bun 1.0+
- At least one messaging platform:
  - Twilio account (for SMS)
  - Telegram Bot Token
  - Discord Bot Token
  - Slack App (Bot Token + Signing Secret)
- OpenAI, Anthropic, or Google API key
- Sonarr and/or Radarr running

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/textarr.git
cd textarr

# Install dependencies
bun install

# Start the application
bun run dev

# Open http://localhost:3030 to configure
```

### Configuration

**Option 1: Web Interface (Recommended)**

1. Start the application: `bun run dev`
2. Open http://localhost:3030
3. Fill in your configuration
4. Click "Save Configuration"
5. Restart the application

**Option 2: Config File**

Create `config/config.json`:

```json
{
  "ai": {
    "provider": "openai",
    "model": "gpt-4-turbo",
    "openaiApiKey": "sk-..."
  },
  "twilio": {
    "enabled": true,
    "accountSid": "AC...",
    "authToken": "...",
    "phoneNumber": "+1234567890"
  },
  "telegram": {
    "enabled": true,
    "botToken": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
    "usePolling": true
  },
  "discord": {
    "enabled": false,
    "botToken": "..."
  },
  "slack": {
    "enabled": false,
    "botToken": "xoxb-...",
    "signingSecret": "...",
    "useSocketMode": true,
    "appToken": "xapp-..."
  },
  "sonarr": {
    "url": "http://localhost:8989",
    "apiKey": "...",
    "qualityProfileId": 1,
    "rootFolder": "/tv"
  },
  "radarr": {
    "url": "http://localhost:7878",
    "apiKey": "...",
    "qualityProfileId": 1,
    "rootFolder": "/movies"
  },
  "users": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "John Doe",
      "isAdmin": true,
      "identities": {
        "sms": "+1234567890",
        "telegram": "123456789",
        "discord": "123456789012345678"
      },
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

> **Note:** Admin credentials for the web dashboard are stored separately and created during first-time setup. They are not part of the config file.

### Twilio Webhook Setup

1. Go to [Twilio Console](https://console.twilio.com)
2. Navigate to Phone Numbers → Manage → Active Numbers
3. Click your phone number
4. Under "Messaging", set webhook URL:
   - **When a message comes in**: `https://your-domain.com/webhooks/sms`
   - **HTTP Method**: POST

For local development, use [ngrok](https://ngrok.com):

```bash
ngrok http 3030
# Use the ngrok URL in Twilio
```

### Telegram Bot Setup

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow the prompts
3. Copy the bot token (e.g., `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
4. Enable the bot in the web UI and paste the token
5. (Optional) Send `/setprivacy` to BotFather and select "Disable" to allow the bot to see group messages

To find a user's Telegram ID, have them message your bot, then visit:
```
https://api.telegram.org/bot<TOKEN>/getUpdates
```

### Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" section and click "Add Bot"
4. Click "Reset Token" to get your bot token
5. **Important**: Under "Privileged Gateway Intents", enable:
   - Message Content Intent
6. Go to OAuth2 → URL Generator:
   - Select "bot" scope
   - Select permissions: "Send Messages", "Read Message History"
   - Copy the generated URL and open it to invite the bot to your server
7. Enable Discord in the web UI and paste the bot token

### Slack App Setup

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Create a new app "From scratch"
3. Go to OAuth & Permissions → Bot Token Scopes and add:
   - `chat:write`
   - `im:history`
   - `im:read`
   - `im:write`
4. Click "Install to Workspace" and copy the Bot User OAuth Token
5. Go to Basic Information → App Credentials and copy the Signing Secret
6. **Socket Mode (Recommended)**:
   - Go to Socket Mode and enable it
   - Create an App-Level Token with `connections:write` scope
   - Copy the App Token (starts with `xapp-`)
7. **Event Subscriptions** (if not using Socket Mode):
   - Enable Events and set Request URL to `https://your-domain.com/webhooks/slack/events`
   - Subscribe to bot events: `message.im`
8. Enable Slack in the web UI and fill in all tokens

## Web Interface

The bot includes a beautiful dark-themed configuration interface at http://localhost:3030

![Web UI Screenshot](docs/web-ui.png)

**First-time setup:** Create an admin account when you first access the dashboard.

**Returning users:** Login with your username and password.

Features:
- Secure login with session-based authentication
- Configure all settings visually
- Test connections to Sonarr/Radarr
- Fetch quality profiles and root folders automatically
- Test AI API keys
- Real-time status indicator
- User menu with logout and password change

## Usage

Text your Twilio number with natural language requests:

### Adding Media

```
You: Add Breaking Bad
Bot: 📺 Found: Breaking Bad (2008) - TV Show ⭐ 9.5 | 5 seasons
     
     Reply YES to add, or NO to cancel.

You: yes
Bot: ✅ 📺 Breaking Bad added to Sonarr!
     It will start downloading shortly.
```

### Multiple Results

```
You: Add Dune
Bot: 🔍 Found 3 results for "Dune":
     
     1. 🎬 Dune (2021) ⭐8.0
     2. 🎬 Dune (1984) ⭐6.3
     3. 🎬 Dune: Part Two (2024) ⭐8.5
     
     Reply with a number to select.

You: 1
Bot: 🎬 Selected: Dune (2021)
     
     Reply YES to add, or NO to cancel.
```

### Check Status

```
You: What's downloading?
Bot: 📥 Currently downloading:
     • Breaking Bad S01E01 - 45% (10:23)
     • Dune (2021) - 12% (1:45:00)
```

### Commands

| Command | Description |
|---------|-------------|
| `Add [title]` | Add a movie or TV show |
| `Add [title] movie` | Explicitly add a movie |
| `Add [title] show` | Explicitly add a TV show |
| `Status` | Check download queue |
| `Help` | Show help message |
| `Yes` / `No` | Confirm or cancel |
| `1`, `2`, `3`... | Select from list |

### Recommendations

Ask for suggestions naturally:

| Query Type | Examples |
|------------|----------|
| **Trending** | "What's trending?", "What's hot right now?" |
| **Popular** | "What should I watch?", "What's good?" |
| **Top Rated** | "Best rated shows", "Highest rated movies" |
| **New Releases** | "Any new movies?", "What just came out?" |
| **Coming Soon** | "What movies are coming out?" |
| **Airing Today** | "What's on TV today?" |
| **By Genre** | "Recommend a horror movie", "Comedy shows" |
| **Similar** | "Something like Breaking Bad" |
| **By Theme** | "Movies about time travel", "Zombie shows" |
| **By Era** | "80s horror movies", "Shows from 2024" |
| **By Provider** | "What's good on Netflix?" |
| **By Network** | "HBO shows", "Netflix originals" |
| **Combined** | "Highly rated sci-fi from 2024" |

Example:

```
You: What's trending?
Bot: ⭐ Trending Content:

1. 🎬 Dune: Part Two (2024) ⭐8.5
2. 📺 Fallout (2024) ⭐8.7
3. 🎬 Godzilla x Kong (2024) ⭐7.1
4. 📺 3 Body Problem (2024) ⭐7.8
5. 🎬 Civil War (2024) ⭐7.2

Reply with a number, or search for something else.

You: 2
Bot: 📺 Found: Fallout (2024) - TV Show ⭐ 8.7 | 1 season

Which seasons?
1. All
2. First season
3. Latest season
4. Future only

Reply with a number.
```

## AI Providers

### OpenAI (Default)

Supported models:
- `gpt-4-turbo` (recommended)
- `gpt-4o`
- `gpt-4o-mini`
- `gpt-3.5-turbo`

### Anthropic

Supported models:
- `claude-sonnet-4-20250514`
- `claude-3-5-sonnet-20241022`
- `claude-3-5-haiku-20241022`
- `claude-3-opus-20240229`

## Development

```bash
# Run in development mode (with hot reload)
bun run dev

# Run tests
bun test

# Run tests with coverage
bun test --coverage

# Lint
bun run lint

# Format
bun run format

# Type check
bun run typecheck

# Build for production
bun run build
```

## Deployment

### Docker (Recommended)

```bash
# Build and run with Docker Compose
docker-compose up -d

# Or build manually
docker build -t textarr .
docker run -d \
  -p 3030:3030 \
  -v $(pwd)/config:/app/config \
  -e PUID=1000 \
  -e PGID=1000 \
  textarr
```

**Environment Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `PUID` | `1000` | User ID to run as (matches your host user for volume permissions) |
| `PGID` | `1000` | Group ID to run as |
| `NODE_ENV` | `development` | Set to `production` for secure cookies |
| `LOG_LEVEL` | `info` | Logging level: debug, info, warn, error |

To find your user's PUID/PGID, run `id` in your terminal.

### Unraid

#### Community Applications (Recommended)

Once available in Community Applications:

1. Open the **Apps** tab in Unraid
2. Search for "Textarr"
3. Click **Install**
4. Configure the required settings:
   - **WebUI Port**: `3030` (or your preferred port)
   - **Config Path**: `/mnt/user/appdata/textarr` (stores config.json)
5. Click **Apply**
6. Access the Web UI at `http://your-unraid-ip:3030` to complete configuration

#### Manual Docker Installation on Unraid

If the app isn't in Community Applications yet, you can install manually:

1. Go to the **Docker** tab in Unraid
2. Click **Add Container**
3. Fill in the following:

| Field | Value |
|-------|-------|
| **Name** | `textarr` |
| **Repository** | `ghcr.io/yourusername/textarr:latest` |
| **Network Type** | `bridge` |
| **WebUI** | `http://[IP]:[PORT:3030]/` |

4. Add the following **Port Mapping**:

| Container Port | Host Port | Description |
|----------------|-----------|-------------|
| `3030` | `3030` | Web UI & Webhook |

5. Add the following **Path Mapping**:

| Container Path | Host Path | Description |
|----------------|-----------|-------------|
| `/app/config` | `/mnt/user/appdata/textarr` | Configuration directory |

6. Add **Environment Variables**:

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `LOG_LEVEL` | `info` |

7. Click **Apply**

#### Connecting to Sonarr/Radarr on Unraid

When configuring the bot to connect to Sonarr/Radarr running on the same Unraid server:

- **From the same Docker network**: Use container names (e.g., `http://sonarr:8989`, `http://radarr:7878`)
- **From host network**: Use Unraid's IP address (e.g., `http://192.168.1.100:8989`)
- **From bridge network**: Use `http://host.docker.internal:8989` or the Unraid IP

#### Exposing Webhooks for SMS (Twilio)

If you're using SMS via Twilio, you need a public URL for Twilio to send webhook callbacks. **Telegram, Discord, and Slack don't require this** - they use polling or direct connections.

**Option 1: Tailscale Funnel (Recommended)**

Tailscale Funnel securely exposes your local service to the internet without opening ports on your router. The Unraid Tailscale plugin makes this easy with built-in container options.

**Prerequisites:**
1. Install the **Tailscale** plugin from Unraid Community Apps
2. Enable Funnel in the [Tailscale admin console](https://login.tailscale.com/admin/acls) by adding to your ACL:
   ```json
   "nodeAttrs": [
     {
       "target": ["autogroup:member"],
       "attr": ["funnel"]
     }
   ]
   ```

**Container Setup:**

When adding/editing the Textarr container in Unraid, configure these Tailscale options:

| Setting | Value |
|---------|-------|
| **Use Tailscale** | On |
| **Tailscale Hostname** | `textarr` (or your preferred name) |
| **Tailscale Serve** | Funnel |
| **Tailscale Serve Port** | `3030` |

Leave other Tailscale settings at their defaults unless you have specific needs.

After deploying, check the container log and follow the link to register the container to your Tailnet. Your public URL will be:
```
https://textarr.your-tailnet.ts.net
```

In Twilio, set your webhook URL to:
```
https://textarr.your-tailnet.ts.net/webhooks/sms
```

> **Note:** Funnel only works on ports 443, 8443, or 10000. The plugin automatically handles the port mapping from HTTPS 443 to your container's port 3030.

**Option 2: Cloudflare Tunnel**

Cloudflare Tunnel (formerly Argo Tunnel) provides a similar solution using Cloudflare's network.

1. Create a tunnel in the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/)
2. Install the **cloudflared** container from Community Apps, or add it to your Docker setup:
   ```yaml
   cloudflared:
     image: cloudflare/cloudflared:latest
     container_name: cloudflared-tunnel
     restart: unless-stopped
     command: tunnel run
     environment:
       - TUNNEL_TOKEN=your-tunnel-token
   ```
3. Configure the tunnel to route traffic to `http://your-unraid-ip:3030`
4. Use the tunnel's public URL in your Twilio webhook settings

> **Tip:** The `docker-compose.yml` in this repo includes a commented cloudflared example.

### Manual

```bash
# Build
bun run build

# Start
NODE_ENV=production bun dist/index.js
```

## API Endpoints

### Authentication (Public)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/status` | GET | Check auth status and if setup is needed |
| `/api/auth/csrf` | GET | Get CSRF token for form submissions |
| `/api/auth/setup` | POST | Create admin account (first-time only) |
| `/api/auth/login` | POST | Authenticate with username/password |
| `/api/auth/logout` | POST | End session |
| `/api/auth/change-password` | POST | Change password (requires auth) |

### Configuration (Requires Authentication)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/config` | GET | Get current configuration (masked) |
| `/api/config` | POST | Save configuration |
| `/api/config/raw` | GET | Get raw configuration (with API keys) |
| `/api/config/test-connection` | POST | Test Sonarr/Radarr connection |
| `/api/config/test-ai` | POST | Test AI API key |
| `/api/config/test-tmdb` | POST | Test TMDB API key |
| `/api/config/test-twilio` | POST | Test Twilio credentials |
| `/api/config/quality-profiles` | POST | Fetch quality profiles from Sonarr/Radarr |
| `/api/config/root-folders` | POST | Fetch root folders from Sonarr/Radarr |
| `/api/config/tags` | POST | Fetch tags from Sonarr/Radarr |
| `/api/config/ai-models` | POST | Fetch available AI models |

### User Management (Requires Authentication)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/users` | GET | List all users |
| `/api/users` | POST | Add a new user (with identities) |
| `/api/users/:id` | PUT | Update a user by ID |
| `/api/users/:id` | DELETE | Delete a user by ID |
| `/api/users/:id/reset-quota` | POST | Reset user quota by ID |

**User Identities:**
Each user can have multiple platform identities:
- `sms` - Phone number for SMS/Twilio
- `telegram` - Telegram user ID
- `discord` - Discord user ID
- `slack` - Slack user ID

### Quota Management (Requires Authentication)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/quotas` | GET | Get quota configuration |
| `/api/quotas` | PUT | Update quota configuration |

### Webhooks (Twilio Signature Validation)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhooks/sms` | POST | Twilio SMS webhook |
| `/webhooks/sms/status` | POST | Twilio status callback |
| `/webhooks/sms/health` | GET | Webhook health check |

### Health (Public)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Web dashboard UI |
| `/health` | GET | Basic health check |
| `/health/detailed` | GET | Health check with service status |

## Architecture

```text
┌─────────────────┐     ┌─────────────────┐
│   User Phone    │────▶│     Twilio      │──┐
└─────────────────┘     └─────────────────┘  │
┌─────────────────┐     ┌─────────────────┐  │    ┌─────────────────┐
│   Telegram      │────▶│  grammy Bot     │──┼───▶│  Fastify Server │
└─────────────────┘     └─────────────────┘  │    │   (Your App)    │
┌─────────────────┐     ┌─────────────────┐  │    └────────┬────────┘
│   Discord       │────▶│  discord.js     │──┤             │
└─────────────────┘     └─────────────────┘  │    ┌────────┴────────┐
┌─────────────────┐     ┌─────────────────┐  │    │                 │
│   Slack         │────▶│  Slack Bolt     │──┘    ▼                 ▼
└─────────────────┘     └─────────────────┘   ┌─────────┐    ┌─────────┐
                                              │ Sonarr  │    │ Radarr  │
                              ┌─────────┐     │(TV Shows)│    │(Movies) │
                              │AI Parser│     └─────────┘    └─────────┘
                              │OpenAI/  │
                              │Anthropic│
                              │/Google  │
                              └─────────┘
```

## Tech Stack

- **Runtime**: Bun 1.0+
- **Language**: TypeScript 5.7
- **Framework**: Fastify 5
- **AI SDK**: Vercel AI SDK 5 (OpenAI/Anthropic/Google)
- **Validation**: Zod
- **Messaging**: Twilio (SMS), grammy (Telegram), discord.js (Discord), @slack/bolt (Slack)
- **Testing**: Bun Test

## Security

### Web Dashboard Authentication

The web dashboard requires authentication to access all configuration and management features. The first time you access the dashboard, you'll be prompted to create an admin account.

**Security Features:**

| Feature | Implementation |
|---------|----------------|
| Password hashing | bcrypt with 12 salt rounds |
| Session storage | Encrypted cookies (`@fastify/secure-session`) |
| Session lifetime | Browser session only (expires when browser closes) |
| CSRF protection | Double-submit cookie pattern |
| Rate limiting | 5 login attempts per 5 minutes, 100 requests/min global |
| Security headers | Helmet (CSP, X-Frame-Options, X-Content-Type-Options, etc.) |
| Cookie flags | `HttpOnly`, `Secure` (production), `SameSite=Strict` |

### First-Time Setup

When no admin account exists, the dashboard shows a setup screen:

1. Navigate to `http://localhost:3030`
2. Enter a username (minimum 3 characters)
3. Enter a password (minimum 8 characters)
4. Confirm the password
5. Click "Create Account"

After initial setup, you'll be automatically logged in. The setup endpoint is disabled once an admin account exists.

### Changing Your Password

**Via Web UI:**

1. Click your username in the top-right corner of the dashboard
2. Select "Change Password" from the dropdown menu
3. Enter your current password and new password
4. Click "Update Password"

**Via API:**

Make a POST request to `/api/auth/change-password` with:
```json
{
  "currentPassword": "your-current-password",
  "newPassword": "your-new-password"
}
```
Include the CSRF token in the `X-CSRF-Token` header. New password must be at least 8 characters.

### Messaging Security

- **User Authorization**: Only users with a linked identity on each platform can interact with the bot
- **Multi-Platform Support**: Users can link SMS, Telegram, Discord, and Slack accounts
- **Twilio Signature Validation**: SMS webhook requests are verified using Twilio's signature (production mode)
- **Rate Limiting**: Messaging endpoints are rate-limited per user (10 requests/minute)

### API Security

- **Authentication required** for all `/api/config/*`, `/api/users/*`, and `/api/quotas/*` endpoints
- **CSRF protection** on all state-changing requests (POST, PUT, DELETE)
- **Rate limiting** on all API routes (100 requests per minute)
- **No Sensitive Logging**: API keys and tokens are never logged
- **Masked Display**: Sensitive fields shown as `••••••••` in UI responses

### Environment Variables

For production deployments:

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Set to `production` for secure cookies | `development` |
| `SESSION_KEY_FILE` | Path to session encryption key file | `./config/.session-key` |
| `CONFIG_FILE` | Path to configuration file | `./config/config.json` |

### Session Key

A 32-byte session encryption key is automatically generated on first run and stored in `config/.session-key`. This file:

- Is created with `0600` permissions (owner read/write only)
- Should be excluded from version control (added to `.gitignore`)
- Should be backed up for production deployments (sessions become invalid if lost)

### Public Routes (No Authentication Required)

The following routes are accessible without authentication:

- `/api/auth/status` - Check authentication status
- `/api/auth/csrf` - Get CSRF token
- `/api/auth/login` - Login endpoint
- `/api/auth/setup` - Initial setup (disabled after first admin created)
- `/health`, `/health/detailed` - Health checks
- `/webhooks/*` - Twilio webhooks (protected by Twilio signature validation)

## Troubleshooting

### Bot not responding

1. Check Twilio webhook URL is correct
2. Verify your phone number is in allowed list
3. Check logs: `docker-compose logs -f`

### "Sonarr/Radarr connection failed"

1. Verify URLs are accessible from the bot
2. Check API keys are correct
3. Ensure Sonarr/Radarr are running

### AI parsing issues

1. Check your AI API key is valid
2. Verify you have credits/quota remaining
3. Try a different model (e.g., `gpt-4o-mini`)

### Configuration not loading

1. Check `config/config.json` exists and is valid JSON
2. Verify file permissions
3. Try using the web UI to reconfigure

### Dashboard login issues

**"Setup required" keeps appearing:**
- The admin account may not have been created successfully
- Check that `config/config.json` contains an `admin` section with a `passwordHash`
- Delete the `admin` section from `config/config.json` to restart the setup process

**"Invalid credentials" error:**
- Verify username and password are correct
- After 5 failed attempts, wait 5 minutes before trying again (rate limiting)

**Session keeps expiring:**
- Sessions expire when the browser closes (by design)
- Ensure cookies are enabled in your browser
- Check that you're accessing the dashboard from the same origin

**Lost admin password:**
1. Stop the application
2. Edit `config/config.json` and remove the entire `admin` section:
   ```json
   "admin": {
     "username": "...",
     "passwordHash": "..."
   }
   ```
3. Restart the application
4. Complete the initial setup again at `http://localhost:3030`

**CSRF token errors:**
- Refresh the page and try again
- Ensure JavaScript is enabled
- Clear browser cookies and reload

## License

MIT

## Contributing

Pull requests welcome! Please read the contributing guidelines first.
