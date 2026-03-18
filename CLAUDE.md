# Diggnation Pipeline

## Project Overview
Web app for the Diggnation podcast pipeline. Phase 1: transcription via WhisperX. Future phases: EDL generation, content generation (show notes, social posts, newsletters).

## Stack
- **Frontend**: Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS 4
- **Backend**: Next.js API routes (route.ts files)
- **Database**: SQLite via Drizzle ORM + better-sqlite3
- **File uploads**: Busboy (streaming to disk)
- **Background worker**: setInterval-based poller via instrumentation.ts
- **Transcription**: WhisperX Flask server on localhost:9000

## Conventions
- Use App Router (src/app/) with route.ts for API routes
- All API routes must set `export const runtime = 'nodejs'`
- Database singleton in src/lib/db/index.ts — import as `import { db } from '@/lib/db'`
- Schema in src/lib/db/schema.ts
- Uploaded files go to data/uploads/ with UUID filenames
- Transcription results go to data/transcripts/ as JSON files
- Use `drizzle-kit push` for dev, `drizzle-kit generate && drizzle-kit migrate` for production

## Commands
- `npm run dev` — Start dev server
- `npm run build` — Production build
- `npm run lint` — Run ESLint
- `npx drizzle-kit push` — Push schema changes to SQLite
- `npx drizzle-kit generate` — Generate migration files

## Architecture Notes
- WhisperX Flask server runs separately on port 9000 (see whisperX.py)
- Background worker polls SQLite for pending jobs, processes one at a time
- No authentication — Tailscale provides network-level access control
- SQLite uses WAL mode for concurrent read/write safety
