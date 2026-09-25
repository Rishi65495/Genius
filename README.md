# Lucid — AI-powered collaborative learning OS

This branch upgrades Genius/Leafline into the Lucid learning system described by the attached product blueprint.

## Core connected loop

Goal → Catalogue → Content → Focus → Annotation → Understanding → Recall → Test → Mastery → XP/Level → Learning Profile → AI Adaptation → Next Best Action.

## Included

- Persistent catalogues, goals and learning journeys
- Universal resume state for PDF learning
- Focus engine with active-time vs idle-time measurement
- Practice center: Quick Check, Session Recall, Chapter Test, Adaptive Test, Oral Recall, Teach-back
- Concept-level mastery and XP/level tracking
- AI Guide context stack and AI learning actions
- YouTube video/playlist learning shell using the official IFrame player
- Timestamped video notes
- Study Rooms with parallel/synchronized/challenge modes, realtime presence, timed discussion and challenge tests
- Weekly learning insights and adaptive-profile scaffolding
- Achievements/badges with anti-grind XP ledger
- Privacy controls and sparse notifications
- Offline app shell / local PDF continuity
- Idempotent compatibility migration for the existing Leafline database
- Server-side ai-learning and youtube-import Edge Functions

## Backend configuration

ai-learning requires GEMINI_API_KEY in Supabase Edge Function secrets.

youtube-import requires YOUTUBE_API_KEY for playlist/video metadata. Single-video embedding still works with the official YouTube IFrame player and oEmbed.

Never place provider secrets in browser code.

## Product boundary

The blueprint labels teacher/mentor mode, public cohorts, mobile/desktop clients, browser extension, enterprise features and several other items as future expansion. They remain roadmap items rather than being represented as falsely complete features.
