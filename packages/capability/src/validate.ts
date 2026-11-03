import { type Capability, isCapabilityId } from "./capability.ts";
import { ALL_PERMISSIONS, isPermissionId, type PermissionId } from "./permissions.ts";

/**
 * Where a declaration came from. The kind decides how an undeclared permission list is treated; the
 * path is what a reader sees in the error, and what a policy rule layers its trust over.
 */
export type DeclarationOwnerKind = "builtin" | "sdk" | "extension" | "capability";

export interface DeclarationOwner {
	readonly kind: DeclarationOwnerKind;
	readonly path: string;
}

/** The parts of a tool declaration the contract can judge, so callers can pass a definition slice. */
export interface ToolDeclaration {
	readonly name: string;
	readonly permissions?: readonly unknown[] | undefined;
	/** Pass `ToolDefinition.reachesTools`, present or not. */
	readonly reachesTools?: unknown;
}

export type DeclarationFailureCode =
	| "unknown-permission"
	| "malformed-permissions"
	| "duplicate-permission"
	| "delegation-without-reach"
	| "missing-declaration"
	| "invalid-capability-id"
	| "duplicate-tool-name"
	| "capability-overstates"
	| "capability-understates";

export interface DeclarationFailure {
	readonly code: DeclarationFailureCode;
	readonly message: string;
}

/** Owners that must declare: their tools are what policy rules are written against. */
const DECLARATION_REQUIRED: ReadonlySet<DeclarationOwnerKind> = new Set<DeclarationOwnerKind>([
	"builtin",
	"capability",
]);

const KNOWN_IDS = ALL_PERMISSIONS.join(", ");

function sortedUnique(ids: readonly string[]): readonly string[] {
	return [...new Set(ids)].sort();
}

/**
 * Checks one tool's declaration. Returns an empty list for an undeclared tool registered by an
 * extension or the SDK: that is legacy debt the ledger records, not a hard error, because 98 call
 * sites including 42 documented examples predate the contract. A built-in or capability tool left
 * undeclared is a hole, so that combination does fail.
 */
export function validateToolDeclaration(tool: ToolDeclaration, owner: DeclarationOwner): readonly DeclarationFailure[] {
	const declared = tool.permissions;
	if (declared === undefined) {
		if (!DECLARATION_REQUIRED.has(owner.kind)) return [];
		return [
			{
				code: "missing-declaration",
				message: `Tool "${tool.name}" (${owner.path}) is ${owner.kind} and must declare permissions[]; policy rules are written against ${owner.kind} tools, so an undeclared one is a hole, not a migration.`,
			},
		];
	}
	if (!Array.isArray(declared)) {
		return [
			{
				code: "malformed-permissions",
				message: `Tool "${tool.name}" (${owner.path}) declares permissions as ${typeof declared}, expected an array of permission ids.`,
			},
		];
	}

	const failures: DeclarationFailure[] = [];
	const seen = new Set<string>();
	for (const [index, entry] of declared.entries()) {
		if (typeof entry !== "string" || entry === "") {
			failures.push({
				code: "malformed-permissions",
				message: `Tool "${tool.name}" (${owner.path}) has permissions[${index}] = ${JSON.stringify(entry)}, expected a non-empty permission id.`,
			});
			continue;
		}
		if (!isPermissionId(entry)) {
			failures.push({
				code: "unknown-permission",
				message: `Tool "${tool.name}" (${owner.path}) declares unknown permission "${entry}". Known ids: ${KNOWN_IDS}.`,
			});
			continue;
		}
		if (seen.has(entry)) {
			failures.push({
				code: "duplicate-permission",
				message: `Tool "${tool.name}" (${owner.path}) declares permission "${entry}" more than once.`,
			});
			continue;
		}
		seen.add(entry);
	}
	if (failures.length === 0 && seen.has("tool.delegate") && tool.reachesTools === undefined) {
		failures.push({
			code: "delegation-without-reach",
			message: `Tool "${tool.name}" (${owner.path}) declares "tool.delegate" without reachesTools, so nothing bounds the tools it may reach. Declare the reach or drop the permission.`,
		});
	}
	return failures;
}

/** The union of a tool list's permissions, sorted, for comparing against a capability declaration. */
export function unionToolPermissions(
	tools: readonly { readonly name: string; readonly permissions: readonly unknown[] | undefined }[],
): readonly string[] {
	const ids: string[] = [];
	for (const tool of tools) {
		for (const id of tool.permissions ?? []) {
			if (typeof id === "string") ids.push(id);
		}
	}
	return sortedUnique(ids);
}

/**
 * Checks a capability descriptor against its own tools. Nothing consumes this at runtime yet: the
 * first `cap-*` package is what calls it, through `scripts/check-capability-boundaries.mjs`. It
 * exists now so that package has a rule to meet rather than one invented later.
 */
export function validateCapability(capability: Capability): readonly DeclarationFailure[] {
	const owner: DeclarationOwner = { kind: "capability", path: `capability:${capability.id}` };
	const failures: DeclarationFailure[] = [];

	if (!isCapabilityId(capability.id)) {
		failures.push({
			code: "invalid-capability-id",
			message: `Capability id "${capability.id}" is not kebab-case; ids are namespace keys, so "_" and "-" spellings may not both exist.`,
		});
	}

	const names = new Set<string>();
	for (const tool of capability.tools) {
		if (names.has(tool.name)) {
			failures.push({
				code: "duplicate-tool-name",
				message: `Capability "${capability.id}" lists tool "${tool.name}" twice.`,
			});
		}
		names.add(tool.name);
		failures.push(...validateToolDeclaration(tool, owner));
	}

	failures.push(
		...validateToolDeclaration({ name: `<${capability.id}>`, permissions: capability.permissions }, owner),
	);
	if (failures.length > 0) return failures;

	// Compare only once both sides are known to be well-formed id lists; otherwise the diff is noise.
	const union = unionToolPermissions(capability.tools);
	const declared = sortedUnique(capability.permissions);
	const overstated = declared.filter((id) => !union.includes(id));
	const understated = union.filter((id) => !declared.includes(id));
	if (overstated.length > 0) {
		failures.push({
			code: "capability-overstates",
			message: `Capability "${capability.id}" declares ${overstated.join(", ")} that none of its tools declare; drop them or add the tool that reaches them.`,
		});
	}
	if (understated.length > 0) {
		failures.push({
			code: "capability-understates",
			message: `Capability "${capability.id}" omits ${understated.join(", ")} that its own tools declare; a reader would trust the narrower list.`,
		});
	}
	return failures;
}

/** One line per failure, so a caller can throw with the whole picture. */
export function formatDeclarationFailures(failures: readonly DeclarationFailure[]): string {
	return failures.map((failure) => failure.message).join(" ");
}

/** The ids a policy reader should act on, narrowing a declaration to the vocabulary. */
export function declaredPermissions(permissions: readonly unknown[] | undefined): readonly PermissionId[] | undefined {
	if (permissions === undefined) return undefined;
	return permissions.filter(isPermissionId);
}
