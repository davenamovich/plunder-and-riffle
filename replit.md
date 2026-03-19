# Plunder and Riffle — Deadpan AI Lead Gen Platform

## Stack
- **Frontend**: React + Vite, TypeScript, Tailwind, ShadCN UI
- **Backend**: Express, Node.js, TypeScript
- **Database**: PostgreSQL + Drizzle ORM
- **Package Manager**: pnpm monorepo
- **AI**: Chutes.ai (Mistral-Small via OpenAI-compatible API)
- **Web3**: CDP SDK v2 (Coinbase), Base mainnet, Privy wallets
- **Auth**: Privy email login → JWT tokens
- **Email**: AgentMail.to per-agent inboxes (ralph@agentmail.to, etc.)
- **Social**: Composio (Twitter, Facebook, Instagram posting)

## Features
- **Agent Fleet**: Ralph & Brody generate leads & post content (deadpan mockumentary tone)
- **Referral System**: 6-digit referral codes (e.g., `123456`) — Users get slots via `/r/123456` links; agents earn USDC splits (25/25/25/25: PM, Ops, Protocol, Referrer)
- **Lead Funnel**: ICP targeting → AI drafting → approval → funnel tracking
- **Commerce**: Stripe payments for premium slots (paid vs free)
- **Onchain**: ERC-8004 agent registry (Base mainnet), wallet provisioning via CDP, USDC sweeps

## Key Files
- `artifacts/api-server/src/lib/moltis.ts` — LLM client (Chutes.ai, batch calls, daily budget)
- `artifacts/api-server/src/lib/composio.ts` — Social posting (Twitter, FB, IG; charLimits & platform-specific logic)
- `artifacts/api-server/src/lib/agent-engine.ts` — Content generation & posting loop per agent
- `artifacts/api-server/src/lib/agentmail.ts` — Agent email inbox provisioning & message mgmt
- `artifacts/api-server/src/lib/cdp.ts` — Wallet creation & sweeps via Coinbase CDP SDK v2
- `artifacts/api-server/src/routes/auth.ts` — OTP + **Privy email login** (`/api/auth/privy-login`)
- `artifacts/btc-experiment/src/components/login-dialog.tsx` — Privy-only email auth UI
- `artifacts/btc-experiment/src/pages/admin.tsx` — Fleet management, agent controls, inbox creation
- `lib/db/src/schema/agents.ts` — agentsTable + agentmailInboxId, agentmailAddress, agentmailCreatedAt columns

## Auth Flow (Privy)
1. User clicks "Sign in" → Privy email login modal opens
2. User authenticates via Privy (email verification)
3. Frontend calls `POST /api/auth/privy-login` with email
4. Backend creates/gets user, issues JWT token
5. User is logged in; can access dashboard, manage agents, view referral links

## Secrets
- `PRIVY_APP_ID` → Privy app ID (app-level OAuth)
- `PRIVY_APP_SECRET` → Privy server secret (not needed for client-side auth)
- `CHUTES_API_KEY` → LLM access via Chutes.ai
- `AGENTMAIL_API_KEY` → Agent email inbox provisioning
- `CDP_API_KEY`, `CDP_KEY_ID` → Coinbase CDP wallet provisioning
- `COMPOSIO_API_KEY` → Social posting integrations
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID` → Bot ops alerts
- `TWITTER_*` → Twitter auth
- `LARRYBRAIN_API_KEY` → Ralph brain (external memory service)

## Workflows
- `Moltis: AI Gateway` — BROKEN; Chutes.ai is called directly from API server instead
- `artifacts/api-server: API Server` — Node server on port 8080
- `artifacts/btc-experiment: web` — Vite dev on dynamic port (currently 21251)
- `artifacts/mockup-sandbox: Component Preview Server` — Component preview server on port 8082

## TODO / Known Issues
- **Moltis binary**: Not installed; gateway workflow fails. API calls Chutes directly, so not blocking.
- **Brody video**: `artifacts/brody-video` created but not registered as artifact yet (needs `.replit-artifact/artifact.toml`, workflow setup)
- **Avatar generation**: Chutes HunyuanImage works; needs storage solution (S3/object-storage)
- **ERC-8004 gas**: Agents need ~$0.01 Base ETH at wallet before onchain registration

## Completed Features
- ✅ **6-digit referral codes**: Changed from slug-based to numeric 6-digit format (e.g., `123456`). Referral links are `/r/123456`
- ✅ **Admin navigation**: Fixed scrollable navbar with all sub-tabs accessible (Home, Agents, Dashboard buttons in header)
- ✅ **Slot duration 24 hours**: All rotator slots expire in 24 hours
- ✅ **Onboarding bridge page**: New users see `/onboarding` after signup with agent grid + referral link saver. Saving link grants 1 token (24-hour slot)
- ✅ **Referrer card on dashboard**: Shows who referred the user with CTA to copy and share their referral link
