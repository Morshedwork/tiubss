# TIU BSS — A little Bangladesh. A world of belonging.

## Current live architecture and food ticketing (27 October 2026)

The app imports `dist/js/live-store.js` and the Firebase adapter. Historical demo notes below describe earlier builds; `store.js` is now only a legacy test fixture and is not imported by the live app. The public Firebase web config is set. Authentication works independently of the protected write backend.

Food UI routes: `#/food`, `#/events/:slug/food`, `#/tickets`, `#/staff/food`, `#/admin/menu`, `#/admin/vendors`, and `#/admin/orders`. They support published stall menus, one-stall baskets isolated per account, retry-safe reservations, server-authoritative prices and inventory, 30-minute cash reservation expiry, private structured QR tickets, kitchen queues, exact cash confirmation, and one-time collection. Order codes are verified server-side; a QR alone does not grant staff access. Online card payments and refunds are not connected.

The frontend and backend source are complete, but **real ordering is not activated**. The public `placeFoodOrder` endpoint returned HTTP 404 during this update; App Check has no site key. Google console access was blocked before sign-in. Deploy the Firebase functions/indexes, configure App Check, grant the administrator role, then publish a real event, stalls, and dishes using the included admin screens. Billing activation may be required. See `firebase/README.md` for deployment and production acceptance checks. No real purchases, orders, cash receipts, or member records were created during testing.

Verification: isolated browser flow covered basket → checkout → QR → preparation → ready → cash/change → scanned pickup → collected history. Backend tests exercise the actual compiled handlers against a transactional Firestore substitute; these are not deployed Firebase/emulator acceptance tests. Live end-to-end verification must follow activation.

## Google profile pictures (27 October 2026)

New Google accounts use the authenticated Google-provider picture in onboarding and the private dashboard. The profile editor offers upload/change, use Google picture, and remove. A private `photoSource` preference distinguishes Google, custom, and no-photo choices. Custom uploads and explicit removals survive sign-in; legacy empty photos remain empty. Google-selected private profiles use the current provider picture, and saving updates the server projection. The backend resolves Google photos from Firebase Admin provider data rather than trusting a submitted Google URL. Directory photo publication still requires approval, opt-in, and the photo field permission.

Unsaved drafts stay in the current tab and are isolated by account. Uploads and saves guard against account switches; blocked or failed saves keep the form available to retry and never claim success. Profile saving still requires the pending Firebase Functions/App Check activation, and new uploads require Storage activation. No Firebase account or real member was modified for this update. Verification passed 75 frontend tests and 26 backend handler tests. Isolated desktop browser checks covered remove → save → sign-in → still removed → restore Google. The dashboard and editor fit a 375 px mobile content area without horizontal page overflow.

---

## Earlier design history

A responsive community website inspired by Bangladeshi rickshaw painting, peacocks, lotus flowers, and the visual brief supplied for TIU Bangladesh Student Society.

## Festive digital mela and art studio

The new digital mela is available on the homepage and at `#/mela`. Three original transparent painted stalls—food, art, and adda—sit as individual objects on an open cream canvas. The original hero rickshaw remains, and a smaller rickshaw travels between stalls when visitors select a stop or choose **Hop on**. Each explored stall leaves a browser-local keepsake stamp. Food selection connects to the existing event menu and ticket flow; the adda stall opens the community wall. Bunting, lantern details, bright signboards and softly glowing lights carry the festive mood through the site.

`#/art-studio` is a functional postcard maker. Visitors choose a palette and rickshaw/flower/bird motif, add a Bangla or English greeting, note and sign-off, save a local draft, download a 1200 × 1500 PNG, or save a compressed print to the browser-local gallery. Canvas export waits for the same-origin motif and fonts, handles failures, and suppresses stale output after navigation. These controls do not publish to a live community or send messages. Studio **Start fresh** clears its draft; clearing site data clears mela keepsakes. The demo reset only resets the main community data store.

Implementation: `dist/js/mela.js`, `dist/mela.css`, `dist/js/art-studio.js`, `dist/art-studio.css`, and `dist/festive-v5.css`. The final theme link is loaded after the prior styles. All motion follows the existing pause and reduced-motion settings. Audio is still only the explicitly clicked hero rickshaw bell.

Validation: 41 virtual-DOM interaction checks passed across 52 routes, including stall navigation, keepsakes, food-event selection, art controls, drafts, gallery saves, export error recovery and navigation during export. All 15 store/QR tests passed. All 13 CSS sources parsed without errors. The export tests use explicit Canvas/Image stubs to check control flow and dimensions; actual PNG pixels and responsive browser rendering have not been verified because browser QA is unavailable here.

## Rickshaw centerpiece refresh

The homepage brings back the colourful rickshaw as a freestanding, transparent illustration on an open cream canvas. Small Dhaka and Tokyo postage stamps, a subtle route line, a Bengali seal, and a user-triggered bell add character around the vehicle. The large landmark mural no longer appears in the homepage, culture, or story layouts. The culture explorer uses individual illustrated stamps instead of scene crops, and its art viewer opens the rickshaw.

The supplied peacock and rose references remain in the story collage, gallery, community welcome, join/member surfaces, and profile corner. `dist/js/rickshaw-stage.js` and `dist/rickshaw-v4.css` add the current composition to the existing homepage and cultural explorer. The optional bell plays a short synthesized chime only after an explicitly labeled button click; it also works with a visual acknowledgement when audio is unavailable.

