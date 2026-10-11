/**
 * TIU BSS interactive demo data. This is a local browser prototype, not an
 * authorization, payment, or multi-user inventory service. Production needs
 * authenticated server transactions and verified payment callbacks.
 */
const STORAGE_KEY = 'tiu-bss-demo-v1';
const EDITABLE_COLLECTIONS = new Set(['events', 'menu', 'vendors', 'members', 'gallery', 'news', 'volunteers', 'messages', 'committee', 'partners']);
const EXPORTABLE_COLLECTIONS = new Set([...EDITABLE_COLLECTIONS, 'tickets', 'orders', 'audits']);
const subscribers = new Set();
const clone = value => JSON.parse(JSON.stringify(value));
const now = () => new Date().toISOString();
const fail = message => { throw new Error(message); };
const textValue = value => String(value ?? '').trim();
const integer = (value, label, minimum = 0) => {
  if (value === '' || value === null || value === undefined || typeof value === 'boolean') fail(`${label} must be a whole number.`);
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum) fail(`${label} must be a whole number of at least ${minimum}.`);
  return result;
};

export function uid(prefix = 'item') {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
  return `${prefix}-${random}`;
}

function seed() {
  const timestamp = '2026-10-01T09:00:00.000Z';
  return {
    events: [
      {id: 'e1', slug: 'pohela-boishakh', title: 'Pohela Boishakh', titleBn: 'শুভ নববর্ষ', category: 'Culture', date: '2027-04-14', time: '16:00', location: 'Tokyo Campus', description: 'A new year. A familiar feeling. Come together for Bengali music, traditional food, colourful art, and the joy of belonging. This is a sample event for exploring the website.', capacity: 160, price: 0, status: 'published', image: 'assets/event-boishakh.svg', foodEnabled: true, pickup: ['16:00–16:30', '16:30–17:00', '17:00–17:30'], isDemo: true},
      {id: 'e2', slug: 'an-evening-of-adda', title: 'An evening of adda', titleBn: 'আড্ডার আসর', category: 'Community', date: '2026-11-14', time: '18:00', location: 'Tokyo Campus', description: 'Find a seat, share a story, and meet your people. A relaxed gathering for students, alumni, and friends, with familiar flavours and new connections. Sample event.', capacity: 60, price: 0, status: 'published', image: 'assets/event-adda.svg', foodEnabled: true, pickup: ['18:00–18:30', '18:30–19:00'], isDemo: true},
      {id: 'e3', slug: 'find-your-next-chapter', title: 'Find your next chapter', titleBn: 'আগামীর পথচলা', category: 'Career', date: '2026-12-05', time: '15:00', location: 'Tokyo Campus', description: 'A space to explore careers, exchange practical advice, and connect with alumni. Bring your questions and leave with a little more direction. Sample event.', capacity: 80, price: 0, status: 'published', image: 'assets/event-career.svg', foodEnabled: false, pickup: [], isDemo: true}
    ],
    vendors: [
      {id: 'v1', eventId: 'e1', name: 'Community kitchen · demo', location: 'Food corner', isDemo: true},
      {id: 'v2', eventId: 'e2', name: 'Adda kitchen · demo', location: 'Community table', isDemo: true}
    ],
    menu: [
      {id: 'f1', eventId: 'e1', name: 'Chicken biryani', nameBn: 'চিকেন বিরিয়ানি', category: 'Meals', price: 850, stock: 48, description: 'Fragrant rice, tender chicken, and the taste of home. Sample menu item.', allergens: ['Milk'], vegetarian: false, image: 'assets/food-biryani.svg', vendorId: 'v1', isDemo: true},
      {id: 'f2', eventId: 'e1', name: 'Fuchka', nameBn: 'ফুচকা', category: 'Snacks', price: 450, stock: 38, description: 'Crisp shells with a tangy, spiced filling. Sample menu item.', allergens: ['Wheat'], vegetarian: true, image: 'assets/food-fuchka.svg', vendorId: 'v1', isDemo: true},
      {id: 'f3', eventId: 'e1', name: 'Mango lassi', nameBn: 'আমের লাচ্ছি', category: 'Drinks', price: 350, stock: 45, description: 'A cool mango and yogurt drink. Sample menu item.', allergens: ['Milk'], vegetarian: true, image: 'assets/food-lassi.svg', vendorId: 'v1', isDemo: true},
      {id: 'f4', eventId: 'e1', name: 'Mishti', nameBn: 'মিষ্টি', category: 'Desserts', price: 300, stock: 30, description: 'A little sweetness to finish your celebration. Sample menu item.', allergens: ['Milk'], vegetarian: true, image: 'assets/food-mishti.svg', vendorId: 'v1', isDemo: true},
      {id: 'f5', eventId: 'e2', name: 'Fuchka', nameBn: 'ফুচকা', category: 'Snacks', price: 450, stock: 35, description: 'A favourite companion for an evening of stories. Sample menu item.', allergens: ['Wheat'], vegetarian: true, image: 'assets/food-fuchka.svg', vendorId: 'v2', isDemo: true},
      {id: 'f6', eventId: 'e2', name: 'Mango lassi', nameBn: 'আমের লাচ্ছি', category: 'Drinks', price: 350, stock: 30, description: 'Creamy mango refreshment. Sample menu item.', allergens: ['Milk'], vegetarian: true, image: 'assets/food-lassi.svg', vendorId: 'v2', isDemo: true}
    ],
    members: [
      {id: 'm1', name: 'Demo Student', nameBn: 'শিক্ষার্থী', type: 'student', university: 'Tokyo International University', major: 'Digital Business & Innovation', graduation: '2027', employer: '', jobTitle: '', city: 'Tokyo', bio: 'Sample profile — interested in design, community events, and meeting fellow students.', skills: ['Design', 'Community', 'Bangla'], directoryVisible: true, mentor: false, avatar: '', status: 'approved', isDemo: true},
      {id: 'm2', name: 'Demo Alum', nameBn: 'প্রাক্তন শিক্ষার্থী', type: 'alumni', university: 'Tokyo International University', major: 'Business Economics', graduation: '2024', employer: 'Sample company', jobTitle: 'Marketing specialist', city: 'Tokyo', bio: 'Sample alumni profile — showing how graduates can share their career journey and offer guidance.', skills: ['Marketing', 'Career advice', 'Japanese'], directoryVisible: true, mentor: true, avatar: '', status: 'approved', isDemo: true},
      {id: 'm3', name: 'Demo Community Member', nameBn: 'কমিউনিটি সদস্য', type: 'community', university: '', major: '', graduation: '', employer: 'Sample organisation', jobTitle: 'Community volunteer', city: 'Saitama', bio: 'Sample community profile — a place for friends of the society to connect and contribute.', skills: ['Volunteering', 'Photography', 'Events'], directoryVisible: true, mentor: false, avatar: '', status: 'approved', isDemo: true},
      {id: 'm4', name: 'Demo Mentor', nameBn: 'মেন্টর', type: 'alumni', university: 'Tokyo International University', major: 'International Relations', graduation: '2023', employer: 'Sample company', jobTitle: 'Project coordinator', city: 'Yokohama', bio: 'Sample mentor profile — exploring ways to support the next generation of students.', skills: ['Project management', 'Interviews', 'Networking'], directoryVisible: true, mentor: true, avatar: '', status: 'approved', isDemo: true}
    ],
    profile: null,
    tickets: [
      {id: 't-demo-1', qrToken: 'TIUBSS-DEMO-TICKET-001', eventId: 'e1', userId: 'm1', name: 'Demo Student', status: 'confirmed', checkedInAt: null, createdAt: timestamp, isDemo: true},
      {id: 't-demo-2', qrToken: 'TIUBSS-DEMO-TICKET-002', eventId: 'e1', userId: 'm2', name: 'Demo Alum', status: 'checked_in', checkedInAt: timestamp, createdAt: timestamp, isDemo: true},
      {id: 't-demo-3', qrToken: 'TIUBSS-DEMO-TICKET-003', eventId: 'e2', userId: 'm3', name: 'Demo Community Member', status: 'confirmed', checkedInAt: null, createdAt: timestamp, isDemo: true}
    ],
    orders: [
      {id: 'o-demo-1', qrToken: 'TIUBSS-DEMO-ORDER-001', eventId: 'e1', userId: 'm1', items: [{menuId: 'f1', name: 'Chicken biryani', qty: 2, price: 850}], total: 1700, status: 'ready', paymentStatus: 'paid', pickup: '16:00–16:30', createdAt: timestamp, isDemo: true},
      {id: 'o-demo-2', qrToken: 'TIUBSS-DEMO-ORDER-002', eventId: 'e1', userId: 'm2', items: [{menuId: 'f2', name: 'Fuchka', qty: 2, price: 450}], total: 900, status: 'confirmed', paymentStatus: 'due', pickup: '16:30–17:00', createdAt: timestamp, isDemo: true}
    ],
    gallery: [
      {id: 'g1', title: 'Colour, culture & connection', category: 'Art & Culture', image: 'assets/reference-peacocks.webp', caption: 'Artwork supplied as a visual reference for this website.', isDemo: true},
      {id: 'g2', title: 'Rooted in tradition', category: 'Art & Culture', image: 'assets/reference-flowers.webp', caption: 'Artwork supplied as a visual reference for this website.', isDemo: true},
      {id: 'g3', title: 'A new year together', category: 'Celebrations', image: 'assets/event-boishakh.svg', caption: 'Sample illustration for the Pohela Boishakh event.', isDemo: true}
    ],
    news: [
      {id: 'n1', title: 'A little closer to home', category: 'Community', date: '2026-10-01', excerpt: 'Discover a place to connect, celebrate, and grow together.', body: 'Welcome to our interactive community website preview. Explore sample events, build your profile, and discover how this space can bring students, alumni, and friends together.', status: 'published', image: 'assets/reference-flowers.webp', isDemo: true},
      {id: 'n2', title: 'Your next chapter starts with a conversation', category: 'Alumni', date: '2026-10-03', excerpt: 'Explore the sample alumni directory and mentor profiles.', body: 'Our alumni directory is designed to help community members share their journeys and support one another. All currently displayed profiles are samples.', status: 'published', image: 'assets/event-career.svg', isDemo: true}
    ],
    volunteers: [],
    messages: [],
    committee: [],
    partners: [],
    audits: [{id: 'a-demo-1', action: 'demo_initialized', collection: 'settings', recordId: 'demo', actorId: 'demo', createdAt: timestamp, isDemo: true}],
    settings: {title: 'TIU Bangladesh Students’ Society', announcement: 'A little piece of Bangladesh. A community in Japan.', isDemo: true}
  };
}

