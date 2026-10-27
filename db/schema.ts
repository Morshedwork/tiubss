import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const adminSessions = sqliteTable('admin_sessions', {
  id: text('id').primaryKey(),
  credentialVersion: text('credential_version').notNull(),
  accountId: text('account_id'),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull(),
});
export const loginLimits = sqliteTable('admin_login_limits', {
  id: text('id').primaryKey(),
  attempts: integer('attempts').notNull(),
  expiresAt: integer('expires_at').notNull(),
});
export const websiteRecords = sqliteTable('website_records', {
  id: text('id').primaryKey(),
  collection: text('collection').notNull(),
  status: text('status').notNull(),
  data: text('data').notNull(),
  version: integer('version').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, table => [index('website_records_collection').on(table.collection, table.status)]);
export const websiteSettings = sqliteTable('website_settings', {
  id: text('id').primaryKey(),
  data: text('data').notNull(),
  version: integer('version').notNull().default(1),
  updatedAt: integer('updated_at').notNull(),
});
export const adminAudit = sqliteTable('admin_audit', {
  id: text('id').primaryKey(),
  action: text('action').notNull(),
  actor: text('actor').notNull().default('Admin'),
  target: text('target').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const adminAccounts = sqliteTable('admin_accounts', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash'),
  status: text('status').notNull(),
  inviteHash: text('invite_hash').unique(),
  inviteExpiresAt: integer('invite_expires_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const communityMembers = sqliteTable('community_members', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
  directoryOptIn: integer('directory_opt_in').notNull().default(0),
  data: text('data').notNull(),
  version: integer('version').notNull().default(1),
  updatedAt: integer('updated_at').notNull(),
});
// Versioned ledgers keep capacity, stock, reservations and redemption atomic.
export const communityLedgers = sqliteTable('community_ledgers', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  data: text('data').notNull(),
  version: integer('version').notNull().default(1),
  updatedAt: integer('updated_at').notNull(),
}, table => [index('community_ledgers_kind').on(table.kind)]);
