# Deployment Guide

This guide covers deploying Textarr to Unraid with Cloudflare Tunnel for secure webhook handling.

## Architecture Overview

```text
Internet → Cloudflare Tunnel (encrypted) → Rate Limiter → Twilio Validation → Phone Allowlist → App
```

### Security Layers

| Layer | Protection | Implementation |
|-------|------------|----------------|
| Cloudflare Tunnel | No open ports, encrypted transit | cloudflared container |
| Rate Limiting | Prevents abuse/cost attacks | 10 req/min per phone number |
| Twilio Signature | Validates requests from Twilio | X-Twilio-Signature header |
| Phone Allowlist | Only authorized users | ALLOWED_PHONE_NUMBERS env var |
| Stealth Response | Hides bot existence | Empty 200 for unauthorized |

## Prerequisites

- Unraid server with Docker support
- Cloudflare account with a domain
- Twilio account with a phone number
- OpenAI, Anthropic, or Google AI API key
- Sonarr and Radarr installed and configured

## Step 1: Create Docker Hub Account (One-Time)

If publishing your own builds:

1. Create account at [Docker Hub](https://hub.docker.com)
2. Create repository: `yourusername/textarr`
3. Generate access token: Account Settings → Security → New Access Token

## Step 2: Set Up Cloudflare Tunnel

Cloudflare Tunnel allows secure webhook access without opening ports on your network.

### Create the Tunnel

1. Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com)
2. Navigate to **Networks → Tunnels**
3. Click **Create a tunnel**
4. Name it (e.g., "textarr")
5. Copy the tunnel token (starts with `eyJ...`)

### Configure Public Hostname

