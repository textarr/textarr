# Textarr - TypeScript Implementation Plan

A text messaging bot that uses AI to interpret natural language requests for movies and TV shows, then submits them to Sonarr (TV shows) or Radarr (movies).

---

## Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Runtime** | Node.js 20 LTS | Stable, wide hosting support |
| **Language** | TypeScript 5.3+ | Type safety, better DX |
| **Framework** | Fastify | Faster than Express, TypeScript-first, schema validation |
| **Validation** | Zod | Runtime validation + TypeScript inference |
| **HTTP Client** | Built-in `fetch` | Native in Node 18+, no dependencies |
| **SMS** | Twilio SDK | Industry standard |
| **AI** | OpenAI SDK | Best-in-class, structured outputs |
| **Testing** | Vitest | Fast, ESM-native, Jest-compatible |
| **Linting** | ESLint + Prettier | Standard tooling |
| **Package Manager** | pnpm | Fast, disk efficient |

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   User's Phone  │────▶│     Twilio      │────▶│  Fastify Server │
│      (SMS)      │◀────│   (Webhook)     │◀────│   (Your App)    │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                        ┌────────────────────────────────┼────────────────────────────────┐
                        │                                │                                │
                        ▼                                ▼                                ▼
               ┌─────────────────┐              ┌─────────────────┐              ┌─────────────────┐
               │   OpenAI API    │              │     Sonarr      │              │     Radarr      │
               │  (NLP Parsing)  │              │   (TV Shows)    │              │    (Movies)     │
               └─────────────────┘              └─────────────────┘              └─────────────────┘
```

---

## Project Structure

```
textarr/
├── src/
│   ├── index.ts                 # Application entry point
│   ├── server.ts                # Fastify server setup
│   ├── config/
│   │   ├── index.ts             # Configuration loader
│   │   └── env.ts               # Environment schema (Zod)
│   ├── routes/
│   │   ├── index.ts             # Route registration
│   │   ├── sms.route.ts         # SMS webhook handler
│   │   └── health.route.ts      # Health check endpoint
│   ├── services/
│   │   ├── index.ts             # Service exports
│   │   ├── sonarr.service.ts    # Sonarr API client
│   │   ├── radarr.service.ts    # Radarr API client
│   │   ├── openai.service.ts    # AI message parser
│   │   ├── twilio.service.ts    # SMS sending
│   │   └── session.service.ts   # Conversation state management
│   ├── schemas/
│   │   ├── index.ts             # Schema exports
│   │   ├── media.schema.ts      # Media types (Zod schemas)
│   │   ├── twilio.schema.ts     # Twilio webhook payload
│   │   └── api.schema.ts        # Sonarr/Radarr API schemas
│   ├── handlers/
│   │   ├── index.ts             # Handler exports
│   │   └── message.handler.ts   # Message processing logic
│   ├── middleware/
│   │   ├── index.ts             # Middleware exports
│   │   ├── auth.middleware.ts   # Phone whitelist validation
│   │   └── twilio.middleware.ts # Twilio signature verification
│   ├── utils/
│   │   ├── index.ts             # Utility exports
│   │   ├── logger.ts            # Pino logger setup
│   │   └── errors.ts            # Custom error classes
│   └── types/
│       └── index.ts             # Shared TypeScript types
├── tests/
│   ├── setup.ts                 # Test setup
│   ├── services/
│   │   ├── sonarr.test.ts
│   │   ├── radarr.test.ts
│   │   └── openai.test.ts
│   ├── handlers/
│   │   └── message.test.ts
│   └── integration/
│       └── sms.test.ts
├── .env.example
├── .eslintrc.cjs
├── .prettierrc
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

---

## Key Design Decisions

### 1. **Dependency Injection Pattern**
Services are instantiated once and passed to handlers, enabling:
- Easy testing with mocks
- Clear dependencies
- No global state

```typescript
// src/services/index.ts
export function createServices(config: Config) {
  const sonarr = new SonarrService(config.sonarr);
  const radarr = new RadarrService(config.radarr);
  const openai = new OpenAIService(config.openai);
  const twilio = new TwilioService(config.twilio);
  const session = new SessionService(config.sessionTimeoutMs);

  return { sonarr, radarr, openai, twilio, session };
}
```

### 2. **Zod for Runtime Validation**
All external data validated at boundaries:

```typescript
// src/schemas/media.schema.ts
import { z } from 'zod';

export const MediaType = z.enum(['movie', 'tv_show', 'unknown']);
export const ActionType = z.enum(['add', 'search', 'status', 'help', 'confirm', 'select', 'cancel']);

export const ParsedRequestSchema = z.object({
  mediaType: MediaType,
  title: z.string().nullable(),
  year: z.number().int().min(1900).max(2100).nullable(),
  action: ActionType,
  selectionNumber: z.number().int().positive().nullable(),
  confidence: z.number().min(0).max(1),
});

export type ParsedRequest = z.infer<typeof ParsedRequestSchema>;
```

