# TIU BSS — A little Bangladesh. A world of belonging.

A responsive community website inspired by Bangladeshi rickshaw painting, peacocks, lotus flowers, and the visual brief supplied for TIU Bangladesh Student Society.

## Bangladesh–Japan community refresh

The homepage pairs bold editorial type with an original painted landscape connecting Bangladesh’s Shaheed Minar and Parliament House to Tokyo Tower, Mount Fuji, and cherry blossoms. The supplied peacock and rose references appear in the story collage, gallery, community welcome, join/member surfaces, and profile corner. An interactive cultural trail reveals four short landmark stories and links to official reference sources. `#/culture` presents the complete artwork.

`dist/js/home-v2.js`, `dist/js/culture-v3.js`, `dist/rickshaw.css`, `dist/culture-v3.css`, `dist/rickshaw-inner.css`, and `dist/community-wall.css` contain the visual revision. Motion includes route and section entrances, fine-pointer panorama parallax, floating ornaments, SVG path drawing, card feedback, and modal transitions. The persisted Pause motion control and system reduced-motion preference remain supported. Missing observer APIs leave content visible.

The community adda wall supports profile-required posts, introductions/questions/moments filters, reactions, replies, author deletion, and admin hide/restore moderation. It starts empty, with illustrated conversation prompts; it does not invent community activity. Profile removal clears associated contributions. Admin settings now update the displayed community name, Instagram link, and contact email; announcements appear on the homepage. Food quantity changes preserve the pickup slot and can remove items after inventory drops below an existing cart quantity.

Validation uses store/QR tests, virtual-DOM interaction checks across public/admin/staff routes, local asset checks, and CSS parsing/grammar checks. No browser visual/mobile rendering check is available in this environment.

## Current delivery

The published site is an owner-private interactive demonstration. It is a buildless HTML/CSS/JavaScript app in `dist/`; no framework build is required. All member records, registrations, food orders, gallery uploads, and admin changes in this demo are saved in browser localStorage (`tiu-bss-demo-v1`). They are not shared between devices, authenticated, or sent to a Firebase database. Use sample information.

The interface is intentionally explicit about this boundary. Demo tickets do not confer real event admission. Online payment is not offered. Cash orders stay due until recorded by the demo cashier. Messages and application forms stay in the local admin workspace; nothing is sent to other people.

## Explore

- `/` (hash route): original folk-art homepage, gatherings, community, gallery.
- `#/events`, `#/events/:slug`: filters, details, free registration and QR entry tickets.
- `#/events/:slug/food`: event menu, quantities, cart, pickup slot and cash-due ordering.
- `#/join`, `#/profile`: profile, education and employment, directory opt-in, tickets, orders, export and profile removal.
- `#/community`, `#/alumni`, `#/members/:id`: searchable opted-in directory and member profiles. `#/community?wall=1` opens the interactive local adda wall.
- `#/culture`: Bangladesh–Japan artwork and selectable cultural stories.
- `#/admin/wall`: community post moderation and reply review.
- `#/gallery`: artwork lightbox and category filters.
- `#/about`, `#/mission`, `#/history`: community story and values.
- `#/news`, `#/news/:id`: published news from the demo CMS.
- `#/volunteer`, `#/mentorship`, `#/partners`, `#/contact`: local request/application forms.
- `#/committee`: editable committee roster; empty until content is added in admin.
- `#/privacy`, `#/terms`: preview privacy information and community guidelines.
- `#/verify-certificate/:id`: verification not connected; never invents a verified certificate.
- `#/admin`: operations overview, events, members, food orders/menu/counters, gallery, committee, partners, news/content, volunteers, inbox, reports, roles, and settings.
- `#/staff/food`, `#/staff/check-in`: kitchen transitions/cash/pickup and event entry check-in with manual fallback.
- `#/setup`: in-product implementation and connection status.

Navigation and homepage copy support English/Bangla. Operational modules are primarily English; full bilingual production copy remains work for launch.

## Demo walkthrough

1. Create a demo profile at `#/join`. Directory visibility defaults off; membership approval is managed in the demo admin.
2. Open an event and select **Count me in**. Confirm your registration to receive a real scannable QR containing a demo token.
3. Open that event’s food table, add dishes, choose a pickup slot, and place the sample order. This reserves local stock and issues a separate food token.
4. Open Admin → Food orders or `#/staff/food`. Advance **Start preparing**, **Mark ready**, record the cash collected, and confirm pickup. The store rejects unpaid collection and duplicate pickup.
5. Open `#/staff/check-in`. Paste an event token or select a guest. The store rejects a second check-in and cancelled tickets.
6. Open Community → Adda wall, write an introduction, react/reply, and review moderation in Admin → Adda wall.
7. Add/edit an event, food item, counter, news story, or gallery image. Reload to check browser-local persistence. Download CSV reports. Admin → Settings can reset demo data.

Manual QR-token lookup is implemented. Camera scanning is not connected. The demo cannot guarantee cross-device or concurrent multi-user consistency; live operations must use the provided server transaction layer.

