# TIU BSS — Firebase backend

The site frontend now targets Firebase project `tiu-bss` using the supplied public web configuration. Member login/logout, profile data, community activity, registrations, food orders and content operations use the live adapter, without a local-demo fallback. Authentication is enabled and Firestore is provisioned; Storage billing, App Check and backend deployment are still required; the web configuration is not an administrator credential. No payment processor, outbound event email service or push notifications are connected.

Current console status on 20 October 2026:

- Firebase Authentication is initialized; Email/Password and Google both show Enabled. The production site hostname is authorized, and the public configuration endpoint returns HTTP 200.
- Firestore Standard database `(default)` was created in `asia-northeast1` (Tokyo). The prepared `firestore.rules` file was published successfully in the console. Client writes remain denied; validated Cloud Functions own writes.
- Firebase Storage explicitly requires the project owner to upgrade from Spark to Blaze. No billing plan change was performed.
- The `asia-northeast1` `saveProfile` function endpoint returned HTTP 404; backend functions and indexes remain to deploy.
- No App Check public site key is configured. Callable writes intentionally remain protected; account sign-in itself does not require that key.
- Firebase JavaScript SDK 13.0.0 was reachable. No real member accounts were created and no end-to-end account/upload test was performed.

The billing requirement, undeployed functions, and missing App Check key prevent profile/community saves and picture uploads. The website reports these failures instead of showing false success.

## Food ticketing update — 27 October 2026 (Japan time)

The stall ordering, ticket wallet, cash receipt, queue, and pickup implementation is prepared in this source. This is **not confirmation of a live Firebase backend deployment**. Source checks cannot activate Cloud Functions, App Check, billing, or staff privileges. Complete the activation steps below before taking real orders. No online payment processor is connected; the supported payment method is cash recorded by an authorized stall operator.

Changes to the food backend:

- New orders snapshot the stall name, pickup location, customer name, and a `BSS-XXXXXXXXXXXX` reference. Order names and ticket tokens remain in private order documents, never the public profile directory. Callable order results use ISO timestamps.
- Every dish belongs to an existing stall at the selected event. Ordering requires a published matching stall, a published food-enabled event before both cutoff and end, a signed-in customer with a saved name, and an event registration unless `allowGuestFood` is enabled. Suspended members cannot order. Profile completion and food ordering do not add a new email-verification requirement; community posting retains its existing verification gate.
- Checkout ignores client prices, canonicalizes item order, reserves stock transactionally, enforces event-wide per-customer limits, and reuses the same request ID safely after a lost response. A different cart cannot reuse that ID. One order covers one stall.
- All existing menu edits must include `expectedStock`, even when only changing the description or price. A stale edit cannot restore stock reserved by another customer. Existing stalls and dishes cannot be moved across events.
- `lookupFoodOrder({orderId,token})` validates a structured food ticket without depending on the current queue page. Legacy raw pickup tokens use `{code:token}`. Explicit staff lookup uses `{orderId,manual:true}` or `{code:orderNumber,manual:true}`; manual lookup is audited. The result is `{order:{id,...}}`. Current role and event/stall scope are required for every path. Use a full order ID if a shortened reference is ambiguous.
- A scoped stall manager or an administrator can cancel an eligible unpaid, unprepared reservation. Customers can cancel their own eligible reservations. Each reservation releases stock and usage once. Paid or prepared orders require operational handling at the stall and are not automatically cancelled or refunded.
- Cash receipt requires the exact server total. Staff pickup verifies the ticket token, or requires explicit manual mode, and atomically records a single redemption. A second pickup is rejected. Complimentary orders remain distinct from paid cash orders.
- Active-order queue indexes are included for member, stall, and administrator queries. The frontend loads active orders separately from bounded recent history so older open tickets are not hidden by newer completed orders.

Run the actual callable-handler transaction tests with:

```bash
cd firebase/functions
npm ci
npm test
```

The tests use a serialized in-memory Firestore substitute to exercise the compiled handlers. They cover last-portion contention, retry idempotency, server pricing, limits, cancellation, scope revocation, cash amounts, token validation, duplicate pickup, expiry, and stale inventory. They do not replace deployed App Check, security-rule, camera, or multi-device acceptance testing.

