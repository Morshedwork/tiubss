# TIU BSS — optional live Firebase backend

The published visual demonstration uses browser-local sample data until its application is connected to this adapter. This folder contains deployable backend source; it is not evidence of a configured Firebase project. No real payment processor, outbound event email service, or push notifications are connected.

## What is implemented

- Firebase Google and email/password authentication, email verification and password reset via `dist/js/firebase-service.js`.
- Private member profiles, education and employment history, server-approved membership, and a separate public directory projection. The projection is published only for approved members who explicitly opt in. Email and phone can never enter it. Field visibility is restricted to a whitelist.
- Free event creation, bounded capacity, one registration per member/event, retry-safe registration, cancellation, separate secure event token, and atomic check-in that rejects a duplicate scan.
- Server-priced cash-at-counter food orders, one counter per order, atomic stock reservation, event-wide per-person limits, per-user request idempotency, separate pickup token, and scoped staff access.
- Confirmed → preparing → ready → collected transitions. Only authorized counter staff can record the exact cash due as paid. Collection requires paid/complimentary status and atomically creates a one-time redemption record. Manual staff lookup is allowed and audited.
- Unpaid confirmed reservations expire after 30 minutes or the food-ordering cutoff (whichever is earlier). A scheduled function releases stock every five minutes. Cancelled eligible orders also release stock once. Orders already being prepared or paid are not cancelled automatically.
- Server-owned role assignment checked against current assignment records as well as ID-token claims, current event/vendor scopes, immutable audit entries, public-content CMS writes, image uploads, and a server-side per-user rate limit on profile/registration/food creation.

## Set up a project

1. Create a Firebase project and web app. Enable Firestore, Storage, Authentication (Google and Email/Password), and Cloud Functions. Choose a Firestore location appropriate to your users; these functions use `asia-northeast1` (Tokyo). Provision billing/services required for deployment in your own account.
2. Add the actual site hostname to Authentication → Settings → Authorized domains.
3. Register the web app with Firebase App Check using reCAPTCHA v3. Add the site hostname to the provider configuration. Callable functions enforce App Check. Missing/invalid tokens are rejected, so an API config alone does not make mutations work.
4. In `dist/firebase-config.js`, provide the public web config before the module loads:

```js
window.BSS_FIREBASE_CONFIG = {
  apiKey: 'YOUR_WEB_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT',
  storageBucket: 'YOUR_EXACT_BUCKET_FROM_FIREBASE',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_WEB_APP_ID'
};
window.BSS_FIREBASE_APP_CHECK_KEY = 'YOUR_RECAPTCHA_V3_SITE_KEY';
```

Web config identifiers are not an administrator credential. Never insert a service-account JSON, private key, or payment-provider secret into this file or any frontend asset.

5. Use Node 22, install the Firebase CLI, sign in to your own project, and deploy from this directory:

```bash
cd firebase/functions
npm ci
npm run build
cd ..
firebase deploy --project YOUR_PROJECT_ID --only firestore,storage,functions
```

The deploy command applies the deny-by-default rules and indexes. Storage rules use Firestore-backed role checks; enable the Cloud Storage rules service permission to read Firestore when Firebase requests it on first deployment. Wait for composite indexes to finish building before opening dependent screens. Firestore TTL on `rateLimits.expiresAt` cleans up old rate-limit counters; expiration checks do not depend on TTL punctuality.

6. Create your administrator's account through Firebase Auth. With Application Default Credentials authorized for your project, run:

```bash
GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID node scripts/bootstrap-admin.cjs YOUR_FIREBASE_AUTH_UID
```

Then sign out and sign in. Administrator status is a Firebase custom claim set through a trusted server; changing a browser/localStorage profile cannot grant a live role. Use `assignStaff` to grant additional scoped roles. New privileges require a refreshed token. Demotions and scope removals also check the current server-owned assignment, so an older token cannot retain a removed role. Refresh/sign out to update the visible dashboard after changing privileges.

7. Connect live screens to the adapter instead of the local demonstration store. Do not upload the demonstration's sample members as real members. Verify the browser UI clearly indicates whether it is using local sample data or Firebase. Republish the frontend after config/application changes.

## Adapter API

All data methods reject when unconfigured; none writes fallback sample data on a Firebase failure. `initFirebase()` returns `{configured,user,roles,error}`. `subscribeAuth(listener)` returns an unsubscribe function. `getAuthState()` returns a snapshot. Functions use the fixed Tokyo region.

