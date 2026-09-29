import type { TransactionSql } from 'postgres';
import { getSql } from './db';
import { sameFacts, type CustomerFacts } from './customers';
import { emitEvent, type EmittedBy, type EventName } from './events';
import { hasPermission } from './permissions';
import type { SessionUser } from './users';

// The job engine. A job is a defined piece of business work, such as a quote
// or an order. One run of a job is a case. A case changes only through the
// named steps its job defines, and each step:
//
//   - may start only from the states it lists,
//   - is checked against the actor's permission,
//   - records who did it (a user, a rule, or later an AI employee),
//   - commits its data change, its step record and its events together.
//
// Screens never write case data directly; every button runs a step. That is
// what lets an AI employee take over a step later: it becomes one more actor
// that calls the same step with the same typed input.
//
// Core defines the engine but knows no job. Job definitions live in their
// modules and are listed in src/modules/jobs.ts (the server composition root).

export type ActorKind = 'user' | 'rule' | 'employee';

export type Actor = {
  kind: ActorKind;
  id: string;
  name: string;
  /** Set for user actors, so permission checks can read the role. */
  user?: SessionUser;
};

export function userActor(user: SessionUser): Actor {
  return { kind: 'user', id: String(user.id), name: user.name, user };
}

export function ruleActor(id: string, name: string): Actor {
  return { kind: 'rule', id, name };
}

/** The roles a case can wait on. An AI employee id joins these later. */
export type AssigneeRole = 'sales' | 'approver' | 'operations';

export const ASSIGNEE_LABELS: Record<AssigneeRole, string> = {
  sales: 'Sales',
  approver: 'Approver',
  operations: 'Operations',
};

/** Which assignee roles a signed-in user works. Admins approve. */
export function assigneeRolesFor(user: SessionUser): AssigneeRole[] {
  if (user.role === 'admin') return ['sales', 'approver', 'operations'];
  if (user.role === 'member') return ['sales', 'operations'];
  return [];
}