After activation: create and publish the event, set its food cutoff, create and publish each stall for that event, add active dishes with accurate prices/stock/limits/allergens, and assign staff to both event and stall. Sign staff out and back in after assigning roles. Test one real account order through cash receipt → preparation → ready → pickup, then retry the same pickup to confirm rejection before opening the stall to customers. Do not fabricate live menu prices, events, or stock as part of setup.

## What is implemented

- Firebase Google and email/password authentication, email verification and password reset via `dist/js/firebase-service.js`.
- Private member profiles, education and employment history, server-approved membership, and a separate public directory projection. The projection is published only for approved members who explicitly opt in. Email and phone can never enter it. Field visibility is restricted to a whitelist.
- Free event creation, bounded capacity, one registration per member/event, retry-safe registration, cancellation, separate secure event token, and atomic check-in that rejects a duplicate scan.
- Server-priced cash-at-counter food orders, one counter per order, atomic stock reservation, event-wide per-person limits, per-user request idempotency, separate pickup token, and scoped staff access.
- Confirmed → preparing → ready → collected transitions. Only authorized counter staff can record the exact cash due as paid. Collection requires paid/complimentary status and atomically creates a one-time redemption record. Manual staff lookup is allowed and audited.
- Unpaid confirmed reservations expire after 30 minutes or the food-ordering cutoff (whichever is earlier). A scheduled function releases stock every five minutes. Cancelled eligible orders also release stock once. Orders already being prepared or paid are not cancelled automatically.
- Server-owned role assignment checked against current assignment records as well as ID-token claims, current event/vendor scopes, immutable audit entries, public-content CMS writes, image uploads, and a server-side per-user rate limit on profile/registration/food creation.

## Activate this project

1. Authentication and Firestore are already initialized. The project owner must enable the Blaze billing plan at https://console.firebase.google.com/project/tiu-bss/overview, then provision Storage and Cloud Functions. The Firestore database and functions use `asia-northeast1` (Tokyo).
2. The authorized domain `tiu-bss-community.agile-poppy-0617.chatgpt.site` is already configured in Authentication → Settings → Authorized domains. Keep `tiu-bss.firebaseapp.com` authorized. Add `localhost` only for intentional local development. Do not include a protocol or path in an authorized-domain entry.
3. Register the web app with Firebase App Check using reCAPTCHA v3. Add the site hostname to the provider configuration. Callable functions enforce App Check. Missing/invalid tokens are rejected, so an API config alone does not make mutations work.
4. The public web config is already set in `dist/firebase-config.js` before the module loads. Keep it and set the App Check public site key:

```js
window.BSS_FIREBASE_APP_CHECK_KEY = 'YOUR_RECAPTCHA_V3_SITE_KEY';
```

Web config identifiers are not an administrator credential. Never insert a service-account JSON, private key, or payment-provider secret into this file or any frontend asset.

5. Use Node 22, install the Firebase CLI, sign in to your own project, and deploy from this directory:

```bash
cd firebase/functions
npm ci
npm run build
cd ..
firebase deploy --project tiu-bss --only firestore,storage,functions
```

The deploy command applies the deny-by-default rules and indexes. Storage rules use Firestore-backed role checks; enable the Cloud Storage rules service permission to read Firestore when Firebase requests it on first deployment. Wait for composite indexes to finish building before opening dependent screens. Firestore TTL on `rateLimits.expiresAt` cleans up old rate-limit counters; expiration checks do not depend on TTL punctuality.

6. Create your administrator's account through Firebase Auth. With Application Default Credentials authorized for your project, run:

```bash
GOOGLE_CLOUD_PROJECT=tiu-bss node scripts/bootstrap-admin.cjs YOUR_FIREBASE_AUTH_UID
```

