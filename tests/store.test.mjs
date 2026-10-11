import test, {beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key)
};
const source = await readFile(new URL('../dist/js/store.js', import.meta.url), 'utf8');
const store = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const setupProfile = () => store.saveProfile({name: 'Test member', type: 'student'});
const stock = id => store.getState().menu.find(item => item.id === id).stock;
const order = (items = [{menuId: 'f1', qty: 1}]) => store.placeOrder('e1', items, '16:00–16:30');

beforeEach(() => store.resetDemo());

test('registration requires a profile, deduplicates, enforces capacity, and releases a cancelled place', () => {
  assert.throws(() => store.registerEvent('e1'), /profile first/);
  setupProfile();
  const occupied = store.getState().tickets.filter(ticket => ticket.eventId === 'e1' && ticket.status !== 'cancelled').length;
  store.saveRecord('events', {id: 'e1', capacity: occupied});
  assert.throws(() => store.registerEvent('e1'), /full/);
  store.saveRecord('events', {id: 'e1', capacity: occupied + 1});
  const ticket = store.registerEvent('e1');
  assert.equal(ticket.userId, 'me');
  assert.throws(() => store.registerEvent('e1'), /already have a ticket/);
  assert.throws(() => store.saveRecord('events', {id: 'e1', capacity: occupied}), /existing registrations/);
  store.cancelTicket(ticket.id);
  assert.throws(() => store.cancelTicket(ticket.id), /already cancelled/);
  assert.equal(store.registerEvent('e1').status, 'confirmed');
});

test('only published free events accept registration', () => {
  setupProfile();
  store.saveRecord('events', {id: 'e3', price: 100});
  assert.throws(() => store.registerEvent('e3'), /Only free/);
  store.saveRecord('events', {id: 'e3', price: 0, status: 'draft'});
  assert.throws(() => store.registerEvent('e3'), /not open/);
});

test('ticket QR codes redeem once and cancelled tickets cannot redeem', () => {
  setupProfile();
  const ticket = store.registerEvent('e1');
  const checked = store.checkInTicket(ticket.qrToken);
  assert.equal(checked.status, 'checked_in');
  assert.ok(checked.checkedInAt);
  assert.throws(() => store.checkInTicket(ticket.id), /already been checked in/);
  assert.throws(() => store.cancelTicket(ticket.id), /checked-in/);
  const other = store.registerEvent('e2');
  store.cancelTicket(other.id);
  assert.throws(() => store.checkInTicket(other.qrToken), /not valid/);
  assert.throws(() => store.checkInTicket('invalid-code'), /not found/);
});

test('food validation is atomic and does not trust submitted prices or quantities', () => {
  assert.throws(() => order(), /profile first/);
  setupProfile();
  const initial = stock('f1');
  for (const qty of [0, -1, 1.5, '', true, NaN, Infinity]) {
    assert.throws(() => order([{menuId: 'f1', qty}]), /Quantity/);
  }
  assert.throws(() => order([{menuId: 'f1', qty: initial + 1}]), /remaining/);
  assert.throws(() => order([{menuId: 'f1', qty: 1}, {menuId: 'f2', qty: 999}]), /remaining/);
  assert.throws(() => order([{menuId: 'f5', qty: 1}]), /not available/);
  assert.throws(() => store.placeOrder('e1', [{menuId: 'f1', qty: 1}], 'wrong-slot'), /pickup times/);
  assert.equal(stock('f1'), initial);
  const placed = order([{menuId: 'f1', qty: 1, price: 1}, {menuId: 'f1', qty: 1, price: 1}]);
  assert.equal(placed.items.length, 1);
  assert.equal(placed.items[0].qty, 2);
  assert.equal(placed.total, 1700);
  assert.equal(stock('f1'), initial - 2);
});