### 3. **Type-Safe API Clients**
Fully typed Sonarr/Radarr responses:

```typescript
// src/services/sonarr.service.ts
interface SonarrSeries {
  tvdbId: number;
  title: string;
  year: number;
  status: string;
  overview?: string;
  remotePoster?: string;
  seasons: SonarrSeason[];
  // ... other fields
}

export class SonarrService {
  async search(term: string): Promise<MediaSearchResult[]> {
    const response = await fetch(`${this.baseUrl}/api/v3/series/lookup?term=${encodeURIComponent(term)}`, {
      headers: this.headers,
    });
    
    if (!response.ok) {
      throw new SonarrError(`Search failed: ${response.statusText}`);
    }
    
    const data: SonarrSeries[] = await response.json();
    return data.map(this.toSearchResult);
  }
}
```

### 4. **Conversation State Machine**
Clear state transitions for multi-turn conversations:

```typescript
// src/services/session.service.ts
type ConversationState = 
  | { type: 'idle' }
  | { type: 'awaiting_selection'; results: MediaSearchResult[] }
  | { type: 'awaiting_confirmation'; selected: MediaSearchResult };

interface Session {
  phoneNumber: string;
  state: ConversationState;
  lastActivity: Date;
}
```

### 5. **Phone Number Whitelist**
Security-first approach with middleware:

```typescript
// src/middleware/auth.middleware.ts
export function createAuthMiddleware(allowedNumbers: Set<string>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { From } = request.body as TwilioWebhookPayload;
    
    if (!allowedNumbers.has(From)) {
      // Silent rejection - don't reveal the bot exists
      return reply.status(200).send(''); 
    }
  };
}
```

---

## API Integrations

### Sonarr API v3

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v3/series/lookup` | GET | Search for TV shows |
| `/api/v3/series` | POST | Add a TV show |
| `/api/v3/series` | GET | List all series |
| `/api/v3/qualityprofile` | GET | Get quality profiles |
| `/api/v3/rootfolder` | GET | Get root folders |
| `/api/v3/queue` | GET | Get download queue |

**Authentication:** `X-Api-Key` header

### Radarr API v3

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v3/movie/lookup` | GET | Search for movies |
| `/api/v3/movie` | POST | Add a movie |
| `/api/v3/movie` | GET | List all movies |
| `/api/v3/qualityprofile` | GET | Get quality profiles |
| `/api/v3/rootfolder` | GET | Get root folders |
| `/api/v3/queue` | GET | Get download queue |

**Authentication:** `X-Api-Key` header

### Twilio Webhook

**Incoming SMS payload:**
```typescript
interface TwilioWebhookPayload {
  MessageSid: string;
  AccountSid: string;
  From: string;        // User's phone number
  To: string;          // Your Twilio number
  Body: string;        // Message content
}
```

**Response format:** TwiML XML or empty 200

---

## OpenAI Integration

### Structured Output with Function Calling

```typescript
const tools = [{
  type: 'function',
  function: {
    name: 'parse_media_request',
    description: 'Parse a user message into a structured media request',
    parameters: {
      type: 'object',
      properties: {
        media_type: { 
          type: 'string', 
          enum: ['movie', 'tv_show', 'unknown'],
          description: 'Type of media requested'
        },
        title: { 
          type: 'string', 
          description: 'Title of the movie or TV show' 
        },
        year: { 
          type: 'integer', 
          description: 'Release year if mentioned' 
        },
        action: { 
          type: 'string', 
          enum: ['add', 'search', 'status', 'help'],
          description: 'What the user wants to do'
        },
      },
      required: ['media_type', 'action'],
    },
  },
}];
```

### System Prompt

```typescript
const SYSTEM_PROMPT = `You are a media request assistant for a home media server.
Parse user messages to determine what movie or TV show they want.

Guidelines:
- "show", "series", "TV" → tv_show
- "movie", "film" → movie
- If unclear and it's a well-known TV series, assume tv_show
- If unclear and it's a well-known movie, assume movie
- Extract year if mentioned (e.g., "Dune 2021" → year: 2021)
- Default action is "add" unless user explicitly asks to search/check status

Examples:
- "Add Breaking Bad" → tv_show, "Breaking Bad", add
- "I want to watch Dune" → movie, "Dune", add
- "Download the office" → tv_show, "The Office", add
- "Is Stranger Things downloading?" → tv_show, "Stranger Things", status`;
```

---

## Conversation Flows

### Happy Path - Single Result

```
User: "Add Severance"
Bot:  "📺 Found: Severance (2022) - TV Show
       9.0★ | 2 Seasons | Thriller
       
       Reply YES to add, or NO to cancel."

User: "yes"
Bot:  "✅ Severance added to Sonarr! 
       It will start downloading shortly."
```