Then sign out and sign in. Administrator status is a Firebase custom claim set through a trusted server; changing a browser/localStorage profile cannot grant a live role. Use `assignStaff` to grant additional scoped roles. New privileges require a refreshed token. Demotions and scope removals also check the current server-owned assignment, so an older token cannot retain a removed role. Refresh/sign out to update the visible dashboard after changing privileges.

7. The frontend is wired to the live adapter. Do not upload demonstration members as real people. After activating Firebase, verify login/logout, persistence after reload, profile save and upload, public opt-in approval, free registration, cash food ordering and staff access using accounts you own. Republish the frontend when adding the App Check site key. The Sites audience is managed separately from Firebase membership; its current sharing settings are preserved.

## Adapter API

All data methods reject when unconfigured; none writes fallback sample data on a Firebase failure. `initFirebase()` returns `{configured,user,roles,error}`. `subscribeAuth(listener)` returns an unsubscribe function. `getAuthState()` returns a snapshot. Functions use the fixed Tokyo region.

Authentication: `signInWithGoogle()`, `signInWithEmail(email,password)`, `signUpWithEmail(email,password,displayName)`, `signOut()`, `sendPasswordReset(email)`, `sendVerificationEmail()`, `refreshClaims()`, `reloadUser()`, `friendlyError(error)`. Signup returns the created credential with optional `warnings` for verification-email or display-name failures; those failures never misreport account creation as failed. Sessions persist in browser storage when available; restricted browsers receive a session-only warning.

Profiles: `getMyProfile()`, `saveMyProfile(patch)`, `approveMembership(uid,status)`, `getPublicProfiles()`.

Events: `getEvents()`, `createEvent(data)` (also updates when `data.id` exists), `registerForEvent(eventId,requestId)`, `cancelRegistration(registrationId)`, `checkInRegistration(registrationId,token?)`, `getMyRegistrations()`, `getEventRegistrations(eventId)`.

Food: `getMenu(eventId)`, `saveMenuItem(data)`, `placeFoodOrder(eventId,items,requestId)`, `cancelFoodOrder(orderId)`, `lookupFoodOrder({orderId?,token?,manual?,code?})`, `advanceFoodOrder(orderId,action,token?,amountJPY?)`, `getMyOrders()`, `getStaffOrders(eventId,vendorId)`. `items` is `[{itemId,quantity}]`. Create the UUID request ID once per attempted checkout and reuse it on network retry. A new repeat order must have a new ID.

For cash collection, call `advanceFoodOrder(id,'confirmPayment',undefined,order.totalJPY)`. The function checks both the operator's role and amount against the stored total. It does not trust an arbitrary `paid` flag. Use actions `prepare`, `ready`, and `pickup` for the kitchen flow. Omit a ticket token only for explicit authenticated staff manual lookup; scanner actions should send the token.

Content: `saveContent(collection,id,data)`, `getContent(collection)`, `uploadImage(file,{kind:'gallery'|'avatar',id})`, `getAdminOverview()`, `assignStaff(uid,roles,eventIds,vendorIds)`. `getAdminOverview()` returns the first 100 records per collection and labels this limit; it is not an unbounded aggregate accounting report. Other list helpers also cap at 100. Implement pagination/aggregate queries before using larger live datasets.

Valid content collections: `websiteContent`, `albums`, `photos`, `newsPosts`, `committeeTerms`, `partnerOrganizations`, `volunteerOpportunities`, `vendors`, `reels`. `getContent(collection,{includeDrafts:true})` still depends on server rules, never on frontend roles alone. `deleteContent(collection,id)` handles CMS deletion; food counters must be unpublished to preserve order references. Saved text is plain text; render it with `textContent` or a trusted escaping template, never raw HTML.

Community: `getCommunityPosts()`, `createCommunityPost({body,category})`, `deleteCommunityPost(id)`, `togglePostHeart(id)`, `replyToPost(id,body)`, `moderatePost(id,status)`. Posting requires a saved non-suspended profile and verified email. Names come from the server profile, identities from Auth. Notes are capped at 600 characters, replies at 300 characters/100 per thread, and hearts at 1,000 per post; writes are rate-limited. Deletion is owner-only; moderation requires a current content-editor/admin assignment. Published notes are public, so the UI explains visibility before submission.

