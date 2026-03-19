# Larry Brain — TikTok Marketing System
## Plunder & Riffle × Vessel Protocol

Per-agent TikTok slideshow marketing automation. Each agent has their own persona, hooks, and CTA. The only ask from the audience: **an email address**.

---

## Quick Start

### 1. Set environment variables
```bash
export OPENAI_API_KEY=sk-...          # For slide image generation (gpt-image-1)
export POSTIZ_API_KEY=...             # For posting + analytics
export TIKTOK_INTEGRATION_ID=...      # From Postiz → Integrations → TikTok
export REVENUECAT_API_KEY=sk_...      # Optional — for conversion tracking
```

### 2. Create slides for Ralph (full pipeline)
```bash
node scripts/create-post.js --agent ralph --hook h001
```

### 3. Post to TikTok
```bash
node scripts/create-post.js --agent ralph --hook h001 --post
```

⚠️ **Always add a trending TikTok sound before publishing each draft!** Music is the #1 reach factor.

### 4. Generate all 5 hooks for Ralph
```bash
node scripts/create-post.js --agent ralph --all
```

---

## Pipeline

```
generate-slides.js   →   OpenAI gpt-image-1   →   6 background images per hook
add-overlays.js      →   canvas text renderer  →   6 final slides per hook
post-to-tiktok.js   →   Postiz API            →   Draft in TikTok inbox
(add trending sound in TikTok app before publishing)
```

---

## Agents

| Agent | Niche | Hooks |
|-------|-------|-------|
| Ralph | AI onboarding for confused professionals | 5 hooks (urgency, simplicity, FOMO, contrast, character) |

### Adding a New Agent
1. Create `agents/{slug}/profile.json` (copy ralph's as template)
2. Define their hooks, image style, and audience
3. Run `node scripts/create-post.js --agent {slug} --all`

---

## Daily Report

Run every morning to see what's working:
```bash
node scripts/daily-report.js --days 3
```

Reports are saved to `reports/YYYY-MM-DD.md`.

### Feedback Loop Logic

| Views | Conversions | Diagnosis | Action |
|-------|-------------|-----------|--------|
| High  | High        | SCALE     | More of the same, test post times |
| High  | Low         | FIX_CTA   | Slide 6 CTA + signup page |
| Low   | High        | FIX_HOOK  | Hook needs work, CTA is great |
| Low   | Low         | RESET     | New format + angle |

---

## Postiz Setup

1. Sign up: [postiz.pro/oliverhenry](https://postiz.pro/oliverhenry)
2. Connect TikTok under Integrations
3. Copy your API key (Settings → API)
4. Note your TikTok integration ID (visible in integration settings URL)
5. Set `POSTIZ_API_KEY` and `TIKTOK_INTEGRATION_ID`

---

## Ralph's 5 Hooks (test these in order)

| ID | Category | Hook |
|----|----------|------|
| h001 | urgency | "You have 6 months before everyone in your office knows AI except you" |
| h002 | simplicity | "Everyone said AI was complicated. Ralph asked me for my email address." |
| h003 | fomo | "Your coworkers figured out AI. Here's what Ralph asked them for." |
| h004 | contrast | "3 months of AI courses. Or just your email address." |
| h005 | character | "Ralph doesn't explain AI. He just needs your email." |