1. In the tunnel configuration, click **Public Hostname**
2. Add a new public hostname:
   - **Subdomain**: `sms` (or your choice)
   - **Domain**: Select your domain
   - **Path**: `/webhooks/sms` (recommended - see [Security section](#security-exposing-only-the-webhook))
   - **Service Type**: HTTP
   - **URL**: `textarr:3030` (container name and port)
3. Save the configuration

Your webhook URL will be: `https://sms.yourdomain.com/webhooks/sms`

### Using an Existing Cloudflare Tunnel

If you already have a cloudflared container running on Unraid (e.g., for other services), you can add Textarr to your existing tunnel instead of creating a new one.

1. Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com)
2. Navigate to **Networks → Tunnels**
3. Click on your existing tunnel
4. Go to the **Public Hostname** tab
5. Click **Add a public hostname**
6. Configure the new hostname:
   - **Subdomain**: `sms` (or your choice)
   - **Domain**: Select your domain
   - **Path**: `/webhooks/sms` (important - see security note below)
   - **Service Type**: HTTP
   - **URL**: `textarr:3030`
7. Save the configuration

**Important**: For this to work, the Textarr container must be on the same Docker network as your cloudflared container. In Unraid:

1. Note which network your cloudflared container uses (check its configuration)
2. When setting up the Textarr container, use the same network
3. Common network options:
   - **Custom: br0** - If using bridge mode
   - **proxynet** or similar - If you created a custom Docker network for your reverse proxy setup

If your containers are on different networks, cloudflared won't be able to reach Textarr. You can verify connectivity by checking the cloudflared container logs after setup.

### Security: Exposing Only the Webhook

**Important**: The web configuration interface (`/`, `/api/*`) has no authentication. You should **only expose the webhook endpoint** through Cloudflare Tunnel.

#### Option A: Path-Specific Public Hostname (Recommended)

Cloudflare Tunnels use ingress rules to route traffic. When you add a public hostname with a specific **Path**, only requests matching that path are routed through the tunnel. Requests to other paths (like `/` or `/api/config`) will return a Cloudflare error page (no route defined).

To configure this in the Zero Trust dashboard:

1. When adding your public hostname, enter the path in the **Path** field: `/webhooks/sms`
2. The Path field uses regex matching - `/webhooks/sms` will match requests to exactly that path
3. Save the configuration

Result:

- `https://sms.yourdomain.com/webhooks/sms` → Routed to Textarr (accessible)
- `https://sms.yourdomain.com/` → No matching route (Cloudflare error)
- `https://sms.yourdomain.com/api/config` → No matching route (Cloudflare error)

The web interface remains accessible only on your local network via the container's direct IP address or mapped port (e.g., `http://192.168.1.100:3030`).

#### Option B: Expose Everything with Cloudflare Access Protection

If you want remote access to the full web UI, expose the entire application but protect it with Cloudflare Access:

1. Add the public hostname **without** a path (leave Path empty to expose all routes)
2. In Zero Trust Dashboard, go to **Access → Applications**
3. Click **Add an application** → **Self-hosted**
4. Configure:
   - **Application name**: Textarr Admin
   - **Subdomain**: `sms` (same as your tunnel hostname)
   - **Domain**: Select your domain
5. Add a policy:
   - **Policy name**: Allowed Users
   - **Action**: Allow
   - **Include**: Emails ending in `@yourdomain.com` (or specific emails)
6. Under **Settings → Path exclusions**, add a bypass rule for `/webhooks/sms` so Twilio can reach the webhook without authentication
7. Save the application

This adds email-based authentication to all routes except the webhook endpoint.

**Recommendation**: Option A is simpler and more secure for most users. Only use Option B if you need remote access to the configuration UI.

## Step 3: Install on Unraid

### Option A: Using the Template

1. Go to Unraid's **Docker** tab
2. Click **Add Container**
3. Click **Template** dropdown and select the Textarr template
4. Fill in all required fields (see Configuration below)
5. Click **Apply**

### Option B: Manual Configuration

1. Go to Unraid's **Docker** tab
2. Click **Add Container**
3. Configure:
   - **Repository**: `ghcr.io/textarr/textarr:latest`
   - **Network Type**: `Custom: br0` or a custom docker network
   - **Port**: 3030 → 3030 (TCP)

### Configuration Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Yes | Twilio Account SID (starts with AC) |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | Yes | Your Twilio number (+15551234567) |
| `AI_PROVIDER` | Yes | `openai`, `anthropic`, or `google` |
| `AI_MODEL` | Yes | Model name (e.g., `gpt-4-turbo`) |
| `OPENAI_API_KEY` | If using OpenAI | OpenAI API key |
| `ANTHROPIC_API_KEY` | If using Anthropic | Anthropic API key |
| `GOOGLE_API_KEY` | If using Google | Google AI API key |
| `SONARR_URL` | Yes | Sonarr URL (e.g., `http://sonarr:8989`) |
| `SONARR_API_KEY` | Yes | Sonarr API key |
| `RADARR_URL` | Yes | Radarr URL (e.g., `http://radarr:7878`) |
| `RADARR_API_KEY` | Yes | Radarr API key |
| `ALLOWED_PHONE_NUMBERS` | Yes | Comma-separated phone numbers |

### Install Cloudflared Container

1. Search for "cloudflared" in Community Applications, or manually add:
   - **Repository**: `cloudflare/cloudflared:latest`
   - **Network**: Same as Textarr container
   - **Post Arguments**: `tunnel run`
   - **Environment Variable**: `TUNNEL_TOKEN` = your tunnel token

2. Ensure both containers are on the same Docker network

## Step 4: Configure Twilio Webhook

1. Go to [Twilio Console](https://console.twilio.com)
2. Navigate to **Phone Numbers → Manage → Active numbers**
3. Click your phone number
4. Under **Messaging Configuration**:
   - **A MESSAGE COMES IN**: Webhook
   - **URL**: `https://sms.yourdomain.com/webhooks/sms`
   - **HTTP Method**: POST
5. Save configuration

## Step 5: Test the Setup

1. Send a text message to your Twilio number from an allowed phone
2. You should receive a response from the bot
3. Check the container logs if issues occur:

   ```bash
   docker logs textarr
   ```

## Troubleshooting

### Bot doesn't respond

1. Check ALLOWED_PHONE_NUMBERS includes your number in E.164 format
2. Verify Twilio webhook URL is correct
3. Check container logs for errors

### Webhook returns 403 Forbidden

1. Twilio signature validation failed
2. Verify TWILIO_AUTH_TOKEN is correct
3. Ensure webhook URL matches exactly (including https)

### Connection to Sonarr/Radarr fails

1. Verify URLs are accessible from the container
2. Use container names if on same Docker network
3. Check API keys are correct

### Rate limited (empty responses)

- Default limit is 10 requests per minute per phone number
- Wait 1 minute before retrying

## Docker Compose (Alternative)

If you prefer Docker Compose over Unraid's UI:

```yaml
version: '3.8'

services:
  textarr:
    image: ghcr.io/textarr/textarr:latest
    container_name: textarr
    restart: unless-stopped
    ports:
      - "3030:3030"
    environment:
      - NODE_ENV=production
      - TWILIO_ACCOUNT_SID=ACxxxxxxxx
      - TWILIO_AUTH_TOKEN=xxxxxxxx
      - TWILIO_PHONE_NUMBER=+15551234567
      - AI_PROVIDER=openai
      - AI_MODEL=gpt-4-turbo
      - OPENAI_API_KEY=sk-xxxxxxxx
      - SONARR_URL=http://sonarr:8989
      - SONARR_API_KEY=xxxxxxxx
      - RADARR_URL=http://radarr:7878
      - RADARR_API_KEY=xxxxxxxx
      - ALLOWED_PHONE_NUMBERS=+15551234567
    networks:
      - media-net

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared
    restart: unless-stopped
    command: tunnel run
    environment:
      - TUNNEL_TOKEN=eyJxxxxxxxx
    networks:
      - media-net
    depends_on:
      - textarr

networks:
  media-net:
    driver: bridge
```

## Alternative: Tailscale Funnel

If you use Tailscale for your home network, Tailscale Funnel provides a simpler alternative to Cloudflare Tunnel. Funnel exposes your local service to the internet through Tailscale's infrastructure with automatic HTTPS.

### Tailscale Funnel vs Cloudflare Tunnel

| Feature | Tailscale Funnel | Cloudflare Tunnel |
|---------|------------------|-------------------|
| **Setup Complexity** | Simpler | More steps |
| **Domain** | `*.ts.net` subdomain | Your own domain |
| **Prerequisites** | Tailscale account | Cloudflare account + domain |
| **Path Restrictions** | Full control via serve config | Path-based routing |
| **Authentication** | Tailscale ACLs | Cloudflare Access |
| **Bandwidth** | Subject to limits | Unlimited |
| **Cost** | Free (Personal plan) | Free |

**Choose Tailscale Funnel if**: You already use Tailscale, want simpler setup, and don't need a custom domain.

**Choose Cloudflare Tunnel if**: You want a custom domain, need more advanced security features, or don't use Tailscale.

### Prerequisites

- Tailscale account (Personal, Personal Plus, Premium, or Enterprise plan)
- Tailscale v1.38.3 or later
- MagicDNS and HTTPS enabled in your tailnet

### Step 1: Enable Funnel in Tailscale Admin

1. Go to [Tailscale Admin Console](https://login.tailscale.com/admin/acls)
2. Edit your Access Controls (ACL) policy
3. Add the `funnel` node attribute to allow Funnel:

```json
{
  "nodeAttrs": [
    {
      "target": ["autogroup:member"],
      "attr": ["funnel"]
    }
  ]
}
```

This allows all members of your tailnet to use Funnel. For more restrictive access, replace `autogroup:member` with specific users or tags.

### Step 2: Create Tailscale Auth Key

1. Go to [Tailscale Admin Console → Settings → Keys](https://login.tailscale.com/admin/settings/keys)
2. Click **Generate auth key**
3. Configure the key:
   - **Description**: `textarr-funnel`
   - **Reusable**: No (single use is more secure)
   - **Ephemeral**: No (the device should persist)
   - **Tags**: Optional, add a tag like `tag:server` if you use tagged devices
4. Copy the auth key (starts with `tskey-auth-...`)

### Step 3: Create Funnel Configuration

Create a file at `/mnt/user/appdata/textarr/tailscale/serve-config.json`:

```json
{
  "TCP": {
    "443": {
      "HTTPS": true
    }
  },
  "Web": {
    "${TS_CERT_DOMAIN}:443": {
      "Handlers": {
        "/webhooks/sms": {
          "Proxy": "http://127.0.0.1:3030"
        }
      }
    }
  },
  "AllowFunnel": {
    "${TS_CERT_DOMAIN}:443": true
  }
}
```

This configuration:
- Only exposes the `/webhooks/sms` endpoint (not the web UI)
- Proxies requests to the Textarr container on port 3030
- Enables Funnel for public internet access

**Note**: `${TS_CERT_DOMAIN}` is automatically replaced by Tailscale with your machine's Funnel domain (e.g., `textarr.tail1234.ts.net`).

#### Exposing the Full Web UI (Optional)

If you want remote access to the configuration UI via Funnel (less secure):

```json
{
  "TCP": {
    "443": {
      "HTTPS": true
    }
  },
  "Web": {
    "${TS_CERT_DOMAIN}:443": {
      "Handlers": {
        "/": {
          "Proxy": "http://127.0.0.1:3030"
        }
      }
    }
  },
  "AllowFunnel": {
    "${TS_CERT_DOMAIN}:443": true
  }
}
```

**Warning**: The web UI has no authentication. Only expose it via Funnel if you understand the risks or plan to add authentication.

### Step 4: Deploy with Docker Compose

Create a `docker-compose.yml` file or add to your existing stack:

```yaml
version: '3.8'

services:
  textarr:
    image: ghcr.io/textarr/textarr:latest
    container_name: textarr
    restart: unless-stopped
    network_mode: service:tailscale
    environment:
      - NODE_ENV=production
      - TWILIO_ACCOUNT_SID=ACxxxxxxxx
      - TWILIO_AUTH_TOKEN=xxxxxxxx
      - TWILIO_PHONE_NUMBER=+15551234567
      - AI_PROVIDER=openai
      - AI_MODEL=gpt-4-turbo
      - OPENAI_API_KEY=sk-xxxxxxxx
      - SONARR_URL=http://sonarr:8989
      - SONARR_API_KEY=xxxxxxxx
      - RADARR_URL=http://radarr:7878
      - RADARR_API_KEY=xxxxxxxx
      - ALLOWED_PHONE_NUMBERS=+15551234567
    depends_on:
      - tailscale

  tailscale:
    image: tailscale/tailscale:latest
    container_name: textarr-tailscale
    hostname: textarr
    restart: unless-stopped
    environment:
      - TS_AUTHKEY=tskey-auth-xxxxxxxxxxxxx
      - TS_STATE_DIR=/var/lib/tailscale
      - TS_SERVE_CONFIG=/config/serve-config.json
      - TS_USERSPACE=true
    volumes:
      - /mnt/user/appdata/textarr/tailscale/state:/var/lib/tailscale
      - /mnt/user/appdata/textarr/tailscale:/config
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    devices:
      - /dev/net/tun:/dev/net/tun
```

**Key points**:
- `network_mode: service:tailscale` makes Textarr share the Tailscale container's network stack
- `hostname: textarr` sets the machine name in your tailnet (your Funnel URL will be `textarr.tail1234.ts.net`)
- `TS_SERVE_CONFIG` points to your Funnel configuration
- The state directory persists your Tailscale authentication

### Step 5: Manual Unraid Container Setup (Alternative)

If you prefer Unraid's Docker UI over Docker Compose:

#### Create the Tailscale Container

1. Go to Unraid's **Docker** tab
2. Click **Add Container**
3. Configure:
   - **Name**: `textarr-tailscale`
   - **Repository**: `tailscale/tailscale:latest`
   - **Network Type**: `bridge`
   - **Extra Parameters**: `--hostname=textarr --cap-add=NET_ADMIN --cap-add=SYS_MODULE --device=/dev/net/tun`

4. Add these environment variables:
   | Variable | Value |
   |----------|-------|
   | `TS_AUTHKEY` | `tskey-auth-xxxxxxxxxxxxx` |
   | `TS_STATE_DIR` | `/var/lib/tailscale` |
   | `TS_SERVE_CONFIG` | `/config/serve-config.json` |
   | `TS_USERSPACE` | `true` |

5. Add path mappings:
   | Container Path | Host Path |
   |----------------|-----------|
   | `/var/lib/tailscale` | `/mnt/user/appdata/textarr/tailscale/state` |
   | `/config` | `/mnt/user/appdata/textarr/tailscale` |

6. Click **Apply**

#### Create the Textarr Container

1. Click **Add Container**
2. Configure:
   - **Name**: `textarr`
   - **Repository**: `ghcr.io/textarr/textarr:latest`
   - **Network Type**: `Container: textarr-tailscale`

3. Add all the environment variables from the [Configuration Variables](#configuration-variables) section

4. **Do not add port mappings** - the container shares the Tailscale container's network

5. Click **Apply**

### Step 6: Get Your Funnel URL

After the containers start:

1. Check the Tailscale container logs:
   ```bash
   docker logs textarr-tailscale
   ```

2. Look for output showing your Funnel URL:
   ```
   Funnel started on https://textarr.tail1234.ts.net
   ```

3. You can also find your machine's domain in the [Tailscale Admin Console → Machines](https://login.tailscale.com/admin/machines)

Your webhook URL will be: `https://textarr.tail1234.ts.net/webhooks/sms`

### Step 7: Configure Twilio Webhook

1. Go to [Twilio Console](https://console.twilio.com)
2. Navigate to **Phone Numbers → Manage → Active numbers**
3. Click your phone number
4. Under **Messaging Configuration**:
   - **A MESSAGE COMES IN**: Webhook
   - **URL**: `https://textarr.tail1234.ts.net/webhooks/sms` (use your actual Funnel URL)
   - **HTTP Method**: POST
5. Save configuration

### Troubleshooting Tailscale Funnel

#### Funnel URL not working

1. Verify Funnel is enabled:
   ```bash
   docker exec textarr-tailscale tailscale funnel status
   ```

2. Check that the serve config is loaded:
   ```bash
   docker exec textarr-tailscale tailscale serve status
   ```

3. Verify the ACL allows Funnel (check Tailscale Admin Console)

#### "Funnel not available" error

- Ensure your Tailscale plan supports Funnel (Personal, Personal Plus, Premium, Enterprise)
- Verify the `funnel` node attribute is set in your ACL policy
- Check that MagicDNS and HTTPS are enabled in your tailnet settings

#### Container can't connect to Sonarr/Radarr

When using `network_mode: service:tailscale`, the Textarr container loses direct access to other Docker containers. Use one of these solutions:

1. **Use Tailscale IPs**: If Sonarr/Radarr are also on Tailscale, use their Tailscale IP addresses
2. **Use host IP**: Use your Unraid server's LAN IP (e.g., `http://192.168.1.100:8989`)
3. **Use host.docker.internal**: Some Docker setups support this hostname for host access

#### Auth key expired or invalid

- Auth keys are single-use by default; generate a new one if needed
- For development, you can create a reusable key
- Check the key hasn't expired (default expiry is 90 days for reusable keys)

---

## GitHub Actions (For Developers)

To set up automatic Docker builds:

1. Fork/clone the repository
2. Add secrets to your GitHub repository:
   - `DOCKERHUB_USERNAME`: Your Docker Hub username
   - `DOCKERHUB_TOKEN`: Docker Hub access token
3. Push to `main` branch to trigger a build
4. Images will be published to `yourusername/textarr:latest`