### Multiple Results

```
User: "Add Dune"
Bot:  "🔍 Found 3 results for 'Dune':
       
       1. Dune (2021) - Movie ⭐ 8.0
       2. Dune (1984) - Movie ⭐ 6.3
       3. Dune: Part Two (2024) - Movie ⭐ 8.5
       
       Reply with a number to select."

User: "3"
Bot:  "🎬 Selected: Dune: Part Two (2024)
       
       Reply YES to add, or NO to cancel."

User: "yes"  
Bot:  "✅ Dune: Part Two added to Radarr!"
```

### Already in Library

```
User: "Add Breaking Bad"
Bot:  "📺 Breaking Bad (2008) is already in your library!
       
       Status: Downloaded (62 episodes)"
```

### Error Handling

```
User: "Add asdfghjkl"
Bot:  "🔍 No results found for 'asdfghjkl'.
       
       Try checking the spelling or being more specific."
```

---

## Environment Variables

```env
# Server
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_WEBHOOK_PATH=/webhooks/sms

# OpenAI
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_MODEL=gpt-4-turbo-preview

# Sonarr
SONARR_URL=http://localhost:8989
SONARR_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SONARR_QUALITY_PROFILE_ID=1
SONARR_ROOT_FOLDER=/tv

# Radarr
RADARR_URL=http://localhost:7878
RADARR_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
RADARR_QUALITY_PROFILE_ID=1
RADARR_ROOT_FOLDER=/movies

# Security
ALLOWED_PHONE_NUMBERS=+1234567890,+0987654321

# Session
SESSION_TIMEOUT_MS=300000
MAX_SEARCH_RESULTS=5
```

---

## Implementation Phases

### Phase 1: Foundation (Day 1-2)
- [ ] Project setup (TypeScript, ESLint, Prettier, Vitest)
- [ ] Environment configuration with Zod validation
- [ ] Fastify server with health endpoint
- [ ] Logger setup (Pino)
- [ ] Error handling infrastructure

### Phase 2: API Clients (Day 3-4)
- [ ] Sonarr service (search, add, status)
- [ ] Radarr service (search, add, status)
- [ ] Unit tests with mocked responses

### Phase 3: AI Parser (Day 5)
- [ ] OpenAI service with function calling
- [ ] Prompt engineering and testing
- [ ] Fallback handling for ambiguous requests

### Phase 4: SMS Integration (Day 6-7)
- [ ] Twilio webhook handler
- [ ] Phone number whitelist middleware
- [ ] Twilio signature verification
- [ ] SMS response formatting

### Phase 5: Conversation Flow (Day 8-9)
- [ ] Session management (in-memory with TTL)
- [ ] Message handler orchestration
- [ ] Multi-turn conversation support
- [ ] Selection and confirmation flows

### Phase 6: Polish & Deploy (Day 10)
- [ ] Integration tests
- [ ] Docker configuration
- [ ] Documentation
- [ ] Deployment guide

---

## Testing Strategy

### Unit Tests
```typescript
// tests/services/sonarr.test.ts
describe('SonarrService', () => {
  it('should search for series', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ tvdbId: 81189, title: 'Breaking Bad' }]),
    });
    
    const service = new SonarrService(config, mockFetch);
    const results = await service.search('breaking bad');
    
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Breaking Bad');
  });
});
```

### Integration Tests
```typescript
// tests/integration/sms.test.ts
describe('SMS Webhook', () => {
  it('should process add request', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/sms',
      payload: {
        From: '+1234567890',
        Body: 'Add Breaking Bad',
      },
    });
    
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Breaking Bad');
  });
});
```

---

## Security Checklist

- [x] Phone number whitelist (only allowed numbers can interact)
- [ ] Twilio webhook signature verification
- [ ] API keys in environment variables (never in code)
- [ ] Rate limiting per phone number
- [ ] Input sanitization before API calls
- [ ] HTTPS in production
- [ ] No sensitive data in logs

---

## Deployment Options

### Docker Compose (Recommended)
```yaml
version: '3.8'
services:
  media-bot:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env
    restart: unless-stopped
```

### Alternatives
- **Railway** - Easy deployment, free tier
- **Fly.io** - Edge deployment, free tier
- **VPS** - Full control ($5/mo DigitalOcean)

---

## Estimated Costs (Monthly)

| Service | Cost |
|---------|------|
| Twilio | ~$1 (number) + $0.0079/SMS |
| OpenAI GPT-4 | ~$5-15 (depends on usage) |
| Hosting | $0-5 (Railway free tier or VPS) |
| **Total** | **~$10-25/month** |

---

## Next Steps

1. ✅ Plan complete
2. [ ] Initialize TypeScript project
3. [ ] Implement core services
4. [ ] Build SMS webhook
5. [ ] Deploy and test

Ready to start implementation?