## Firebase foundation

The user requested Firebase, so no alternative backend was substituted. `firebase/` contains TypeScript Cloud Functions, Firestore/Storage rules, indexes, an administrator bootstrap script, package lock, and detailed deployment instructions. `dist/js/firebase-service.js` provides a modular Firebase adapter for authentication, profiles, free tickets, cash food operations, uploads and CMS.

This adapter is **not wired into the synchronous demo screens**. Supplying keys alone does not make the UI live. The next implementation step is to connect the asynchronous live adapter to the screens and carry out the staging/emulator acceptance tests. See `firebase/README.md` for the actual field mappings, method signatures, project configuration, role setup, and limitations. Never mix live identity or private data into local demo records.

`dist/firebase-config.js` is empty by design. Web app identifiers and an App Check public site key belong there once a project is supplied. Service-account keys and payment provider secrets never belong in the frontend. The website uses Sites owner-private hosting authentication at the hosting layer; this does not implement Firebase membership sign-in.

Not connected or fully implemented: production Firebase screen integration, verified online checkout/refunds, outbound event emails/push, advanced ticket categories, waitlists, vouchers/food variants/meal entitlements, certificate issuance, private albums, complete bilingual operational copy, and production aggregate reporting.

## Run and check

Serve `dist/` as a static site. For hosted development, use the Sites preview workflow when the environment provides its browser QA skill.

```sh
npm run check
npm test
cd firebase/functions
npm ci
npm run build
```

The static app requires no npm packages. Tests exercise capacity, deduplication, one-time check-in/pickup, inventory validation, cash gates, cancellation, persistence, CSV safety, and QR construction. Firebase TypeScript compilation passes. Firebase emulator/security tests and live provider integration have not been run without a configured project. Visual browser QA is unavailable in this execution environment; responsive styles and SVG assets have been inspected at source/artwork level.

## Assets and credits

- `dist/assets/bangladesh-japan-v3.webp`: original mural generated with the built-in Image Generation tool. Final prompt: “An exquisitely detailed handpainted Bangladeshi rickshaw-art landscape joining Bangladesh to Japan, inspired by the supplied peacock and rose art; saturated green, vermilion, sunflower yellow, cobalt and fuchsia enamel brushwork; stylised Dhaka Parliament House, Shaheed Minar, a Lalbagh-inspired pavilion, painted cycle rickshaw, river, boat, peacocks and roses; Tokyo Tower, distant Mount Fuji, sakura and a traditional gateway; small groups of fictional university-age friends; warm cream sky and botanical border. A hopeful cultural mural, no text, logos, watermarks, photorealism or geographic accuracy implied.” The detailed original prompt is in `art-direction-v3.md`. Final source asset is 1536 × 1024; the site uses WebP compression.
- `dist/assets/sakura-folk-v3.svg`: original code-native ornament combining sakura blossoms with the site’s painted leaves.
- Landmark references: Bangladesh Tourism Board ([Shaheed Minar](https://beautifulbangladesh.gov.bd/cat/landmarks/92), [National Parliament House](https://beautifulbangladesh.gov.bd/loc/dhaka/102)) and GO TOKYO ([Tokyo Tower](https://www.gotokyo.org/en/spot/4/index.html), [Spring](https://www.gotokyo.org/en/story/guide/spring/index.html)). These links appear alongside cultural stories; generated art is an imagined interpretation, not documentation of the places or events.

- `dist/assets/rickshaw-hero-v2.webp`: original generated hand-painted Dhaka rickshaw illustration for the refreshed homepage, created with the built-in Image Generation tool. Prompt called for a three-quarter rear-side rickshaw, bright fuchsia canopy, blue wheels, peacock/rose panels, vivid enamel-paint colors, warm cream background, no text, people, logos, or watermark.
- `rickshaw-flower.svg`, `rickshaw-vine.svg`, `rickshaw-trim.svg`, and `rickshaw-bird.svg`: original decorative SVG artwork extending the site’s folk-art visual language. Self-contained, no external resources.
- `dist/assets/folk-hero.webp`: original generated peacock/lotus illustration made for this website using the built-in image generation tool. Prompt: “Original hand-painted Bangladeshi rickshaw folk art, two golden peacocks facing one another, emerald and jade leaves, cream dotted scallops, pink lotus flowers, gold linework, deep forest-green background, no text, no logos, no watermark.”
- `reference-peacocks.webp` and `reference-flowers.webp`: uploaded visual references supplied for this task. They are labeled as artwork rather than event photographs.
- Event posters and food illustrations: original self-contained SVG artwork. Poster fonts are outlined for portable rendering.
- Typography: Fraunces, DM Sans and Noto Serif Bengali, requested through Google Fonts with local system fallbacks. Consider self-hosting the licensed font files before public launch.
- Scannable QR generation uses the bundled Kazuhiko Arase QRCode encoder. See `THIRD_PARTY_NOTICE.txt` for preserved notices.

No official committee biographies, real upcoming-event claims, member photographs, or organizational statistics were invented. Seeded records are explicitly demonstration content.
