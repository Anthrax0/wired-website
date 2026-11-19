# WIRED — Amino-inspired feature roadmap

WIRED will independently implement the broad feature set that made Amino useful, while retaining WIRED's own black-and-purple visual identity, layout, name, and 18+ positioning. This is a functional reference, not a copy of Amino's proprietary source code, artwork, or branding.

## Product principles
- Adults-only registration (18+) and optional identity verification through a trusted provider.
- Public community discovery plus private communities with approval-based entry.
- Community-specific identity, content, governance, and customization.
- Accessible, responsive web/PWA experience first; APK packaging can follow.
- Safe defaults: reporting, blocking, moderation tools, privacy controls, and auditability.

## Stages

### 1. Discovery and community foundations
- Search communities by name, description, and category.
- Filter by category and sort by newest or name.
- Community landing pages with rules, welcome message, membership state, and posts.
- Public/private join flows and community creation.
- Follow-up: featured/trending lists, tags, member counts, and invitation links.

### 2. Structured community publishing — in progress
- Implemented: blog/text, image, poll, quiz, question, story, and wiki post formats.
- Implemented: poll voting with live totals, quiz answer feedback, comments, and reactions (like/love/laugh/wow/support).
- Implemented: community image uploads through the dedicated `post-media` bucket.
- Remaining: comment editing/deletion UI, bookmarks/favorites, repost/share, featured/pinned posts, drafts, and post editing.

### 3. Messaging and live community spaces
- Implemented: direct messages, multi-member group chats (up to 50 total participants), and community chat entry points.
- Implemented: live message updates in open conversations using Supabase Realtime and existing row-level security.
- Remaining: message reactions, stickers, voice notes, typing/read indicators, message search, and group member management.
- Later: voice rooms and shared viewing rooms, subject to browser/device support.
- Remaining: chat-specific block/report and moderation controls.

### 4. Rich member profiles
- Avatar, cover/background, bio, profile gallery, status, links, and display preferences.
- Community-specific profile fields and identity customization.
- Followers/following, profile privacy, badges, and verification display.

### 5. Reputation and engagement
- XP/reputation, levels, check-ins, streaks, achievements, and community leaderboards.
- Challenges, contests, participation milestones, and reward history.
- Anti-spam and anti-abuse limits so rewards cannot be trivially farmed.

### 6. Community governance and moderation
- Founder/owner, leader, curator/moderator, and member roles.
- Role permissions, moderation queue, reports, strikes, timeouts, bans, and appeals.
- Join request review, announcements/broadcasts, staff activity logs.
- Community rules, guidelines acceptance, and moderation settings.

### 7. Notifications and personalization
- In-app notifications and notification preferences.
- Followed communities and people, personalized feed, saved content.
- Mentions, replies, chat activity, announcements, and moderation notices.

### 8. Community customization
- Community icon, cover, accent color, navigation, content categories, and home layout.
- Custom welcome content, guidelines, wiki categories, and discovery presentation.
- WIRED global branding remains consistent while community-level themes are configurable.

### 9. Premium-style expression and rewards
- Sticker packs, custom chat appearance, profile frames, and cosmetic unlocks.
- Optional points/coins and transparent reward rules.
- No pay-to-win moderation privileges or misleading purchase mechanics.

### 10. Hardening, accessibility, and release
- Security/RLS review, abuse testing, privacy controls, backups, and performance work.
- Responsive/mobile testing, accessibility, browser compatibility, and PWA install flow.
- Release checklist and later Android APK packaging.

## Current implementation status
- Existing GitHub repository: `Anthrax0/wired-website`, default branch `main`.
- Existing Supabase project and `wired-api` Edge Function retained.
- Existing account registration, profile basics, community creation, public/private join flow, posts, join requests, direct messages, and basic moderation tables retained.
- Stage 1 increment: client-side community search, category filter, and sorting have been added to Discovery.
- Stage 2 increment: multiple post formats, poll/quiz options, image uploads, comments, and reactions have been added; supporting Supabase tables use RLS, and quiz answers are kept in a non-exposed schema.
- The roadmap is intentionally staged; items above are planned, not claims that every feature is already implemented.

## Acceptance approach
Each stage should be implemented against the existing schema and API, reviewed for row-level security and authorization, tested on mobile and desktop, and only then marked complete. Do not expose service-role credentials in browser code.
