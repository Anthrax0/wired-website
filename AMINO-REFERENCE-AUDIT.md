# Amino APK reference audit for WIRED

## Scope and evidence

Reference inspected: user-supplied `Amino (1).apk` (187 MB).

The package archive contains an Android manifest, 16 DEX files, 13,022 entries under `res/`, 2,019 entries under `assets/`, Agora RTC native libraries, and named assets for gifts, battles, live experiences, stories, and screening rooms.

This is a static package inspection. It establishes that code/resources associated with a feature are present; it does **not** prove that a feature is enabled in the installed build, works against a live service, or is available to every account. User-visible behavior still needs to be checked in the running reference app.

Do not copy Amino's proprietary source, logos, artwork, or service credentials. Reimplement comparable behavior with WIRED's own code, design system, assets, and backend.

## Reference feature inventory

| Area | Evidence found in APK | WIRED status from current project roadmap/code review | Work still needed |
|---|---|---|---|
| Community discovery | Community/feed and discovery package references | Search, category filter, sorting, public/private communities exist | Trending/featured, tags, invitations, richer search and recommendations |
| Community spaces | Community, member, role, guidelines and moderation references | Community creation, join requests, owner/mod role, manager settings exist | Full staff role editor, member directory, announcements, appeals, custom navigation/layout |
| Profiles | Profile, relationship-status, badge and profile resource references | Profile basics, comments/replies, follows/friends, relationship system, cosmetics exist | Full profile editor, gallery controls, privacy, status, links, badges, community-specific identity |
| Publishing | Blog, wiki, story, poll, quiz, comment and feed references | Blog/text, image, poll, quiz, question, story, wiki formats; comments/reactions and image upload exist | Editing, drafts, bookmarks, reposts/shares, pins/featured posts, richer media and formatting |
| Direct/group chat | Chat/thread/message and RTC references | Direct and group threads, realtime messages exist | Reactions, stickers, voice notes, typing/read indicators, search, message management, member management |
| Voice/video/live | Agora RTC libraries, live-feed and broadcast references | Not yet established as implemented | Voice/video calls, live rooms/streams, co-hosts, moderation, audience interaction |
| Screening/shared viewing | Screening-room assets and screen-room references | Not yet established as implemented | Shared viewing rooms and synchronized media, subject to licensing and device/browser support |
| Gifts and expression | Gift, sticker, animated-sticker, gift-opening and battle-gift assets | WIRED store supports points-based cosmetic purchases/equipping | Gift sending/receiving, sticker packs, chat cosmetics, animations and inventory |
| Games/engagement | Quiz, poll, check-in, leaderboard, battle references | Multi-question quizzes, polls, daily community check-ins and a check-in leaderboard exist | Quiz rankings/attempt history, timed modes, challenges, battle/contest formats |
| Rewards/store | Store, coin, diamond, consumable and badge references | WIRED points wallet, global store, purchase/equip slots exist | Reward history, catalog preview QA, more cosmetic slots, transparent earn/spend rules |
| Notifications | Notification and event references | Global notifications and realtime updates exist | Full notification taxonomy/preferences, mentions, post replies, community announcements |
| Safety/moderation | Block, report, admin, moderator and moderation-history references | Blocks, reports, basic moderation tables/actions exist | Moderation queue, strikes/timeouts, audit UI, appeals, chat-specific safety, granular permissions |

## WIRED capabilities confirmed in the current roadmap

- Adults-only registration with an 18+ date-of-birth constraint and optional verification field.
- Public/private communities, join requests, community-specific settings and Discovery.
- Post formats: blog/text, image, poll, quiz, question, story, wiki.
- Poll voting; multi-question quizzes with server-side scoring and private answer keys.
- Post comments and reactions; community image uploads.
- Direct messages, group chats (up to 50 participants), community chat entry points, realtime message updates.
- Profile comments and replies, global notifications, follow/friend and relationship features.
- Community check-ins and a check-in leaderboard.
- Global points store with separate equipped theme, nameplate, and frame fields.
- Community manager settings and basic moderation foundations.

These entries are implementation claims recorded in the WIRED roadmap. Each still requires a live functional test before release.

## Recommended implementation order

1. **Reliability and test coverage:** verify registration/18+ enforcement, community joins, posts, polls, quizzes, comments, profile relationships, store purchase/equip, chat, notifications, and moderation on mobile and desktop. Fix failures before adding dependent features.
2. **Publishing completeness:** edit/delete posts and comments, drafts, bookmarks, repost/share, pinned/featured content, rich text/media handling.
3. **Messaging completeness:** message reactions, stickers, read receipts, typing state, search, group membership management, delete/unsend/report/block flows.
4. **Profiles and social graph:** privacy controls, status/links/gallery, badges, community-specific identity, follower/friend controls.
5. **Community governance:** role/permission matrix, member management, moderation queue, reports, strikes, timeouts, bans, appeals, audit history, announcements.
6. **Engagement and rewards:** quiz attempt history/leaderboards, timed quiz modes, challenges, achievements, streaks, reward history, anti-abuse limits.
7. **Live experiences:** voice/video calling, live rooms, co-hosts, gifting, audience controls, shared viewing. This requires a deliberate media provider, operational cost review, moderation design, and mobile-device testing.
8. **Release engineering:** Android packaging, signed builds, install/update testing, accessibility, performance, privacy/security review, backups and monitoring.

## Acceptance rule

A feature is complete only when:
- the UI exists and is usable on a phone-sized screen;
- the API validates authorization and input server-side;
- database access is protected by appropriate RLS/permissions;
- success, failure, empty, loading, and retry states are handled;
- a test verifies the main flow and important edge cases;
- the roadmap and release notes accurately reflect what was tested.

## Important platform distinction

The current WIRED repository is a browser-based app/PWA deployed with GitHub Pages and Supabase. Deploying it does not create or update an Android APK. Android packaging and signed APK delivery are a separate release-engineering stage.

## Community moderation cross-reference

The [Zakovskiy client reference](https://github.com/Zakovskiy/amino.py/blob/master/src/amino.py) describes community-scoped ban and unban operations with a reason and a banned-member listing. The [amino.light.py reference](https://pypi.org/project/amino.light.py/0.2.3/) describes distinct warning, strike, hide, feature, ban, and unban actions. These references guide the workflows. WIRED stores and authorizes its own actions.

| Workflow | WIRED behavior |
|---|---|
| Staff roles | Community owners and moderators have community-scoped tools. The agent, leader, and curator hierarchy has no exact equivalent. |
| Join requests | Staff can approve or decline requests for their own community in Community Manager. |
| Warnings and strikes | Staff can issue a warning with a reason. A distinct strike or posting-only restriction requires a separate workflow. |
| Bans and unbans | Staff enter a reason and choose a ban duration or a permanent ban. The ban change and reason are saved together in the moderation log. |
| Flagged content | Staff review open post reports, resolve them, or remove the reported post and close its outstanding reports. |
| Hide or feature | Staff can remove community posts and feature or unfeature them. Profile hiding, chat moderation, and wiki review require separate workflows. |
| Staff history | The Community Manager log records the actor, action, time, and details for supported actions. |
