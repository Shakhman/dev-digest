import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, jsonb, timestamp, doublePrecision } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';

// ============================================================ Review & findings

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id'),
  /** The agent_run that produced this review (links the timeline run ↔ review). */
  runId: uuid('run_id'),
  kind: text('kind', { enum: ['summary', 'review'] }).notNull(),
  verdict: text('verdict'),
  summary: text('summary'),
  score: integer('score'),
  model: text('model'),
  createdAt: now(),
});

export const findings = pgTable('findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  reviewId: uuid('review_id')
    .notNull()
    .references(() => reviews.id, { onDelete: 'cascade' }),
  file: text('file').notNull(),
  startLine: integer('start_line').notNull(),
  endLine: integer('end_line').notNull(),
  severity: text('severity').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  rationale: text('rationale').notNull(),
  suggestion: text('suggestion'),
  confidence: doublePrecision('confidence').notNull(),
  kind: text('kind').notNull().default('finding'),
  trifectaComponents: jsonb('trifecta_components').$type<string[]>(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
});

export const prIntent = pgTable('pr_intent', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  intent: text('intent').notNull(),
  inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  riskAreas: jsonb('risk_areas').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
});

export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),
  /** PR HEAD SHA this brief was generated for (SPEC-09 staleness signal, AC-18). */
  generatedHeadSha: text('generated_head_sha'),
  /** Structured call's reported tokensIn/tokensOut/costUsd (AC-12) — recorded, never recomputed. */
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  costUsd: doublePrecision('cost_usd'),
});

/**
 * Smart Diff per-file pseudocode summaries cache. Keyed by `pr_id` (NOT
 * folded into `pr_files`) because `pr_files` is deleted and re-inserted on
 * every PR detail page load (`modules/pulls/routes.ts`) — a cache on
 * `pr_files` columns would be silently wiped on the next view. Mirrors
 * `pr_brief`'s shape family (json blob + generation/staleness + cost/token
 * metadata, recorded from the structured call, never recomputed).
 */
export const prDiffSummary = pgTable('pr_diff_summary', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  /** `{ summaries: { path: string; summary: string }[] }`. */
  json: jsonb('json').notNull(),
  generatedHeadSha: text('generated_head_sha'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  costUsd: doublePrecision('cost_usd'),
});