export type CaseRecord<D = Record<string, unknown>, S = Record<string, unknown>> = {
  id: number;
  job: string;
  ref: string;
  state: string;
  title: string;
  assignee_role: AssigneeRole | null;
  subject: S;
  data: D;
  parent_case_id: number | null;
  version: number;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CaseStepRecord = {
  id: number;
  case_id: number;
  step: string;
  actor_kind: ActorKind;
  actor_id: string;
  actor_name: string;
  from_state: string | null;
  to_state: string;
  input: Record<string, unknown>;
  summary: string;
  created_at: string;
};

export type StepEvent = {
  name: EventName;
  payload: Record<string, unknown>;
  /** Use the case id, never the ref: refs restart when sample data is reset. */
  dedupeKey?: string;
};

export type StepResult = {
  /** Target state. Must be one of the step's `to` states; defaults to the first. */
  to?: string;
  /** Shallow-merged into case.data. */
  data?: Record<string, unknown>;
  subject?: Record<string, unknown>;
  title?: string;
  /** One plain sentence for the timeline. */
  summary: string;
  /** Emitted in the step's transaction. A function receives the saved case (for its ref). */
  events?: StepEvent[] | ((saved: CaseRecord) => StepEvent[]);
};

export type StepContext = {
  tx: TransactionSql;
  actor: Actor;
  /** Null when the step creates the case. */
  current: CaseRecord | null;
};

export type StepDefinition<I = any> = {
  label: string;
  /** States the step may start from. An empty list means the step creates a case. */
  from: string[];
  /** States the step may end in. The first is the default. */
  to: string[];
  /** A `<module>:<action>` permission, checked for user actors. */
  permission: string;
  /** Actor kinds allowed to run the step. Defaults to users only. */
  actors?: ActorKind[];
  /** Only an approver (admin) may run it, for example an approval. */
  approverOnly?: boolean;
  /** Validate and normalise the input. Throw StepError on bad input. */
  parse: (input: unknown) => I;
  run: (ctx: StepContext, input: I) => Promise<StepResult>;
};

export type JobStateDefinition = {
  label: string;
  /** Who the case waits for in this state. Null when nobody needs to act. */
  assignee: AssigneeRole | null;
  terminal?: boolean;
};

export type JobDefinition = {
  job: string;
  /** Owning module. Also the permission namespace. */
  module: EmittedBy;
  label: string;
  refPrefix: string;
  states: Record<string, JobStateDefinition>;
  steps: Record<string, StepDefinition>;
  /** The customer a case belongs to. The engine emits customer.updated when it changes. */
  customerOf?: (c: CaseRecord) => CustomerFacts | null;
};

export class StepError extends Error {
  constructor(message: string, public status: 400 | 403 | 404 | 409 = 400) {
    super(message);
  }
}

/**
 * The pure guard for one step: does it exist, may it start from this state,
 * and may this actor run it. Throws StepError; returns the step definition.
 */
export function checkStep(
  def: JobDefinition,
  currentState: string | null,
  stepName: string,
  actor: Actor,
): StepDefinition {
  const step = def.steps[stepName];
  if (!step) throw new StepError(`The ${def.label.toLowerCase()} job has no step "${stepName}".`, 404);

  const creates = step.from.length === 0;
  if (creates && currentState !== null) {
    throw new StepError(`"${step.label}" creates a new case and cannot run on an existing one.`, 409);
  }
  if (!creates && (currentState === null || !step.from.includes(currentState))) {
    const label = currentState ? def.states[currentState]?.label ?? currentState : 'no case';
    throw new StepError(`"${step.label}" cannot run while the case is "${label}".`, 409);
  }

  const allowedKinds = step.actors ?? ['user'];
  if (!allowedKinds.includes(actor.kind)) {
    throw new StepError(`A ${actor.kind} cannot run "${step.label}".`, 403);
  }
  if (actor.kind === 'user') {
    if (!actor.user || !hasPermission(actor.user, step.permission)) {
      throw new StepError(`Your account does not have ${step.permission} access.`, 403);
    }
    if (step.approverOnly && actor.user.role !== 'admin') {
      throw new StepError(`Only an approver can run "${step.label}".`, 403);
    }
  }
  // Employee actors: the authority check (job grants and limits) arrives
  // with the AI employee layer. Until then no step lists 'employee'.
  return step;
}

/** The steps a user can run on a case now, for the case screen's buttons. */
export function availableSteps(
  def: JobDefinition,
  currentState: string,
  user: SessionUser,
): { name: string; label: string }[] {
  const actor = userActor(user);
  return Object.entries(def.steps)
    .filter(([name]) => {
      try {
        checkStep(def, currentState, name, actor);
        return true;
      } catch {
        return false;
      }
    })
    .map(([name, step]) => ({ name, label: step.label }));
}

function resolveTarget(def: JobDefinition, step: StepDefinition, result: StepResult): string {
  const to = result.to ?? step.to[0];
  if (!step.to.includes(to) || !def.states[to]) {
    throw new Error(`Step "${step.label}" tried to move to "${to}", which it does not declare.`);
  }
  return to;
}

async function recordStep(
  tx: TransactionSql,
  caseId: number,
  stepName: string,
  actor: Actor,
  fromState: string | null,
  toState: string,
  input: unknown,
  summary: string,
) {
  await tx`
    insert into case_steps (case_id, step, actor_kind, actor_id, actor_name, from_state, to_state, input, summary)
    values (${caseId}, ${stepName}, ${actor.kind}, ${actor.id}, ${actor.name}, ${fromState}, ${toState},
            ${tx.json((input ?? {}) as never)}, ${summary})
  `;
}

async function emitAll(tx: TransactionSql, def: JobDefinition, result: StepResult, saved: CaseRecord, previous: CaseRecord | null) {
  const events = typeof result.events === 'function' ? result.events(saved) : result.events ?? [];
  for (const event of events) {
    await emitEvent(event.name, event.payload, { emittedBy: def.module, dedupeKey: event.dedupeKey, sql: tx });
  }
  if (def.customerOf) {
    const facts = def.customerOf(saved);
    if (facts && !sameFacts(facts, previous ? def.customerOf(previous) : null)) {
      await emitEvent('customer.updated', { v: 1, case_id: saved.id, case_ref: saved.ref, job: def.job, facts }, {
        emittedBy: def.module, dedupeKey: `case:${saved.id}:v${saved.version}`, sql: tx,
      });
    }
  }
}

/**
 * Run a step that creates a case. When `sourceEventId` is set (a consumer
 * creating a case from an event), a replayed event returns the existing case.
 */
export async function createCase(
  def: JobDefinition,
  stepName: string,
  rawInput: unknown,
  actor: Actor,
  opts: { parentCaseId?: number; sourceEventId?: number } = {},
): Promise<CaseRecord> {
  const step = checkStep(def, null, stepName, actor);
  const input = step.parse(rawInput);
  const sql = getSql();

  return sql.begin(async (tx) => {
    if (opts.sourceEventId !== undefined) {
      const existing = await tx<CaseRecord[]>`select * from cases where source_event_id = ${opts.sourceEventId}`;
      if (existing.length) return existing[0];
    }

    const result = await step.run({ tx, actor, current: null }, input);
    const to = resolveTarget(def, step, result);
    const state = def.states[to];

    const [created] = await tx<CaseRecord[]>`
      insert into cases (job, state, title, assignee_role, subject, data, parent_case_id, source_event_id, closed_at)
      values (
        ${def.job}, ${to}, ${result.title ?? def.label}, ${state.assignee},
        ${tx.json((result.subject ?? {}) as never)}, ${tx.json((result.data ?? {}) as never)},
        ${opts.parentCaseId ?? null}, ${opts.sourceEventId ?? null},
        ${state.terminal ? tx`now()` : null}
      )
      returning *
    `;
    const [counter] = await tx<{ last: number }[]>`
      insert into case_counters (job, last) values (${def.job}, 1)
      on conflict (job) do update set last = case_counters.last + 1
      returning last
    `;
    const [withRef] = await tx<CaseRecord[]>`
      update cases set ref = ${`${def.refPrefix}-${1000 + counter.last}`}
      where id = ${created.id}
      returning *
    `;
    await recordStep(tx, withRef.id, stepName, actor, null, to, input, result.summary);
    await emitAll(tx, def, result, withRef, null);
    return withRef;
  }) as Promise<CaseRecord>;
}

/**
 * Run one step on an existing case. Pass the version the screen showed so a
 * stale screen (someone else moved the case) gets a conflict, not a surprise.
 */
export async function runStep(
  def: JobDefinition,
  caseId: number,
  stepName: string,
  rawInput: unknown,
  actor: Actor,
  expectedVersion?: number,
): Promise<CaseRecord> {
  const sql = getSql();

  return sql.begin(async (tx) => {
    const rows = await tx<CaseRecord[]>`select * from cases where id = ${caseId} and job = ${def.job} for update`;
    if (!rows.length) throw new StepError('Case not found.', 404);
    const current = rows[0];
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      throw new StepError('This case changed since you opened it. Reload and try again.', 409);
    }

    const step = checkStep(def, current.state, stepName, actor);
    const input = step.parse(rawInput);
    const result = await step.run({ tx, actor, current }, input);
    const to = resolveTarget(def, step, result);
    const state = def.states[to];
    const data = result.data ? { ...current.data, ...result.data } : current.data;
    const subject = result.subject ? { ...current.subject, ...result.subject } : current.subject;

    const [updated] = await tx<CaseRecord[]>`
      update cases set
        state = ${to},
        title = ${result.title ?? current.title},
        assignee_role = ${state.assignee},
        data = ${tx.json(data as never)},
        subject = ${tx.json(subject as never)},
        version = version + 1,
        closed_at = ${state.terminal ? tx`now()` : null},
        updated_at = now()
      where id = ${caseId}
      returning *
    `;
    await recordStep(tx, caseId, stepName, actor, current.state, to, input, result.summary);
    await emitAll(tx, def, result, updated, current);
    return updated;
  }) as Promise<CaseRecord>;
}