test('collection requires both payment and readiness and rejects duplicate redemption', () => {
  setupProfile();
  const placed = order();
  assert.throws(() => store.advanceOrder(placed.id, 'pickup'), /Confirm payment/);
  assert.throws(() => store.advanceOrder(placed.id, 'ready'), /Start preparing/);
  store.advanceOrder(placed.id, 'confirmPayment');
  assert.throws(() => store.advanceOrder(placed.id, 'confirmPayment'), /already been confirmed/);
  assert.throws(() => store.advanceOrder(placed.id, 'pickup'), /must be ready/);
  store.advanceOrder(placed.id, 'prepare');
  store.advanceOrder(placed.id, 'ready');
  const collected = store.advanceOrder(placed.qrToken, 'pickup');
  assert.equal(collected.status, 'collected');
  assert.ok(collected.collectedAt);
  assert.throws(() => store.advanceOrder(placed.qrToken, 'pickup'), /already been collected/);
});

test('ready but unpaid orders still cannot be collected', () => {
  setupProfile();
  const placed = order();
  store.advanceOrder(placed.id, 'prepare');
  store.advanceOrder(placed.id, 'ready');
  assert.throws(() => store.advanceOrder(placed.id, 'pickup'), /Confirm payment/);
  assert.equal(store.getState().orders.find(row => row.id === placed.id).status, 'ready');
});

test('cancellation releases stock exactly once and only before preparation or payment', () => {
  setupProfile();
  const initial = stock('f1');
  const placed = order([{menuId: 'f1', qty: 3}]);
  assert.equal(stock('f1'), initial - 3);
  store.cancelOrder(placed.id);
  assert.equal(stock('f1'), initial);
  assert.throws(() => store.cancelOrder(placed.id), /already cancelled/);
  assert.equal(stock('f1'), initial);
  assert.throws(() => store.advanceOrder(placed.id, 'prepare'), /cancelled/);
  const paid = order();
  store.advanceOrder(paid.id, 'confirmPayment');
  assert.throws(() => store.cancelOrder(paid.id), /Only unpaid/);
  const preparing = order();
  store.advanceOrder(preparing.id, 'prepare');
  assert.throws(() => store.cancelOrder(preparing.id), /Only unpaid/);
  assert.equal(stock('f1'), initial - 2);
});

test('deletion guards retain event history and inventory needed by outstanding orders', () => {
  assert.throws(() => store.removeRecord('events', 'e1'), /Archive/);
  assert.throws(() => store.removeRecord('menu', 'f1'), /open orders/);
  assert.throws(() => store.removeRecord('vendors', 'v1'), /Reassign/);
  assert.throws(() => store.saveRecord('orders', {id: 'o-demo-1', status: 'collected'}), /dedicated/);
});

test('state changes persist, notify once, and returned values cannot mutate state', () => {
  let notifications = 0;
  const stop = store.subscribe(() => notifications++);
  const profile = setupProfile();
  assert.equal(notifications, 1);
  profile.name = 'Outside mutation';
  const snapshot = store.getState();
  snapshot.members.length = 0;
  assert.equal(store.getState().profile.name, 'Test member');
  assert.ok(store.getState().members.length > 0);
  assert.equal(JSON.parse(storage.get('tiu-bss-demo-v1')).profile.name, 'Test member');
  assert.throws(() => store.registerEvent('missing'), /could not be found/);
  assert.equal(notifications, 1);
  stop();
  store.removeRecord('members', 'me');
  assert.equal(store.getState().profile, null);
  assert.equal(notifications, 1);
});

test('CSV exports neutralize formulas, quote embedded commas and preserve newlines', () => {
  store.saveRecord('messages', {id: 'msg1', name: ' =HYPERLINK("bad")', message: 'Hello,\nworld'});
  const csv = store.exportCSV('messages');
  assert.ok(csv.includes('"\' =HYPERLINK(""bad"")"'));
  assert.ok(csv.includes('"Hello,\nworld"'));
  assert.throws(() => store.exportCSV('__proto__'), /cannot be exported/);
  assert.equal(store.exportCSV('volunteers'), '');
});
