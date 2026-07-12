# 🤖 World26 AI Agent

A standalone AI project that plays [`world26-playground`](../world26-playground)
over HTTP. It has no knowledge of React or Three.js — it just receives a JSON
snapshot of the world and returns a decision.

This is the piece that used to live inside the playground as
`services/aiLogic.ts`. It's now its own deployable project so you can run
different AI agents against the same playground, or run this same agent
against a different world, without the two being coupled together.

## Contract

```
POST /decide
Content-Type: application/json

{
  "logs": [...],
  "objects": [...],
  "currentGoal": "string",
  "knowledgeBase": [...],
  "activePlan": { ... } | undefined
}
```

Returns an `AIActionResponse` JSON object: `{ action: "PLACE"|"MOVE"|"WAIT", ... }`.
See `src/aiLogic.ts` for the full shape.

Any project — a different model, a different provider, a rules-based bot, a
human clicking through a UI — can implement this same contract and be used
in place of this one.

## Run locally

```bash
npm install
cp .env.example .env    # add your MISTRAL_API_KEY
npm run dev              # starts on http://localhost:4000
```

Then point `world26-playground`'s `AGENT_URL` env var at `http://localhost:4000`.

## Optional: edge proxy

`proxy/` contains the original Cloudflare Worker (Hono + D1) that proxies to
Mistral and keeps the API key off this box entirely. If you deploy it, set
`MISTRAL_PROXY_URL` in this project's `.env` instead of `MISTRAL_API_KEY`,
and this agent will forward through it rather than calling Mistral directly.
See `proxy/DEPLOYMENT.md`.

## Swapping this agent out

The playground doesn't know or care what's behind `AGENT_URL`. To run a
different AI project against the playground, just point `AGENT_URL` at it —
as long as it answers `POST /decide` with the shape above.
