import test, {beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeInstagramReelURL} from '../public/js/instagram.js';

const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key)
};
const store = await import('../public/js/store.js');
const reel = (overrides = {}) => ({title: 'A community moment', url: 'https://www.instagram.com/reel/AbCd123_/', category: 'Community', status: 'draft', ...overrides});

beforeEach(() => store.resetDemo());

test('reel links canonicalize share variants and reject unrelated or unsafe URLs', () => {
  assert.equal(normalizeInstagramReelURL(' https://instagram.com/reels/AbCd123_/?igsh=abc#fragment '), 'https://www.instagram.com/reel/AbCd123_/');
  for (const url of [
    'http://www.instagram.com/reel/AbCd123_/',
    'https://www.instagram.com.evil.test/reel/AbCd123_/',
    'https://evil.test/?url=https://www.instagram.com/reel/AbCd123_/',
    'https://name:password@www.instagram.com/reel/AbCd123_/',
    'https://www.instagram.com:8443/reel/AbCd123_/',
    'https://www.instagram.com/tiu.bss/reels/',
    'https://www.instagram.com/p/AbCd123_/',
    'https://www.instagram.com/reel/AbCd123_/embed/',
    'javascript:alert(1)',
    '<iframe src="https://www.instagram.com/reel/AbCd123_/"></iframe>'
  ]) assert.equal(normalizeInstagramReelURL(url), '', url);
});

test('reels support validated edits, status changes, canonical deduplication, and removal', () => {
  assert.deepEqual(store.getState().reels, []);
  const saved = store.saveRecord('reels', reel({title: '  Hello from Tokyo  ', caption: '  Our adda  '}));
  assert.equal(saved.title, 'Hello from Tokyo');
  assert.equal(saved.caption, 'Our adda');
  assert.ok(saved.createdAt);
  assert.throws(() => store.saveRecord('reels', reel({url: 'https://instagram.com/reels/AbCd123_/?igsh=abc'})), /already been added/);
  assert.throws(() => store.saveRecord('reels', {id: saved.id, title: 'x'.repeat(101)}), /1–100/);
  assert.throws(() => store.saveRecord('reels', {id: saved.id, caption: 'x'.repeat(1001)}), /1,000/);
  assert.throws(() => store.saveRecord('reels', {id: saved.id, category: 'Unknown'}), /Choose a reel section/);
  assert.throws(() => store.saveRecord('reels', {id: saved.id, status: 'active'}), /draft or published/);
  const updated = store.saveRecord('reels', {id: saved.id, status: 'published', category: 'Gatherings'});
  assert.equal(updated.createdAt, saved.createdAt);
  assert.equal(updated.status, 'published');
  assert.equal(store.getState().reels.length, 1);
  assert.equal(JSON.parse(storage.get('tiu-bss-demo-v1')).reels[0].category, 'Gatherings');
  store.removeRecord('reels', saved.id);
  assert.deepEqual(store.getState().reels, []);
});

test('bulk reel imports fail atomically on invalid links, duplicates, and storage failure', () => {
  const snapshot = store.getState();
  let notifications = 0;
  const stop = store.subscribe(() => notifications++);
  assert.throws(() => store.importInstagramReels('https://instagram.com/reel/AAAA123/\nhttps://example.com/no'), /Line 2:.*No reels were imported/);
  assert.throws(() => store.importInstagramReels('https://instagram.com/reel/AAAA123/\nhttps://www.instagram.com/reel/AAAA123/?a=1'), /Line 2:.*already been added/);
  assert.deepEqual(store.getState(), snapshot);
  assert.equal(notifications, 0);
  const imported = store.importInstagramReels('https://instagram.com/reel/AAAA123/\nhttps://instagram.com/reel/BBBB456/', 'Food & mela');
  assert.equal(imported.length, 2);
  assert.deepEqual(imported.map(row => row.title), ['Community reel 01', 'Community reel 02']);
  assert.ok(imported.every(row => row.status === 'draft' && row.category === 'Food & mela'));
  assert.equal(notifications, 1);
  const beforeFailure = store.getState();
  const write = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = () => { throw new Error('quota'); };
  try { assert.throws(() => store.importInstagramReels(['https://instagram.com/reel/CCCC789/']), /storage is full/); }
  finally { globalThis.localStorage.setItem = write; }
  assert.deepEqual(store.getState(), beforeFailure);
  assert.equal(notifications, 1);
  stop();
});

test('an existing workspace gains an empty reel collection without losing records', async () => {
  store.saveProfile({name: 'Returning community member', type: 'student'});
  const existing = store.getState();
  delete existing.reels;
  storage.set('tiu-bss-demo-v1', JSON.stringify(existing));
  const migrated = await import('../public/js/store.js?migration=reels');
  assert.equal(migrated.getState().profile.name, 'Returning community member');
  assert.equal(migrated.getState().events.length, existing.events.length);
  assert.deepEqual(migrated.getState().reels, []);
});