function readStored() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (parsed.committee === undefined) parsed.committee = [];
      if (parsed.partners === undefined) parsed.partners = [];
    }
    const lists = [...EXPORTABLE_COLLECTIONS];
    if (!parsed || !lists.every(key => Array.isArray(parsed[key])) || !parsed.settings || typeof parsed.settings !== 'object') return null;
    return parsed;
  } catch { return null; }
}

let state = readStored() || seed();

function emit() {
  for (const listener of subscribers) {
    try { listener(clone(state)); } catch { /* One view must not block other views. */ }
  }
}

function persist(next) {
  // Only commit after storage succeeds; storage-less runtimes can use memory.
  try {
    const storage = globalThis.localStorage;
    if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    fail('Browser storage is full or unavailable. Remove some uploaded images or export/reset the demo before trying again.');
  }
  state = next;
  emit();
}

function mutate(action, collection, recordId, change) {
  const next = clone(readStored() || state);
  const result = change(next);
  next.audits.unshift({id: uid('audit'), action, collection, recordId: recordId || result?.id || '', actorId: next.profile?.id || 'demo-admin', createdAt: now(), isDemo: true});
  persist(next);
  return result === undefined ? undefined : clone(result);
}

export function getState() { return clone(state); }

export function subscribe(listener) {
  if (typeof listener !== 'function') fail('A subscriber must be a function.');
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

globalThis.addEventListener?.('storage', event => {
  if (event.key === STORAGE_KEY || event.key === null) {
    state = readStored() || seed();
    emit();
  }
});

function getEvent(next, id) {
  const event = next.events.find(row => row.id === id);
  if (!event) fail('This event could not be found.');
  return event;
}

function requireProfile(next) {
  if (!next.profile || !textValue(next.profile.name)) fail('Create your demo profile first.');
  return next.profile;
}

function approvedEvent(next, id) {
  const event = getEvent(next, id);
  if (event.status !== 'published') fail('This event is not open for bookings.');
  return event;
}

function validHttpsUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password; } catch { return false; }
}
function validCmsImage(value) {
  const source = textValue(value);
  if (!source) return true;
  if (/^assets\/[A-Za-z0-9_./-]+$/.test(source) && !source.split('/').includes('..')) return true;
  const data = source.match(/^data:image\/(?:png|jpeg|webp|gif|avif);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (data) return Math.floor(data[1].length * 3 / 4) - (data[1].match(/=*$/)?.[0].length || 0) <= 2 * 1024 * 1024;
  return validHttpsUrl(source);
}

function validateRecord(collection, record, next) {
  if (collection === 'committee') {
    record.name = textValue(record.name);
    record.role = textValue(record.role);
    record.term = textValue(record.term);
    record.bio = textValue(record.bio);
    record.photo = textValue(record.photo);
    record.memberId = textValue(record.memberId);
    if (!record.name || !record.role) fail('Add a committee member name and role.');
    if (record.memberId && !next.members.some(member => member.id === record.memberId)) fail('Choose an existing community member or leave the profile link empty.');
    if (!validCmsImage(record.photo)) fail('Use an HTTPS or bundled photo, or a raster data image no larger than 2 MB.');
  }
  if (collection === 'partners') {
    record.name = textValue(record.name);
    record.description = textValue(record.description);
    record.website = textValue(record.website);
    record.logo = textValue(record.logo);
    if (!record.name) fail('Add a partner name.');
    if (!validHttpsUrl(record.website)) fail('Add a valid partner website beginning with https:// without embedded credentials.');
    if (!validCmsImage(record.logo)) fail('Use an HTTPS or bundled logo, or a raster data image no larger than 2 MB.');
  }
  if (collection === 'events') {
    record.title = textValue(record.title);
    if (!record.title) fail('Add an event title.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date || '') || Number.isNaN(Date.parse(`${record.date}T00:00:00Z`)) || new Date(`${record.date}T00:00:00Z`).toISOString().slice(0, 10) !== record.date) fail('Choose a valid event date.');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(record.time || '')) fail('Choose a valid event time.');
    record.capacity = integer(record.capacity, 'Capacity', 1);
    record.price = integer(record.price ?? 0, 'Ticket price');
    if (!['draft', 'published', 'cancelled', 'archived'].includes(record.status)) fail('Choose a valid event status.');
    const booked = next.tickets.filter(ticket => ticket.eventId === record.id && ticket.status !== 'cancelled').length;
    if (record.capacity < booked) fail(`Capacity cannot be below ${booked} existing registrations.`);
    record.pickup = Array.isArray(record.pickup) ? record.pickup.map(textValue).filter(Boolean) : textValue(record.pickup).split(',').map(textValue).filter(Boolean);
    record.foodEnabled = Boolean(record.foodEnabled);
    record.slug = textValue(record.slug) || record.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || record.id;
    if (next.events.some(event => event.id !== record.id && event.slug === record.slug)) fail('This event URL is already in use.');
  }
  if (collection === 'menu') {
    getEvent(next, record.eventId);
    record.name = textValue(record.name);
    if (!record.name) fail('Add a food item name.');
    record.price = integer(record.price, 'Food price');
    record.stock = integer(record.stock, 'Available stock');
    record.vegetarian = Boolean(record.vegetarian);
    record.allergens = Array.isArray(record.allergens) ? record.allergens.map(textValue).filter(Boolean) : textValue(record.allergens).split(',').map(textValue).filter(Boolean);
    if (record.vendorId && !next.vendors.some(vendor => vendor.id === record.vendorId && vendor.eventId === record.eventId)) fail('Choose a vendor belonging to this event.');
    const previous = next.menu.find(item => item.id === record.id);
    if (previous && previous.eventId !== record.eventId && next.orders.some(order => !['cancelled', 'collected'].includes(order.status) && order.items.some(item => item.menuId === record.id))) fail('An item with open orders cannot move to another event.');
  }
  if (collection === 'vendors') {
    getEvent(next, record.eventId);
    if (!textValue(record.name)) fail('Add a vendor name.');
  }
  if (collection === 'members') {
    record.name = textValue(record.name);
    if (!record.name) fail('Add your name.');
    record.type = textValue(record.type) || 'student';
    if (!['student', 'alumni', 'community'].includes(record.type)) fail('Choose student, alumni, or community.');
    record.skills = Array.isArray(record.skills) ? record.skills.map(textValue).filter(Boolean) : textValue(record.skills).split(',').map(textValue).filter(Boolean);
    record.directoryVisible = Boolean(record.directoryVisible);
    record.mentor = Boolean(record.mentor);
    record.status ||= 'approved';
  }
  if (['gallery', 'news'].includes(collection) && !textValue(record.title)) fail('Add a title.');
  if (collection === 'gallery' && !textValue(record.image)) fail('Add an image.');
  if (collection === 'messages' && !textValue(record.message || record.body)) fail('Write a message.');
  if (collection === 'volunteers' && !textValue(record.name)) fail('Add a volunteer name.');
  return record;
}

export function saveRecord(collection, record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) fail('A record is required.');
  if (collection === 'settings') {
    return mutate('settings_updated', 'settings', 'settings', next => {
      next.settings = {...next.settings, ...clone(record), isDemo: true};
      return next.settings;
    });
  }
  if (!EDITABLE_COLLECTIONS.has(collection)) fail('Use the dedicated booking actions for this collection.');
  const id = textValue(record.id) || uid(collection.slice(0, 3));
  return mutate('record_saved', collection, id, next => {
    const index = next[collection].findIndex(row => row.id === id);
    const previous = index >= 0 ? next[collection][index] : {};
    const saved = validateRecord(collection, {...previous, ...clone(record), id, isDemo: true}, next);
    if (index >= 0) next[collection][index] = saved;
    else next[collection].unshift(saved);
    if (collection === 'members' && id === 'me') next.profile = saved;
    return saved;
  });
}

export function removeRecord(collection, id) {
  if (!EDITABLE_COLLECTIONS.has(collection)) fail('This collection cannot be deleted directly.');
  return mutate('record_removed', collection, id, next => {
    const index = next[collection].findIndex(row => row.id === id);
    if (index === -1) fail('This record could not be found.');
    if (collection === 'events') {
      if (next.tickets.some(ticket => ticket.eventId === id) || next.orders.some(order => order.eventId === id)) fail('This event has bookings. Archive it to keep its records.');
      next.menu = next.menu.filter(item => item.eventId !== id);
      next.vendors = next.vendors.filter(vendor => vendor.eventId !== id);
    }
    if (collection === 'menu' && next.orders.some(order => !['cancelled', 'collected'].includes(order.status) && order.items.some(item => item.menuId === id))) fail('This item has open orders. Keep it available until those orders are resolved.');
    if (collection === 'vendors' && next.menu.some(item => item.vendorId === id)) fail('Reassign this vendor’s menu items before deleting it.');
    if (collection === 'members' && id === 'me') next.profile = null;
    return next[collection].splice(index, 1)[0];
  });
}

export function saveProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) fail('Your profile details are required.');
  return mutate('profile_saved', 'members', 'me', next => {
    const defaults = {id: 'me', name: '', nameBn: '', type: 'student', university: '', major: '', graduation: '', employer: '', jobTitle: '', city: 'Tokyo', bio: '', skills: [], directoryVisible: false, mentor: false, avatar: '', status: 'pending', isDemo: true};
    const saved = validateRecord('members', {...defaults, ...next.profile, ...clone(profile), id: 'me', isDemo: true}, next);
    next.profile = saved;
    const index = next.members.findIndex(member => member.id === 'me');
    if (index >= 0) next.members[index] = saved;
    else next.members.unshift(saved);
    return saved;
  });
}

