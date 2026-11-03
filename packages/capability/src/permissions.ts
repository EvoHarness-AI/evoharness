/**
 * The permission vocabulary.
 *
 * A permission names the outer edge of what a tool is allowed to affect. It is a *declaration*
 * written by the tool's author, read by the policy layer. Declaring one grants nothing: enforcement
 * lives in `docs/architecture.md` §3 `policy`, and until roadmap item 2 lands nothing blocks a call
 * on the strength of these ids. A tool that declares `fs.write` is promising it will not do more
 * than that; it is not asking for the right.
 *
 * Evolution rules, load-bearing because these ids become stored data:
 *
 * 1. Ids are append-only. Never rename, never reuse. Item 2 persists approval rules keyed by id and
 *    item 18 groups a cost ledger by them, so a rename is a data migration on `KERNEL.md` §3 terms.
 * 2. {@link PERMISSION_SCHEMA_VERSION} is the version a reader compares against stored ids. Reject
 *    unknown ids on read; do not silently widen them.
 * 3. The vocabulary describes capability ceilings, not resource scopes. "Which paths" belongs to the
 *    rule that reads this, not to the id.
 * 4. An id is only added when a real holder declares it or a named consumer exists in the roadmap.
 *    `session.write` and `ui.interact` have consumers in items 11/15 and 2/6 respectively; a
 *    "start a turn" id does not exist yet because its producer is the `turn_request` hook (item 8a),
 *    and it must be added there rather than back-dated here.
 */

export const PERMISSION_SCHEMA_VERSION = 1;

/** Every permission a declaration may name. Order is display order, not precedence. */
export const ALL_PERMISSIONS = [
	"fs.read",
	"fs.write",
	"fs.scratch",
	"process.exec",
	"net.out",
	"tool.delegate",
	"ui.interact",
	"session.write",
] as const;

export type PermissionId = (typeof ALL_PERMISSIONS)[number];

const PERMISSION_INDEX: ReadonlySet<string> = new Set<string>(ALL_PERMISSIONS);

/** Whether `value` is an id in the current vocabulary. Case-sensitive, exact match. */
export function isPermissionId(value: unknown): value is PermissionId {
	return typeof value === "string" && PERMISSION_INDEX.has(value);
}

/**
 * An absent declaration stays absent rather than becoming an empty list: an undeclared tool's reach
 * is unknown, which is a different fact from "it touches nothing". A policy reader must treat the
 * unknown case as the strictest one (confirm), never as read-only.
 */
