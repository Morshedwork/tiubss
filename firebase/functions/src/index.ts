import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp, Transaction } from 'firebase-admin/firestore';
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

initializeApp();
const db = getFirestore();
const options = { region: 'asia-northeast1', enforceAppCheck: true, maxInstances: 10 };
type Data = Record<string, any>;
type Request = CallableRequest<Data>;
function callable(handler: (req: Request) => Promise<unknown>) {
  return onCall(options, async (req: Request) => {
    if (!req.data || typeof req.data !== 'object' || Array.isArray(req.data)) return fail('invalid-argument', 'Expected an object payload.');
    return handler(req);
  });
}
const PUBLIC_FIELDS = ['name', 'nameBn', 'bio', 'photoURL', 'city', 'country', 'university', 'degree', 'major', 'graduationYear', 'company', 'jobTitle', 'industry', 'skills', 'linkedin', 'website', 'mentor', 'membershipType'];
const ROLES = ['member', 'super_admin', 'admin', 'event_manager', 'checkin_staff', 'food_vendor_manager', 'kitchen_staff', 'pickup_staff', 'content_editor'];
const now = () => FieldValue.serverTimestamp();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(24).toString('base64url');
const fail = (code: ConstructorParameters<typeof HttpsError>[0], message: string): never => { throw new HttpsError(code, message); };
function uid(req: Request): string {
  if (!req.auth) return fail('unauthenticated', 'Sign in to continue.');
  return req.auth.uid;
}
function str(value: unknown, name: string, max = 200, required = true): string {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) return fail('invalid-argument', `Invalid ${name}.`);
  return value.trim();
}
function id(value: unknown, name = 'identifier'): string {
  const result = str(value, name, 128);
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) return fail('invalid-argument', `Invalid ${name}.`);
  return result;
}
function integer(value: unknown, name: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) return fail('invalid-argument', `Invalid ${name}.`);
  return value as number;
}
function date(value: unknown, name: string): Timestamp {
  const millis = typeof value === 'number' ? value : Date.parse(String(value));
  if (!Number.isFinite(millis)) return fail('invalid-argument', `Invalid ${name}.`);
  return Timestamp.fromMillis(millis);
}
function roles(req: Request): string[] { return Array.isArray(req.auth?.token.roles) ? req.auth!.token.roles : []; }
const accessCache = new WeakMap<Request, Promise<Data>>();
function currentAccess(req: Request): Promise<Data> {
  const userId = uid(req);
  let pending = accessCache.get(req);
  if (!pending) {
    pending = db.doc(`staffAssignments/${userId}`).get().then(snapshot => {
      const assignment = snapshot.data() || {};
      const currentRoles = Array.isArray(assignment.roles) ? assignment.roles : [];
      return { ...assignment, roles: roles(req).filter(role => currentRoles.includes(role)) };
    });
    accessCache.set(req, pending);
  }
  return pending;
}
async function isAdmin(req: Request): Promise<boolean> { return (await currentAccess(req)).roles.some((role: string) => ['admin', 'super_admin'].includes(role)); }
async function authorize(req: Request, allowed: string[], eventId?: string, vendorId?: string): Promise<void> {
  const assignment = await currentAccess(req);
  if (assignment.roles.some((role: string) => ['admin', 'super_admin'].includes(role))) return;
  if (!assignment.roles.some((role: string) => allowed.includes(role))) return fail('permission-denied', 'Your current server-assigned role does not allow this action.');
  if (!eventId) return;
  if (!assignment.eventIds?.includes(eventId)) return fail('permission-denied', 'You are not assigned to this event.');
  if (vendorId && !assignment.vendorIds?.includes(vendorId)) return fail('permission-denied', 'You are not assigned to this food counter.');
}
function audit(tx: Transaction, actor: string, action: string, target: string, extra: Data = {}): void {
  tx.create(db.collection('auditLogs').doc(), { actor, action, target, ...extra, at: now() });
}
function verifyToken(actual: unknown, expected: unknown, manual: unknown): void {
  if (manual === true && actual === undefined) return; // Authenticated, scoped staff manual lookup.
  if (typeof actual !== 'string' || typeof expected !== 'string') return fail('invalid-argument', 'Invalid ticket token.');
  const a = Buffer.from(actual); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return fail('permission-denied', 'Ticket token is not valid.');
}
async function rateLimit(userId: string, operation: string, max: number): Promise<void> {
  const window = Math.floor(Date.now() / 60000);
  const ref = db.doc(`rateLimits/${hash(`${userId}:${operation}:${window}`)}`);
  await db.runTransaction(async tx => {
    const current = await tx.get(ref);
    if ((current.data()?.count || 0) >= max) return fail('resource-exhausted', 'Please wait a minute before trying again.');
    tx.set(ref, { count: (current.data()?.count || 0) + 1, expiresAt: Timestamp.fromMillis((window + 2) * 60000) });
  });
}
function profileProjection(profile: Data): Data | null {
  if (!profile.directoryOptIn || profile.membershipStatus !== 'approved') return null;
  const permitted = Array.isArray(profile.publicFields) ? profile.publicFields : ['name', 'membershipType'];
  const result: Data = { uid: profile.uid, updatedAt: now() };
  for (const field of PUBLIC_FIELDS) if (permitted.includes(field) && profile[field] !== undefined) result[field] = profile[field];
  return result;
}
function cleanProfile(data: Data): Data {
  const output: Data = {};
  for (const field of [...PUBLIC_FIELDS, 'email', 'phone']) {
    if (data[field] === undefined) continue;
    if (field === 'mentor') { if (typeof data[field] !== 'boolean') fail('invalid-argument', 'Invalid mentoring preference.'); output[field] = data[field]; }
    else if (field === 'skills') {
      if (!Array.isArray(data.skills) || data.skills.length > 20) fail('invalid-argument', 'Use up to 20 skills.');
      output.skills = data.skills.map((v: unknown) => str(v, 'skill', 60));
    } else if (field === 'graduationYear') output[field] = data[field] === '' ? '' : integer(Number(data[field]), field, 1950, 2100);
    else output[field] = str(data[field], field, field === 'bio' ? 2000 : 500, false);
  }
  for (const field of ['photoURL', 'linkedin', 'website']) {
    if (output[field] && !/^https:\/\//.test(output[field])) fail('invalid-argument', `${field} must be an HTTPS URL.`);
  }
  if (data.directoryOptIn !== undefined) {
    if (typeof data.directoryOptIn !== 'boolean') fail('invalid-argument', 'Invalid directory preference.');
    output.directoryOptIn = data.directoryOptIn;
  }
  if (data.publicFields !== undefined) {
    if (!Array.isArray(data.publicFields) || data.publicFields.some((f: unknown) => !PUBLIC_FIELDS.includes(String(f)))) fail('invalid-argument', 'Invalid public profile fields.');
    output.publicFields = [...new Set(data.publicFields)].slice(0, PUBLIC_FIELDS.length);
  }
  if (output.membershipType && !['student', 'alumni', 'professional', 'community', 'volunteer', 'committee'].includes(output.membershipType)) fail('invalid-argument', 'Invalid membership type.');
  for (const field of ['education', 'employment']) {
    if (data[field] !== undefined) {
      if (!Array.isArray(data[field]) || data[field].length > 10) fail('invalid-argument', `Use up to 10 ${field} entries.`);
      output[field] = data[field].map((entry: unknown) => {
        if (!entry || typeof entry !== 'object') return fail('invalid-argument', `Invalid ${field} entry.`);
        const allowed = field === 'education' ? ['university','degree','major','startYear','graduationYear'] : ['company','jobTitle','industry','startYear','endYear'];
        const item: Data = {};
        for (const key of allowed) if ((entry as Data)[key] !== undefined) item[key] = str(String((entry as Data)[key]), key, 150, false);
        return item;
      });
    }
  }
  return output;
}

export const saveProfile = callable(async req => {
  const userId = uid(req); const patch = cleanProfile(req.data || {});
  await rateLimit(userId, 'profile', 15);
  await db.runTransaction(async tx => {
    const ref = db.doc(`users/${userId}`); const old = await tx.get(ref);
    const profile: Data = { ...(old.data() || { membershipStatus: 'pending', createdAt: now(), directoryOptIn: false, publicFields: ['name', 'membershipType'] }), ...patch, uid: userId, updatedAt: now() };
    tx.set(ref, profile);
    const projection = profileProjection(profile);
    if (projection) tx.set(db.doc(`publicProfiles/${userId}`), projection); else tx.delete(db.doc(`publicProfiles/${userId}`));
  });
  return { ok: true };
});

export const approveMembership = callable(async req => {
  await authorize(req, []); const target = id(req.data.uid, 'member');
  const status = str(req.data.status, 'membership status');
  if (!['approved', 'rejected', 'suspended', 'pending'].includes(status)) fail('invalid-argument', 'Invalid membership status.');
  await db.runTransaction(async tx => {
    const ref = db.doc(`users/${target}`); const snap = await tx.get(ref);
    if (!snap.exists) fail('not-found', 'Member not found.');
    const profile = { ...snap.data(), uid: target, membershipStatus: status };
    tx.update(ref, { membershipStatus: status, updatedAt: now() });
    const projection = profileProjection(profile);
    if (projection) tx.set(db.doc(`publicProfiles/${target}`), projection); else tx.delete(db.doc(`publicProfiles/${target}`));
    audit(tx, uid(req), 'membership.status', target, { status });
  });
  return { ok: true };
});

export const saveEvent = callable(async req => {
  const eventId = req.data.id ? id(req.data.id) : db.collection('events').doc().id;
  await authorize(req, ['event_manager'], eventId);
  const data = req.data;
  const event: Data = {
    title: str(data.title, 'title', 160), titleBn: str(data.titleBn || '', 'Bangla title', 160, false), description: str(data.description || '', 'description', 6000, false),
    slug: id(data.slug || eventId, 'slug'), category: str(data.category || 'community', 'category', 50), venue: str(data.venue || '', 'venue', 300, false),
    startsAt: date(data.startsAt, 'start date'), endsAt: date(data.endsAt, 'end date'), registrationClosesAt: date(data.registrationClosesAt || data.startsAt, 'registration close'),
    capacity: integer(data.capacity, 'capacity', 1, 10000), ticketPriceJPY: integer(data.ticketPriceJPY || 0, 'ticket price', 0, 0),
    foodEnabled: data.foodEnabled === true, foodClosesAt: date(data.foodClosesAt || data.endsAt, 'food close'), allowGuestFood: data.allowGuestFood === true,
    status: ['draft', 'published', 'cancelled'].includes(data.status) ? data.status : 'draft', timezone: 'Asia/Tokyo', updatedAt: now()
  };
  if (event.endsAt.toMillis() <= event.startsAt.toMillis() || event.registrationClosesAt.toMillis() > event.endsAt.toMillis()) fail('invalid-argument', 'Invalid event date range.');
  await db.runTransaction(async tx => {
    const ref = db.doc(`events/${eventId}`); const old = await tx.get(ref);
    if ((old.data()?.registeredCount || 0) > event.capacity) fail('failed-precondition', 'Capacity cannot be lower than confirmed registrations.');
    tx.set(ref, { ...event, ...(old.exists ? {} : { createdAt: now(), registeredCount: 0, checkedInCount: 0 }) }, { merge: true });
    audit(tx, uid(req), 'event.save', eventId);
  });
  return { id: eventId };
});

export const registerForEvent = callable(async req => {
  const userId = uid(req); const eventId = id(req.data.eventId, 'event'); const requestId = id(req.data.requestId, 'request');
  await rateLimit(userId, 'register', 10);
  const registrationId = hash(`${eventId}:${userId}`); const ticketToken = token();
  return db.runTransaction(async tx => {
    const eventRef = db.doc(`events/${eventId}`); const ref = db.doc(`registrations/${registrationId}`);
    const [eventSnap, old, profile] = await Promise.all([tx.get(eventRef), tx.get(ref), tx.get(db.doc(`users/${userId}`))]);
    if (old.exists && (old.data()?.status !== 'cancelled' || old.data()?.requestId === requestId)) return { id: registrationId, ...old.data() };
    const event = eventSnap.data();
    if (!event || event.status !== 'published') fail('not-found', 'This event is not open.');
    if (event!.ticketPriceJPY !== 0) fail('failed-precondition', 'Paid admission is not configured.');
    if (event!.registrationClosesAt.toMillis() <= Date.now()) fail('failed-precondition', 'Registration is closed.');
    if ((event!.registeredCount || 0) >= event!.capacity) fail('resource-exhausted', 'This event is full.');
    if (profile.data()?.membershipStatus === 'suspended') fail('permission-denied', 'Your membership is suspended.');
    const registration = { uid: userId, eventId, eventTitle: event!.title, requestId, ticketToken, status: 'confirmed', checkedIn: false, createdAt: now(), priceJPY: 0 };
    tx.set(ref, registration); tx.update(eventRef, { registeredCount: FieldValue.increment(1) });
    audit(tx, userId, 'registration.create', registrationId);
    return { id: registrationId, ...registration, createdAt: null };
  });
});

export const cancelRegistration = callable(async req => {
  const userId = uid(req); const registrationId = id(req.data.registrationId); const admin = await isAdmin(req);
  return db.runTransaction(async tx => {
    const ref = db.doc(`registrations/${registrationId}`); const snap = await tx.get(ref); const registration = snap.data();
    if (!registration) fail('not-found', 'Registration not found.');
    if (registration!.uid !== userId && !admin) fail('permission-denied', 'This is not your registration.');
    if (registration!.status === 'cancelled') return { ok: true, alreadyCancelled: true };
    if (registration!.checkedIn) fail('failed-precondition', 'A checked-in ticket cannot be cancelled.');
    tx.update(ref, { status: 'cancelled', cancelledAt: now() });
    tx.update(db.doc(`events/${registration!.eventId}`), { registeredCount: FieldValue.increment(-1) });
    audit(tx, userId, 'registration.cancel', registrationId);
    return { ok: true };
  });
});

export const checkInRegistration = callable(async req => {
  uid(req);
  const registrationId = id(req.data.registrationId);
  const initial = (await db.doc(`registrations/${registrationId}`).get()).data();
  if (!initial) fail('not-found', 'Registration not found.');
  await authorize(req, ['event_manager', 'checkin_staff'], initial!.eventId);
  return db.runTransaction(async tx => {
    const ref = db.doc(`registrations/${registrationId}`); const snap = await tx.get(ref); const registration = snap.data();
    if (!registration || registration.status !== 'confirmed') fail('failed-precondition', 'Ticket is not confirmed.');
    const event = await tx.get(db.doc(`events/${registration!.eventId}`));
    if (event.data()?.status !== 'published') fail('failed-precondition', 'This event is not open for check-in.');
    verifyToken(req.data.token, registration!.ticketToken, req.data.manual);
    if (registration!.checkedIn) fail('already-exists', 'This ticket has already been checked in.');
    tx.update(ref, { checkedIn: true, checkedInAt: now(), checkedInBy: uid(req) });
    tx.update(db.doc(`events/${registration!.eventId}`), { checkedInCount: FieldValue.increment(1) });
    audit(tx, uid(req), 'registration.checkin', registrationId, { method: req.data.manual === true ? 'manual' : 'qr' });
    return { ok: true, registrationId };
  });
});

export const saveMenuItem = callable(async req => {
  const data = req.data; const eventId = id(data.eventId, 'event'); const vendorId = id(data.vendorId, 'vendor');
  await authorize(req, ['food_vendor_manager'], eventId, vendorId);
  const itemId = data.id ? id(data.id) : db.collection('menuItems').doc().id;
  const item: Data = {
    eventId, vendorId, name: str(data.name, 'item name', 160), nameBn: str(data.nameBn || '', 'Bangla name', 160, false),
    description: str(data.description || '', 'description', 2000, false), category: str(data.category || 'Food', 'category', 60),
    priceJPY: integer(data.priceJPY, 'price', 0, 100000), stock: integer(data.stock, 'stock', 0, 100000),
    perPersonLimit: integer(data.perPersonLimit || 10, 'per-person limit', 1, 100), active: data.active !== false,
    allergens: str(data.allergens || '', 'allergens', 500, false), ingredients: str(data.ingredients || '', 'ingredients', 1000, false),
    photoURL: str(data.photoURL || '', 'photo URL', 2000, false), pickupLocation: str(data.pickupLocation || 'Main food counter', 'pickup location', 200), updatedAt: now()
  };
  if (item.photoURL && !/^https:\/\//.test(item.photoURL)) fail('invalid-argument', 'Photo URL must be HTTPS.');
  await db.runTransaction(async tx => {
    const ref = db.doc(`menuItems/${itemId}`); const old = await tx.get(ref);
    if (old.exists && (old.data()?.eventId !== eventId || old.data()?.vendorId !== vendorId)) fail('failed-precondition', 'A menu item cannot move to another event or vendor.');
    if (old.exists && item.stock !== old.data()?.stock && data.expectedStock !== old.data()?.stock) fail('aborted', 'Inventory changed. Refresh the menu before adjusting stock.');
    tx.set(ref, item, { merge: true }); audit(tx, uid(req), 'menu.save', itemId, { stock: item.stock, priceJPY: item.priceJPY });
  });
  return { id: itemId };
});

export const placeFoodOrder = callable(async req => {
  const userId = uid(req); const eventId = id(req.data.eventId, 'event'); const requestId = id(req.data.requestId, 'request');
  if (!Array.isArray(req.data.items) || !req.data.items.length || req.data.items.length > 20) fail('invalid-argument', 'Choose between 1 and 20 menu items.');
  const items: { itemId: string; quantity: number }[] = req.data.items.map((item: Data) => {
    if (!item || typeof item !== 'object') return fail('invalid-argument', 'Invalid menu item.');
    return { itemId: id(item.itemId, 'menu item'), quantity: integer(item.quantity, 'quantity', 1, 20) };
  });
  if (new Set(items.map((i: Data) => i.itemId)).size !== items.length) fail('invalid-argument', 'Combine duplicate menu items before checkout.');
  await rateLimit(userId, 'food-order', 10);
  const orderId = hash(`${userId}:${requestId}`); const pickupToken = token();
  return db.runTransaction(async tx => {
    const ref = db.doc(`foodOrders/${orderId}`); const existing = await tx.get(ref);
    if (existing.exists) {
      if (existing.data()?.eventId !== eventId || existing.data()?.requestFingerprint !== hash(JSON.stringify(items))) fail('already-exists', 'This request ID was used for a different order.');
      return { id: orderId, ...existing.data() };
    }
    const [eventSnap, registration, profile, ...menuSnaps] = await Promise.all([
      tx.get(db.doc(`events/${eventId}`)), tx.get(db.doc(`registrations/${hash(`${eventId}:${userId}`)}`)), tx.get(db.doc(`users/${userId}`)),
      ...items.map((i: Data) => tx.get(db.doc(`menuItems/${i.itemId}`)))
    ]);
    const event = eventSnap.data();
    if (!event || event.status !== 'published' || !event.foodEnabled || event.foodClosesAt.toMillis() <= Date.now()) fail('failed-precondition', 'Food ordering is closed.');
    if (profile.data()?.membershipStatus === 'suspended') fail('permission-denied', 'Your membership is suspended.');
    if (!event!.allowGuestFood && registration.data()?.status !== 'confirmed') fail('failed-precondition', 'Register for this event before ordering food.');
    const menu = menuSnaps.map(s => s.data()!); const vendorId = menu[0]?.vendorId;
    let totalJPY = 0;
    const lines = items.map((item: Data, index: number) => {
      const product = menu[index];
      if (!product || product.eventId !== eventId || !product.active || product.vendorId !== vendorId) fail('failed-precondition', 'Items must be available at one counter for this event.');
      if (product.stock < item.quantity) fail('resource-exhausted', `${product.name} is sold out or has insufficient stock.`);
      if (item.quantity > product.perPersonLimit) fail('failed-precondition', `Quantity exceeds the limit for ${product.name}.`);
      totalJPY += product.priceJPY * item.quantity;
      return { itemId: item.itemId, quantity: item.quantity, name: product.name, unitPriceJPY: product.priceJPY, lineTotalJPY: product.priceJPY * item.quantity };
    });
    const usageRefs = items.map((i: Data) => db.doc(`foodUsage/${hash(`${userId}:${eventId}:${i.itemId}`)}`));
    const usageSnaps = await Promise.all(usageRefs.map(r => tx.get(r)));
    items.forEach((item: Data, index: number) => {
      if ((usageSnaps[index].data()?.quantity || 0) + item.quantity > menu[index].perPersonLimit) fail('failed-precondition', `Your event limit for ${menu[index].name} has been reached.`);
    });
    const expiresAt = Timestamp.fromMillis(Math.min(Date.now() + 30 * 60000, event!.foodClosesAt.toMillis()));
    const order = { uid: userId, eventId, vendorId, eventTitle: event!.title, items: lines, requestId, requestFingerprint: hash(JSON.stringify(items)), totalJPY, currency: 'JPY', paymentMethod: 'cash', paymentStatus: totalJPY === 0 ? 'complimentary' : 'unpaid', status: 'confirmed', pickupToken, pickupLocation: menu[0].pickupLocation, stockReserved: true, expiresAt, createdAt: now() };
    tx.create(ref, order);
    items.forEach((item: Data, index: number) => {
      tx.update(db.doc(`menuItems/${item.itemId}`), { stock: FieldValue.increment(-item.quantity) });
      tx.set(usageRefs[index], { quantity: (usageSnaps[index].data()?.quantity || 0) + item.quantity, updatedAt: now() });
    });
    audit(tx, userId, 'food.create', orderId, { totalJPY });
    return { id: orderId, ...order, createdAt: null };
  });
});

async function cancelOrder(orderId: string, actor: string, admin: boolean, expiredOnly = false): Promise<Data> {
  return db.runTransaction(async tx => {
    const ref = db.doc(`foodOrders/${orderId}`); const snap = await tx.get(ref); const order = snap.data();
    if (!order) fail('not-found', 'Food order not found.');
    if (!admin && order!.uid !== actor) fail('permission-denied', 'This is not your order.');
    if (order!.status === 'cancelled') return { ok: true, alreadyCancelled: true };
    if (order!.status !== 'confirmed' || !['unpaid', 'complimentary'].includes(order!.paymentStatus)) fail('failed-precondition', 'This order can no longer be cancelled automatically. Contact the counter.');
    if (expiredOnly && (order!.paymentStatus !== 'unpaid' || order!.expiresAt.toMillis() > Date.now())) return { ok: false };
    tx.update(ref, { status: 'cancelled', stockReserved: false, cancelledAt: now(), cancelReason: expiredOnly ? 'reservation_expired' : 'requested' });
    if (order!.stockReserved) for (const item of order!.items) {
      tx.update(db.doc(`menuItems/${item.itemId}`), { stock: FieldValue.increment(item.quantity) });
      tx.update(db.doc(`foodUsage/${hash(`${order!.uid}:${order!.eventId}:${item.itemId}`)}`), { quantity: FieldValue.increment(-item.quantity), updatedAt: now() });
    }
    audit(tx, actor, 'food.cancel', orderId, { reason: expiredOnly ? 'reservation_expired' : 'requested' });
    return { ok: true };
  });
}
export const cancelFoodOrder = callable(async req => cancelOrder(id(req.data.orderId), uid(req), await isAdmin(req)));

export const advanceFoodOrder = callable(async req => {
  uid(req);
  const orderId = id(req.data.orderId); const action = str(req.data.action, 'action', 30);
  const permissions: Record<string, string[]> = { confirmPayment: ['food_vendor_manager', 'pickup_staff'], prepare: ['food_vendor_manager', 'kitchen_staff'], ready: ['food_vendor_manager', 'kitchen_staff'], pickup: ['food_vendor_manager', 'pickup_staff'] };
  if (!permissions[action]) fail('invalid-argument', 'Invalid order action.');
  const initial = (await db.doc(`foodOrders/${orderId}`).get()).data();
  if (!initial) fail('not-found', 'Food order not found.');
  await authorize(req, permissions[action], initial!.eventId, initial!.vendorId);
  return db.runTransaction(async tx => {
    const ref = db.doc(`foodOrders/${orderId}`); const snap = await tx.get(ref); const order = snap.data();
    if (!order || ['cancelled', 'collected'].includes(order.status)) fail('failed-precondition', 'This order is already closed.');
    if (order!.status === 'confirmed' && order!.paymentStatus === 'unpaid' && order!.expiresAt.toMillis() <= Date.now()) fail('failed-precondition', 'The reservation has expired. Please place a new order.');
    if (action === 'confirmPayment') {
      if (order!.paymentStatus !== 'unpaid') return { ok: true, alreadyPaid: true };
      if (req.data.amountJPY !== order!.totalJPY) fail('invalid-argument', 'Cash amount must equal the server-calculated total.');
      tx.update(ref, { paymentStatus: 'paid', paidAt: now(), paidBy: uid(req) });
      tx.create(db.doc(`paymentTransactions/cash_${orderId}`), { orderId, uid: order!.uid, eventId: order!.eventId, vendorId: order!.vendorId, method: 'cash', amountJPY: order!.totalJPY, operator: uid(req), createdAt: now() });
    } else {
      const expected = ({ prepare: 'confirmed', ready: 'preparing', pickup: 'ready' } as Record<string, string>)[action];
      const next = ({ prepare: 'preparing', ready: 'ready', pickup: 'collected' } as Record<string, string>)[action];
      if (order!.status !== expected) fail('failed-precondition', `Order must be ${expected} before this action.`);
      if (action === 'pickup') {
        if (!['paid', 'complimentary'].includes(order!.paymentStatus)) fail('failed-precondition', 'Collect the cash payment before pickup.');
        verifyToken(req.data.token, order!.pickupToken, req.data.manual);
        tx.create(db.doc(`foodPickupRedemptions/${orderId}`), { orderId, eventId: order!.eventId, vendorId: order!.vendorId, operator: uid(req), collectedAt: now() });
      }
      tx.update(ref, { status: next, [`${next}At`]: now(), updatedBy: uid(req) });
    }
    audit(tx, uid(req), `food.${action}`, orderId, { amountJPY: action === 'confirmPayment' ? order!.totalJPY : null, method: action === 'pickup' ? (req.data.manual === true ? 'manual' : 'qr') : null });
    return { ok: true };
  });
});

export const expireFoodReservations = onSchedule({ schedule: 'every 5 minutes', region: 'asia-northeast1', maxInstances: 1 }, async () => {
  const snapshots = await db.collection('foodOrders').where('status', '==', 'confirmed').where('paymentStatus', '==', 'unpaid').where('expiresAt', '<=', Timestamp.now()).limit(200).get();
  for (const order of snapshots.docs) {
    try { await cancelOrder(order.id, 'system:expiry', true, true); }
    catch (error) { if (!(error instanceof HttpsError && error.code === 'failed-precondition')) throw error; }
  }
});

export const saveContent = callable(async req => {
  await authorize(req, ['content_editor']);
  const collection = str(req.data.collection, 'collection');
  if (!['websiteContent', 'albums', 'photos', 'newsPosts', 'committeeTerms', 'partnerOrganizations', 'volunteerOpportunities', 'vendors'].includes(collection)) fail('invalid-argument', 'Unsupported content collection.');
  if (collection === 'vendors' && !(await isAdmin(req))) fail('permission-denied', 'Only an administrator can create food counters.');
  const contentId = id(req.data.id); const input = req.data.data;
  if (!input || typeof input !== 'object' || Array.isArray(input) || JSON.stringify(input).length > 30000) fail('invalid-argument', 'Invalid content.');
  const content: Data = {};
  for (const field of ['title', 'titleBn', 'name', 'body', 'bodyBn', 'description', 'photoURL', 'alt', 'credit', 'role', 'term', 'eventId', 'vendorId', 'albumId', 'url', 'category']) {
    if (input[field] !== undefined) content[field] = str(input[field], field, field.startsWith('body') ? 15000 : 2000, false);
  }
  for (const field of ['url', 'photoURL']) if (content[field] && !/^https:\/\//.test(content[field])) fail('invalid-argument', `${field} must be HTTPS.`);
  content.status = input.status === 'published' ? 'published' : 'draft';
  content.updatedAt = now();
  await db.runTransaction(async tx => { tx.set(db.doc(`${collection}/${contentId}`), content, { merge: true }); audit(tx, uid(req), 'content.save', `${collection}/${contentId}`); });
  return { id: contentId };
});

export const assignStaff = callable(async req => {
  uid(req);
  if (!(await currentAccess(req)).roles.includes('super_admin')) fail('permission-denied', 'Only a super administrator can assign roles.');
  const target = id(req.data.uid);
  if (!Array.isArray(req.data.roles) || req.data.roles.some((r: unknown) => !ROLES.includes(String(r)))) fail('invalid-argument', 'Invalid roles.');
  if (req.data.roles.includes('super_admin')) fail('failed-precondition', 'Super administrator promotion must use the owner CLI.');
  const cleanIds = (list: unknown, name: string) => {
    if (!Array.isArray(list) || list.length > 100) return fail('invalid-argument', `Invalid ${name}.`);
    return [...new Set(list.map(v => id(v, name)))];
  };
  const eventIds = cleanIds(req.data.eventIds || [], 'event assignments'); const vendorIds = cleanIds(req.data.vendorIds || [], 'vendor assignments');
  // Remove claims first: an interrupted scope update never expands prior privileges.
  const user = await getAuth().getUser(target);
  await getAuth().setCustomUserClaims(target, { ...user.customClaims, roles: ['member'] });
  await db.doc(`staffAssignments/${target}`).set({ eventIds, vendorIds, roles: req.data.roles, updatedAt: now(), updatedBy: uid(req) });
  await getAuth().setCustomUserClaims(target, { ...user.customClaims, roles: req.data.roles });
  await db.collection('auditLogs').add({ actor: uid(req), action: 'staff.assign', target, roles: req.data.roles, at: now() });
  return { ok: true, refreshRequired: true };
});