The motion controls remain supported: pause, reduced motion, route and section entrances, pointer parallax, and interaction feedback. Missing browser enhancement APIs leave content visible. Validation: 32 virtual-DOM interaction checks passed across the existing routes; all 10 CSS sources passed parsing/grammar checks. Browser visual/mobile rendering verification is unavailable in this environment.

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
- `#/culture`: individual landmark postcards, selectable cultural stories, and the freestanding rickshaw artwork.
- `#/mela` (also `#/stalls`): illustrated interactive food, art and community stalls, a rickshaw route, and local keepsake stamps.
- `#/art-studio`: personalised painted postcards, local drafts, PNG downloads, and gallery saves.
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

Historical note (superseded by the live architecture above): this adapter was initially not wired into the synchronous demo screens. Supplying keys alone does not make the UI live. The next implementation step is to connect the asynchronous live adapter to the screens and carry out the staging/emulator acceptance tests. See `firebase/README.md` for the actual field mappings, method signatures, project configuration, role setup, and limitations. Never mix live identity or private data into local demo records.

Historical note: `dist/firebase-config.js` was initially empty; it now contains the user-supplied public web configuration. Web app identifiers and an App Check public site key belong there once a project is supplied. Service-account keys and payment provider secrets never belong in the frontend. The website uses Sites owner-private hosting authentication at the hosting layer; this does not implement Firebase membership sign-in.

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

- `dist/assets/mela-stall-food-v5.webp`, `mela-stall-art-v5.webp`, and `mela-stall-adda-v5.webp`: original freestanding hand-painted festival stalls, generated using the built-in Image Generation tool with transparent backgrounds. Palette and floral sign details reference the newly supplied burgundy/red/pink/yellow Bangla artwork. Each 1254-square source retains alpha transparency; no full background scene was added. Final prompts are recorded in `art-direction-v5.md`.
- `festival-bunting-v5.svg` and `festival-lantern-v5.svg`: original code-native decorations extending the site's existing folk ornament system.

- `dist/assets/rickshaw-cutout-v4.webp`: transparent version of the earlier rickshaw centerpiece, edited with the built-in Image Generation tool. Prompt: “Background-extraction edit of the original painted Dhaka cycle rickshaw. Keep only the exact rickshaw: three-quarter rear-side angle, fuchsia canopy, green peacock-and-rose back panel, blue wheels, frame, handlebars, and painted texture. Remove the cream canvas, external birds and flowers, river, sunset, palms, and ground. Preserve genuinely transparent areas between spokes and around handlebars. Keep the complete vehicle in frame with modest breathing room. No additions, frame, text, watermarks, or new background.” Alpha transparency is preserved in the deployed WebP.
- `landmark-dhaka-v4.svg`, `landmark-tokyo-v4.svg`, `landmark-parliament-v4.svg`: original code-native postage-stamp illustrations with cream perforated edges, forest linework, red focal accents, and gold botanical details.

- `dist/assets/bangladesh-japan-v3.webp`: retained prior-version artwork, no longer displayed in the current page layouts. Original mural generated with the built-in Image Generation tool. Final prompt: “An exquisitely detailed handpainted Bangladeshi rickshaw-art landscape joining Bangladesh to Japan, inspired by the supplied peacock and rose art; saturated green, vermilion, sunflower yellow, cobalt and fuchsia enamel brushwork; stylised Dhaka Parliament House, Shaheed Minar, a Lalbagh-inspired pavilion, painted cycle rickshaw, river, boat, peacocks and roses; Tokyo Tower, distant Mount Fuji, sakura and a traditional gateway; small groups of fictional university-age friends; warm cream sky and botanical border. A hopeful cultural mural, no text, logos, watermarks, photorealism or geographic accuracy implied.” The detailed original prompt is in `art-direction-v3.md`. Final source asset is 1536 × 1024; the site uses WebP compression.
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

## Community homepage and Instagram sections (V6)

The homepage now starts with people, a filterable community noticeboard, the adda wall and gatherings. The painted rickshaw lives in a smaller ride-to-the-mela section further down. Homepage note actions reuse the working community composer and replies. A numbered section navigator moves focus and respects motion preferences.

`#/reels` separates Community, Gatherings, Food & mela, and Bangladesh × Japan reel links. Instagram is not queried on initial page load. A visitor can explicitly load an Instagram iframe for a published, validated reel, with a permanent direct link when Instagram refuses the preview. Provider playback has not been verified in a live browser. No reel content, cover photos, view counts, likes, or accounts were fabricated. The account feed could not be retrieved during development.

Admin → Instagram reels accepts individual URLs or atomic batches of 1–100 direct links. It supports draft review, editable titles/captions/categories, publishing and removal. These are browser-local demo records, not an automatic or shared Instagram feed. To supply a curated deployment seed, provide verified direct public reel URLs and their desired categories.

The gallery has separate Community photos and Artworks sections; bundled illustrations stay in Artworks even when categorized as a celebration. This update preserves existing locally saved profiles, orders, gallery items and community posts.

## Illustrated community hero (V7)

The homepage introduces the Bangladeshi student community at Tokyo International University with “Your Bangladesh, right here at TIU.” The original transparent ink-and-watercolour illustration centres eight fictional students sharing adda and food, with smaller rickshaw, Shaheed Minar, Tokyo Tower and folk details. It is an imagined community illustration, not a photograph of members or a documentary view of the campus. Its full built-in image-generation prompt and provenance are in `art-direction-v7.md`; the self-hosted WebP is `dist/assets/community-sketch-v7.webp`.

The hero supports English/Bangla, a profile-aware join/community action, event links and people/adda/culture shortcuts. The existing interactive noticeboard is beside the member directory preview below the hero. Existing mela, art studio, profile, admin and reel sections remain available. The managed browser preview could not start due to a container process-mount permission error; visual browser verification was unavailable for this update.