Authentication: `signInWithGoogle()`, `signInWithEmail(email,password)`, `signUpWithEmail(email,password,displayName)`, `signOut()`, `sendPasswordReset(email)`, `sendVerificationEmail()`, `refreshClaims()`.

Profiles: `getMyProfile()`, `saveMyProfile(patch)`, `approveMembership(uid,status)`, `getPublicProfiles()`.

Events: `getEvents()`, `createEvent(data)` (also updates when `data.id` exists), `registerForEvent(eventId,requestId)`, `cancelRegistration(registrationId)`, `checkInRegistration(registrationId,token?)`, `getMyRegistrations()`, `getEventRegistrations(eventId)`.

Food: `getMenu(eventId)`, `saveMenuItem(data)`, `placeFoodOrder(eventId,items,requestId)`, `cancelFoodOrder(orderId)`, `advanceFoodOrder(orderId,action,token?,amountJPY?)`, `getMyOrders()`, `getStaffOrders(eventId,vendorId)`. `items` is `[{itemId,quantity}]`. Create the UUID request ID once per attempted checkout and reuse it on network retry. A new repeat order must have a new ID.

For cash collection, call `advanceFoodOrder(id,'confirmPayment',undefined,order.totalJPY)`. The function checks both the operator's role and amount against the stored total. It does not trust an arbitrary `paid` flag. Use actions `prepare`, `ready`, and `pickup` for the kitchen flow. Omit a ticket token only for explicit authenticated staff manual lookup; scanner actions should send the token.

Content: `saveContent(collection,id,data)`, `getContent(collection)`, `uploadImage(file,{kind:'gallery'|'avatar',id})`, `getAdminOverview()`, `assignStaff(uid,roles,eventIds,vendorIds)`. `getAdminOverview()` returns the first 100 records per collection and labels this limit; it is not an unbounded aggregate accounting report. Other list helpers also cap at 100. Implement pagination/aggregate queries before using larger live datasets.

Valid content collections: `websiteContent`, `albums`, `photos`, `newsPosts`, `committeeTerms`, `partnerOrganizations`, `volunteerOpportunities`, `vendors`. Saved text is plain text; render it with `textContent` or a trusted escaping template, never raw HTML.

## Data conventions

Event fields: `title`, `titleBn`, `description`, `slug`, `category`, `venue`, `startsAt`, `endsAt`, `registrationClosesAt`, `capacity`, `foodEnabled`, `foodClosesAt`, `allowGuestFood`, `status`. Date input is an ISO timestamp with a timezone or epoch milliseconds. Use `ticketPriceJPY:0`; paid admission is deliberately rejected until verified payment integration exists. `event_manager` can edit assigned events; an administrator creates a new event and assigns staff.

Menu fields: `eventId`, `vendorId`, `name`, `nameBn`, `description`, `category`, `priceJPY` (integer), `stock` (remaining available stock), `perPersonLimit`, `active`, `allergens`, `ingredients`, `photoURL`, `pickupLocation`. When changing existing stock, include `expectedStock` with the last stock value read; concurrent changes reject stale edits instead of restoring already-reserved inventory. Upload a public counter record via the CMS and assign the vendor ID to staff. No unverified halal/dietary claims are introduced.

Profile fields: `name`, `nameBn`, `bio`, `photoURL`, `city`, `country`, `university`, `degree`, `major`, `graduationYear`, `company`, `jobTitle`, `industry`, `skills` (array), `linkedin`, `website`, `mentor`, `membershipType`, `directoryOptIn`, `publicFields`, `email`, `phone`, `education`, `employment`. Security roles and membership approval are never accepted from a profile edit. Default public fields are name and membership type; users explicitly choose any additional allowed fields.

Gallery files are intentionally public once uploaded into `gallery/`. Avatar objects allow owner/editor storage reads, but a Firebase download URL is a bearer URL; publishing an avatar URL in an opted-in public profile deliberately makes that image shareable. Do not upload sensitive documents through this helper. Private albums need a separate protected path and signed/authenticated retrieval implementation.

## Verification status and launch checks

The TypeScript source is compiled locally (`npm run build` and `npm run check`) and the frontend adapter/bootstrap script pass `node --check`. A targeted source review verified transaction reads occur before writes, private-profile projection uses an allowlist, staff reads are scoped, and malformed callable payloads are rejected. It also added current-assignment role revocation checks and stale-stock update protection. Firestore/Storage rule syntax and behavior have not been executed in an emulator. Live Firebase credentials, provider configuration, deployed rules, real Auth, concurrent transactions, notifications, and payment integration have not been verified against a user project. Do not present them as connected or production-tested.

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
