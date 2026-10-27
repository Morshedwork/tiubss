import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const adminSessions = sqliteTable('admin_sessions', {
  id: text('id').primaryKey(),
  credentialVersion: text('credential_version').notNull(),
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
  target: text('target').notNull(),
  createdAt: integer('created_at').notNull(),
});
