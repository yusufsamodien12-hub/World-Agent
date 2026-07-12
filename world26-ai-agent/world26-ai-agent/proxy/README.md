# 🌍 World26 Cloudflare Worker API Proxy

A secure API proxy for World26 simulation, deployed on Cloudflare Workers with D1 database persistence.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/samlite67/world26)

## 🚀 Quick Start

### 1. Deploy the Worker

```bash
cd temp_mistralapicaller
npm install
npx wrangler secret put MISTRAL_API_KEY
npx wrangler d1 migrations apply world26-memory --remote
npx wrangler deploy
```

### 2. Get Your Worker URL

After deployment, copy the URL (e.g., `https://mistralapicaller.yourusername.workers.dev`)

### 3. Configure Frontend

Update your `.env.local` file:
```bash
VITE_PROXY_URL=https://mistralapicaller.yourusername.workers.dev/v1/chat/completions
```

### 4. Test It

Open `test.html` in your browser or visit:
```
https://mistralapicaller.yourusername.workers.dev/
```

## 📚 Full Documentation

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete setup instructions.

## 🔗 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check and service info |
| `/v1/chat/completions` | POST | Mistral AI proxy (OpenAI compatible) |
| `/state` | GET | Load simulation state from D1 |
| `/state` | POST | Save simulation state to D1 |

## 🧪 Testing

1. **Interactive Test Page**: Open `test.html` in a browser
2. **Command Line Health Check**: 
   ```bash
   curl https://YOUR_WORKER.workers.dev/
   ```
3. **Test Mistral API**:
   ```bash
   curl -X POST https://YOUR_WORKER.workers.dev/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{"model":"mistral-large-latest","messages":[{"role":"user","content":"Hello!"}]}'
   ```

## 🔐 Security

- ✅ API keys stored securely in Cloudflare (never exposed to clients)
- ✅ CORS enabled for GitHub Pages compatibility
- ✅ Environment-specific secrets
- ✅ No credentials in source code

## 🛠️ Tech Stack

- **Runtime**: Cloudflare Workers (V8 Isolates)
- **Framework**: Hono.js
- **Database**: Cloudflare D1 (SQLite)
- **AI API**: Mistral AI
- **Language**: TypeScript

## 📦 Project Structure

```
temp_mistralapicaller/
├── src/
│   ├── index.ts          # Main worker code with Hono routes
│   └── types.ts          # TypeScript type definitions
├── migrations/           # D1 database schema migrations
│   ├── 0001_add_tasks_table.sql
│   └── 0002_add_memory_table.sql
├── tests/               # Integration tests (Vitest)
├── wrangler.jsonc       # Worker configuration
├── DEPLOYMENT.md        # Comprehensive deployment guide
├── test.html           # Interactive API test interface
└── README.md           # This file
```

## 🔄 Development Workflow

```bash
# Install dependencies
npm install

# Run worker locally with hot reload
npx wrangler dev

# View real-time logs from deployed worker
npx wrangler tail

# Run migrations on local D1
npx wrangler d1 migrations apply world26-memory --local

# Run migrations on production D1
npx wrangler d1 migrations apply world26-memory --remote

# Deploy to Cloudflare
npx wrangler deploy

# List secrets
npx wrangler secret list

# Update a secret
npx wrangler secret put MISTRAL_API_KEY
```

## ⚡ Features

- 🔒 **Secure API Key Management**: Secrets stored in Cloudflare environment
- 🌐 **Full CORS Support**: Works seamlessly with GitHub Pages
- 💾 **Persistent State**: D1 database for simulation state
- 🤖 **AI Integration**: Mistral AI chat completions
- 📊 **Health Monitoring**: Built-in health check endpoint
- 🧪 **Interactive Testing**: Beautiful test interface included
- 🚀 **Edge Deployment**: Low latency worldwide
- 📝 **TypeScript**: Type-safe development

## 🌐 Integration with GitHub Pages

Your World26 app on GitHub Pages will call this Worker proxy, which securely communicates with Mistral AI:

```
┌─────────────────────┐
│  GitHub Pages       │
│  (Your Frontend)    │
└──────────┬──────────┘
           │ fetch()
           ↓
┌─────────────────────┐
│ Cloudflare Worker   │
│ (This Proxy)        │
│ + MISTRAL_API_KEY   │
└──────────┬──────────┘
           │ with API Key
           ↓
┌─────────────────────┐
│  Mistral AI API     │
└─────────────────────┘
```

**Benefits:**
- ✅ API key never exposed to browser
- ✅ No CORS issues
- ✅ Global edge network performance
- ✅ Built-in DDoS protection

## 📝 Environment Variables

Set secrets using Wrangler CLI:

```bash
# Required: Mistral AI API Key
npx wrangler secret put MISTRAL_API_KEY
```

## 🐛 Troubleshooting

### Worker returns "Missing API Key"
```bash
npx wrangler secret put MISTRAL_API_KEY
# Then paste your key when prompted
```

### CORS errors in browser
Verify CORS headers are present:
```bash
curl -I https://YOUR_WORKER.workers.dev/
# Should show: Access-Control-Allow-Origin: *
```

### Database errors
Re-run migrations:
```bash
npx wrangler d1 migrations apply world26-memory --remote
```

### Worker not updating after deploy
Try force refresh:
```bash
npx wrangler deploy --compatibility-date=$(date +%Y-%m-%d)
```

## 📚 Additional Resources
5. Monitor your worker
   ```bash
   npx wrangler tail
   ```

## Testing

This template includes integration tests using [Vitest](https://vitest.dev/). To run the tests locally:

```bash
npm run test
```

Test files are located in the `tests/` directory, with examples demonstrating how to test your endpoints and database interactions.

## Project structure

1. Your main router is defined in `src/index.ts`.
2. Each endpoint has its own file in `src/endpoints/`.
3. Integration tests are located in the `tests/` directory.
4. For more information read the [chanfana documentation](https://chanfana.com/), [Hono documentation](https://hono.dev/docs), and [Vitest documentation](https://vitest.dev/guide/).
