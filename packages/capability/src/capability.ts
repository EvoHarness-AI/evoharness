import type { PermissionId } from "./permissions.ts";

/**
 * One tool a capability ships, with the permissions that tool declares.
 *
 * A capability's own `permissions` list must be exactly the union of these (see
 * `validateCapability`), so a package can neither overstate itself as gentler than its tools nor
 * carry a tool whose reach it does not list.
 */
export interface CapabilityTool {
	readonly name: string;
	readonly permissions: readonly PermissionId[];
}

/**
 * The descriptor a `cap-*` package exports, with the six fields `docs/structure.md` §5.1 names:
 * id, title, tools, context, permissions, settings. Adding a seventh field is a structure change,
 * not an implementation detail.
 */
export interface Capability {
	/** Kebab-case identity, matching the package's directory suffix: `browser` for `cap-browser`. */
	readonly id: string;
	/** Human-readable name for surfaces. */
	readonly title: string;
	readonly tools: readonly CapabilityTool[];
	/**
	 * Model-facing notes the capability injects, as paths relative to the package root. The assembly
	 * layer reads them; nothing here injects them, and today no assembly layer does either, because
	 * the first `cap-*` package has not landed. Declared ahead of use on purpose — see
	 * `docs/structure.md` §5.1, which already puts these files in the skeleton.
	 */
	readonly context?: readonly string[];
	/** The union of every tool's permissions, and nothing else. */
	readonly permissions: readonly PermissionId[];
	/** Settings keys the capability owns; they merge into the global settings schema. */
	readonly settings?: readonly string[];
}

/** Kebab-case only: a `_`/`-` pair would share a namespace, which is what the MCP registry rejects. */
const CAPABILITY_ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function isCapabilityId(value: unknown): value is string {
	return typeof value === "string" && CAPABILITY_ID_PATTERN.test(value);
}