Requests: `submitCommunityRequest(data)`, `getMyRequests()`, `getIncomingRequests()`, `updateCommunityRequest(id,status)`. Contact, partnership, volunteering, connection and mentoring requests are stored privately for the sender, the target member where applicable, and administrators. Sender IDs and email cannot be supplied or overridden by a client. These are website inbox records; no outbound email is sent. `requestId` is optional and can be retained across retries to avoid duplicates.

## Data conventions

Event fields: `title`, `titleBn`, `description`, `slug`, `category`, `venue`, `startsAt`, `endsAt`, `registrationClosesAt`, `capacity`, `foodEnabled`, `foodClosesAt`, `allowGuestFood`, `status`. Date input is an ISO timestamp with a timezone or epoch milliseconds. Use `ticketPriceJPY:0`; paid admission is deliberately rejected until verified payment integration exists. `event_manager` can edit assigned events; an administrator creates a new event and assigns staff.

Menu fields: `eventId`, `vendorId`, `name`, `nameBn`, `description`, `category`, `priceJPY` (integer), `stock` (remaining available stock), `perPersonLimit`, `active`, `allergens`, `ingredients`, `photoURL`, `pickupLocation`. For every existing item edit, include `expectedStock` with the last stock value read; concurrent changes reject stale edits instead of restoring already-reserved inventory. Upload a published counter record for the same event via the CMS and assign both the event and vendor IDs to staff. No unverified halal/dietary claims are introduced.

Profile fields: `name`, `nameBn`, `bio`, `photoURL`, `city`, `country`, `university`, `degree`, `major`, `graduationYear`, `company`, `jobTitle`, `industry`, `skills` (array), `linkedin`, `website`, `mentor`, `membershipType`, `directoryOptIn`, `publicFields`, `email`, `phone`, `education`, `employment`. Security roles and membership approval are never accepted from a profile edit. Default public fields are name and membership type; users explicitly choose any additional allowed fields.

Profile picture preferences (27 October 2026, Japan time): `saveProfile` also accepts the **private** `photoSource` field: `google`, `custom`, or `none`. Google mode resolves the account's linked `google.com` provider photo using Firebase Admin Auth; a submitted URL or top-level Auth photo is never trusted as a Google picture. An unavailable provider picture rejects an explicit Google selection. Custom mode accepts a validated HTTPS `photoURL` up to 2,000 characters; none clears it. New profiles without an explicit picture choice default to an available Google provider photo. Existing custom pictures, removed pictures, and legacy blank pictures stay unchanged during unrelated saves; older clients sending only `photoURL` remain supported. Picture source is never included in `publicProfiles`, and the picture itself still requires approval, directory consent, and per-field opt-in. This callable change requires backend deployment and App Check activation; publishing frontend files does not activate profile saves or Storage uploads.

Run `npm --prefix functions test` to validate picture preference behavior against the compiled callable with isolated Auth/Firestore substitutes, plus the existing onboarding and food checks. These tests do not verify live Firebase deployment, security rules, or App Check.

Onboarding additions in source: `semester` (integer 1–13, with 13 displayed as 13+), `instagram`, and `facebook`. A completed profile requires a full name, account email, private contact phone with 7–15 digits, and a short bio of 10–500 trimmed characters. Current students also require university, field of study, and semester; alumni require university and graduation year. Nonstudent semester values are cleared. Social links are optional, validated HTTPS URLs without embedded credentials. Semester and each social link can appear publicly only through explicit field opt-in; email and phone remain outside the public allowlist. The server derives `onboardingComplete` and uses the authenticated account email. A legacy member may withdraw consent using the minimal `{directoryOptIn:false}` patch (optional `publicFields` is accepted), even before completing newly required details. Other saves validate the merged profile. These backend changes still require deployment; publishing the website alone does not activate them.

Run focused onboarding validation checks with `npm --prefix functions run build` followed by `node --test functions/tests/profile-validation.test.cjs` from this directory.