export async function getCaseByRef(ref: string): Promise<CaseRecord | null> {
  const sql = getSql();
  const rows = await sql<CaseRecord[]>`select * from cases where ref = ${ref}`;
  return rows[0] ?? null;
}

export async function getCaseById(id: number): Promise<CaseRecord | null> {
  const sql = getSql();
  const rows = await sql<CaseRecord[]>`select * from cases where id = ${id}`;
  return rows[0] ?? null;
}

export async function listCases(opts: {
  job?: string;
  openOnly?: boolean;
  assigneeRoles?: AssigneeRole[];
  parentCaseId?: number;
  limit?: number;
} = {}): Promise<CaseRecord[]> {
  const sql = getSql();
  return sql<CaseRecord[]>`
    select * from cases
    where true
      ${opts.job ? sql`and job = ${opts.job}` : sql``}
      ${opts.openOnly ? sql`and closed_at is null` : sql``}
      ${opts.assigneeRoles ? sql`and assignee_role = any(${opts.assigneeRoles})` : sql``}
      ${opts.parentCaseId !== undefined ? sql`and parent_case_id = ${opts.parentCaseId}` : sql``}
    order by updated_at desc
    limit ${opts.limit ?? 200}
  `;
}

export async function getCaseSteps(caseId: number): Promise<CaseStepRecord[]> {
  const sql = getSql();
  return sql<CaseStepRecord[]>`select * from case_steps where case_id = ${caseId} order by id asc`;
}

// ---------- input helpers for step parsers ----------

export function inputObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new StepError('The step input must be an object.');
  return input as Record<string, unknown>;
}

export function requiredText(obj: Record<string, unknown>, key: string, label: string, max = 500): string {
  const value = typeof obj[key] === 'string' ? (obj[key] as string).trim() : '';
  if (!value) throw new StepError(`${label} is required.`);
  if (value.length > max) throw new StepError(`${label} must be ${max} characters or fewer.`);
  return value;
}

export function optionalText(obj: Record<string, unknown>, key: string, max = 2000): string | null {
  const value = typeof obj[key] === 'string' ? (obj[key] as string).trim() : '';
  if (value.length > max) throw new StepError(`Text must be ${max} characters or fewer.`);
  return value || null;
}

export function positiveInteger(value: unknown, label: string): number {
  const n = typeof value === 'string' ? Number(value.trim()) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) throw new StepError(`${label} must be a whole number above zero.`);
  return n;
}