export function registerEvent(eventId) {
  return mutate('event_registered', 'tickets', '', next => {
    const profile = requireProfile(next);
    const event = approvedEvent(next, eventId);
    if (Number(event.price) !== 0) fail('Only free event registration is available in this demo.');
    if (next.tickets.some(ticket => ticket.eventId === eventId && ticket.userId === profile.id && ticket.status !== 'cancelled')) fail('You already have a ticket for this event.');
    if (next.tickets.filter(ticket => ticket.eventId === eventId && ticket.status !== 'cancelled').length >= event.capacity) fail('This event is full.');
    const ticket = {id: uid('ticket'), qrToken: uid('TIUBSS-TICKET'), eventId, userId: profile.id, name: profile.name, status: 'confirmed', checkedInAt: null, createdAt: now(), isDemo: true};
    next.tickets.unshift(ticket);
    return ticket;
  });
}

export function checkInTicket(tokenOrId) {
  return mutate('ticket_checked_in', 'tickets', tokenOrId, next => {
    const input = textValue(tokenOrId);
    const ticket = next.tickets.find(row => row.id === input || row.qrToken === input);
    if (!ticket) fail('Ticket not found. Check the code and try again.');
    if (ticket.status === 'checked_in' || ticket.checkedInAt) fail('This ticket has already been checked in.');
    if (ticket.status !== 'confirmed') fail('This ticket is not valid for check-in.');
    if (getEvent(next, ticket.eventId).status === 'cancelled') fail('This event has been cancelled.');
    ticket.status = 'checked_in';
    ticket.checkedInAt = now();
    return ticket;
  });
}