Gallery files are intentionally public once uploaded into `gallery/`. Avatar objects allow owner/editor storage reads, but a Firebase download URL is a bearer URL; publishing an avatar URL in an opted-in public profile deliberately makes that image shareable. Do not upload sensitive documents through this helper. Private albums need a separate protected path and signed/authenticated retrieval implementation.

## Verification status and launch checks

The TypeScript source is compiled locally (`npm run build` and `npm run check`) and the frontend adapter/bootstrap script pass `node --check`. A targeted source review verified transaction reads occur before writes, private-profile projection uses an allowlist, staff reads are scoped, and malformed callable payloads are rejected. It also added current-assignment role revocation checks and stale-stock update protection. Firestore rule syntax was accepted by the console publisher; Firestore/Storage rule behavior has not been executed in an emulator. The supplied public project configuration was checked read-only as recorded above. Authorized deployment access, real account flows, rule behavior in an emulator, concurrent transactions, notifications and payment integration remain unverified. Do not present them as connected or production-tested.

Before launch, run Firebase Emulator Suite/security-rule tests and a staging end-to-end test for:

1. Registration under concurrency cannot exceed capacity; retrying an ID cannot create another ticket.
2. Public and unrelated member clients cannot read `/users/{uid}`, roles, private orders, payments, or audit records.
3. A pending/opted-out/suspended member has no public projection; a public profile never contains email/phone.
4. Cross-vendor and cross-event staff queries are denied, including direct document IDs.
5. A double event scan increments attendance only once; cancelled tickets cannot be checked in.
6. Concurrent food orders cannot oversell. Cancel/expiration release each reservation at most once. Per-person caps survive repeat ordering.
7. Unpaid food cannot be collected; only scoped staff can record exact cash payment. Double pickup is rejected.
8. Menu/event price manipulation in browser payloads cannot change the server-calculated amount.
9. Removed roles/scopes deny old tokens immediately on a subsequent authorization check; newly granted roles require token refresh. No frontend form assigns privileged claims.
10. Storage denies oversized/disallowed media and unauthorized edits; missing App Check tokens fail callable requests.

Outstanding full-spec extensions: paid admission/payment webhooks/refunds, guest checkout, waitlist promotion, advanced ticket categories, per-window ordering, food variants/vouchers/meal bundles, profile username reservation, complete account deletion/export workflow, outbound event emails/push, volunteer/certificate workflow, private galleries, production aggregates, and complete paginated admin tools. The backend is an intentional foundation for free tickets and cash food operations; the visual demo may illustrate further sections without claiming those services are live.

## Official Firebase references

- https://firebase.google.com/docs/functions/callable
- https://firebase.google.com/docs/firestore/manage-data/transactions
- https://firebase.google.com/docs/auth/admin/custom-claims
- https://firebase.google.com/docs/app-check/cloud-functions
- https://firebase.google.com/docs/web/learn-more#available-libraries


## Console setup progress — 20 October 2026

Firebase Authentication initialized through the owner’s console session. Email/Password and Google sign-in both show Enabled. Public app name is TIU BSS and support address is tiu.bss.admin@gmail.com. Authorized domain tiu-bss-community.agile-poppy-0617.chatgpt.site added and confirmed by the public project config endpoint (HTTP 200). Firestore Standard `(default)` in Tokyo was created and the prepared deny-by-default rules were published. Storage shows an explicit Blaze billing requirement; no plan upgrade was performed. Backend functions and App Check remain to deploy/configure. No real member accounts were created for testing.


## Member query indexes — 20 October 2026

Created the six Collection-scope indexes for ordinary portal startup in the Firebase console: events (`status` ASC, `startsAt` ASC), communityPosts (`status` ASC, `createdAt` DESC), registrations (`uid` ASC, `createdAt` DESC), foodOrders (`uid` ASC, `createdAt` DESC), and communityRequests (`uid` ASC or `toUserId` ASC, then `createdAt` DESC). Their definitions already exist in `firestore.indexes.json`. The console begins building each index on creation; wait for Enabled before retrying affected queries. Admin/staff-specific indexes still require deployment from the complete file. This does not activate backend writes or Storage.
