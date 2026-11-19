# WIRED Website / PWA — Supabase-connected starter

This browser-first WIRED website is configured for the existing Supabase project and its `wired-api` Edge Function.

## Included
- WIRED black/purple responsive design and installable PWA shell.
- Supabase Auth registration and email/password sign-in.
- 18+ date-of-birth gate in the UI, with the database `handle_new_user` trigger enforcing 18+ on account creation.
- Profiles, Discovery, community creation, public/private visibility, community cover-image uploads, and community posts.
- Direct messages and conversation list using the existing `wired-api` Edge Function.
- Uses only the Supabase publishable key in the browser. No service-role or secret key is included.

## Supabase configuration already applied
- Project URL: `https://kovvnvvkopqkgjmcvvdw.supabase.co`
- API function: `/functions/v1/wired-api`
- `wired-api` deployed as version 2; it now stores `cover_url` when creating a community.
- `community-covers` public Storage bucket created, 5 MB limit, image MIME types restricted to JPEG/PNG/WEBP/GIF.
- Storage policies allow public viewing and authenticated users to upload/update/delete only within their own user-ID folder.

## WIRED feature roadmap

### Phase 1 — Community foundation (in progress)
- Community rules and welcome messages.
- Discoverable private communities with member-only posts.
- Private-community join requests and owner/moderator approval.
- Existing owner/moderator/member roles retained.

### Planned phases
2. Social feed: comments, reactions, polls, announcements, and sharing.
3. Messaging: group conversations, community chat rooms, media, and live presence.
4. Profiles and discovery: follows, friend connections, search, recommendations, and badges.
5. Customization and safety: community themes, achievements, moderation, reporting, and blocking improvements.
6. Mobile polish, accessibility, performance, and end-to-end testing.

## Run locally
Serve this folder on localhost or HTTPS. A service worker/PWA install is not available when opening the HTML directly as a `file://` URL.

## Important launch tasks
1. Add your final website domain to Supabase Auth URL Configuration (Site URL and Redirect URLs).
2. Confirm email confirmation settings and test a real adult test account.
3. Configure a production domain and HTTPS hosting.
4. Configure privacy policy, terms, reporting/blocking moderation UI, rate limits, and trusted identity verification before public launch.
5. The optional ID verification provider is not integrated. The verified badge only reflects the `profiles.id_verified` field; do not manually set it from the client.

## Security
The browser includes only the Supabase publishable key. Row-level security is enabled on the existing public tables. The Edge Function checks the bearer token by calling `auth.getUser()` before accessing data. Never add a Supabase service-role or secret key to browser code.