export function cancelTicket(id) {
  return mutate('ticket_cancelled', 'tickets', id, next => {
    const ticket = next.tickets.find(row => row.id === id);
    if (!ticket) fail('Ticket not found.');
    if (ticket.status === 'cancelled') fail('This ticket is already cancelled.');
    if (ticket.status !== 'confirmed') fail('A checked-in ticket cannot be cancelled.');
    ticket.status = 'cancelled';
    ticket.cancelledAt = now();
    return ticket;
  });
}

export function placeOrder(eventId, items, pickup) {
  return mutate('order_placed', 'orders', '', next => {
    const profile = requireProfile(next);
    const event = approvedEvent(next, eventId);
    if (!event.foodEnabled) fail('Food ordering is not available for this event.');
    if (!Array.isArray(items) || !items.length) fail('Add at least one food item.');
    const chosenPickup = textValue(pickup);
    if (!chosenPickup) fail('Choose a pickup time.');
    if (Array.isArray(event.pickup) && event.pickup.length && !event.pickup.includes(chosenPickup)) fail('Choose one of this event’s pickup times.');
    const quantities = new Map();
    for (const line of items) {
      if (!line || typeof line !== 'object') fail('One of the order items is invalid.');
      const menuId = textValue(line.menuId || line.id);
      if (!menuId) fail('Choose a valid food item.');
      const qty = integer(line.qty, 'Quantity', 1);
      const combined = (quantities.get(menuId) || 0) + qty;
      if (!Number.isSafeInteger(combined)) fail('Quantity is too large.');
      quantities.set(menuId, combined);
    }
    const orderItems = [...quantities].map(([menuId, qty]) => {
      const menuItem = next.menu.find(row => row.id === menuId && row.eventId === eventId);
      if (!menuItem) fail('A selected food item is not available at this event.');
      if (qty > menuItem.stock) fail(`Only ${menuItem.stock} ${menuItem.name} remaining.`);
      return {menuId, name: menuItem.name, qty, price: menuItem.price};
    });
    const total = orderItems.reduce((sum, item) => sum + item.price * item.qty, 0);
    if (!Number.isSafeInteger(total) || total < 0) fail('The order total is invalid.');
    for (const item of orderItems) next.menu.find(row => row.id === item.menuId).stock -= item.qty;
    const order = {id: uid('order'), qrToken: uid('TIUBSS-ORDER'), eventId, userId: profile.id, items: orderItems, total, status: 'confirmed', paymentStatus: 'due', pickup: chosenPickup, createdAt: now(), isDemo: true};
    next.orders.unshift(order);
    return order;
  });
}

export function advanceOrder(id, action) {
  return mutate(`order_${action}`, 'orders', id, next => {
    const order = next.orders.find(row => row.id === id || row.qrToken === id);
    if (!order) fail('Order not found.');
    if (order.status === 'cancelled') fail('This order has been cancelled.');
    if (order.status === 'collected') fail('This order has already been collected.');
    if (action === 'confirmPayment') {
      if (order.paymentStatus === 'paid') fail('Payment has already been confirmed.');
      order.paymentStatus = 'paid';
      order.paidAt = now();
    } else if (action === 'prepare') {
      if (order.status !== 'confirmed') fail('Only confirmed orders can move to preparation.');
      order.status = 'preparing';
    } else if (action === 'ready') {
      if (order.status !== 'preparing') fail('Start preparing this order before marking it ready.');
      order.status = 'ready';
    } else if (action === 'pickup') {
      if (order.paymentStatus !== 'paid') fail('Confirm payment before handing over this order.');
      if (order.status !== 'ready') fail('This order must be ready before collection.');
      order.status = 'collected';
      order.collectedAt = now();
    } else fail('Choose a valid order action.');
    order.updatedAt = now();
    return order;
  });
}

export function cancelOrder(id) {
  return mutate('order_cancelled', 'orders', id, next => {
    const order = next.orders.find(row => row.id === id);
    if (!order) fail('Order not found.');
    if (order.status === 'cancelled') fail('This order is already cancelled.');
    if (order.status !== 'confirmed' || order.paymentStatus !== 'due') fail('Only unpaid orders that have not entered preparation can be cancelled.');
    for (const line of order.items) {
      const item = next.menu.find(row => row.id === line.menuId);
      if (!item) fail('A menu item is missing. Restore it before cancelling this order.');
      item.stock += line.qty;
    }
    order.status = 'cancelled';
    order.cancelledAt = now();
    return order;
  });
}

export function resetDemo() {
  state = seed();
  persist(state);
  return getState();
}

export function exportCSV(collection) {
  if (!EXPORTABLE_COLLECTIONS.has(collection)) fail('This collection cannot be exported.');
  const rows = state[collection];
  if (!rows.length) return '';
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const cell = value => {
    let content = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    // A leading apostrophe prevents spreadsheet formula execution on import.
    if (/^[\s]*[=+\-@]/.test(content) || /^[\t\r\n]/.test(content)) content = `'${content}`;
    return `"${content.replaceAll('"', '""')}"`;
  };
  return [columns.map(cell).join(','), ...rows.map(row => columns.map(column => cell(row[column])).join(','))].join('\r\n');
}
