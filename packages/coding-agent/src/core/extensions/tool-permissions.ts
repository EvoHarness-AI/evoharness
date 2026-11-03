/**
 * Where a tool declaration is checked on its way into the session's registry.
 *
 * Extensions are checked when they register (`loader.ts`), which is where a bad declaration can
 * still be reported as a load error. This module covers the two entrances that never pass through
 * the extension API: tools handed in by an SDK host, and the merge that decides which definition
 * wins per name.
 *
 * Replacing a built-in by name is an existing pattern, so it is not refused. What used to be wrong
 * is that it happened silently: `docs/architecture.md` §3 promises that a side-effecting action goes
 * through policy with no alternative path, and a policy rule keyed to a name cannot tell the
 * original from a replacement that declared less. So the replacement is reported with both
 * declarations side by side, and an undeclared one stays *unknown* downstream, which the policy
 * reads as the strictest case rather than as inherited trust.
 */

import { type DeclarationOwnerKind, formatDeclarationFailures, validateToolDeclaration } from "@evoharness/capability";
import { createSyntheticSourceInfo, type SourceInfo } from "../source-info.ts";
import type { RegisteredTool, ToolDefinition } from "./types.ts";

/** An entry of the definition-first registry the session keeps. */
export interface MergedTool {
	definition: ToolDefinition;
	sourceInfo: SourceInfo;
}

/**
 * The custom tools competing for the registry, in declaration order: extension registrations, then
 * whatever the SDK host handed in. A plain `AgentTool` from a host has no provenance, so it gets the
 * same synthetic `<sdk:name>` path the session used to build by hand.
 */
export function collectCustomTools(
	registeredTools: readonly RegisteredTool[],
	sdkDefinitions: readonly ToolDefinition[],
	isAllowed: (name: string) => boolean,
): RegisteredTool[] {
	return [
		...registeredTools,
		...sdkDefinitions.map((definition) => ({
			definition,
			sourceInfo: createSyntheticSourceInfo(`<sdk:${definition.name}>`, { source: "sdk" }),
		})),
	].filter((tool) => isAllowed(tool.definition.name));
}

/** Who registered a tool, judging by the source its `SourceInfo` carries. */
export function ownerKindOf(source: string): DeclarationOwnerKind {
	return source === "sdk" ? "sdk" : "extension";
}

/**
 * Fills the registry with custom tools, skipping and reporting any that fail the contract, and
 * returning the ones that were accepted. Reports instead of throwing: this runs while a session is
 * live, and killing it over one bad tool would trade a visible error for an invisible crash.
 * Skipping is what makes the report true, because the caller builds both the model-facing
 * declarations and the executable registry from the returned list. A custom tool that replaces a
 * built-in is kept, but its declaration is named against the one it displaced.
 */
export function mergeCustomDefinitions(
	registry: Map<string, MergedTool>,
	builtInDefinitions: ReadonlyMap<string, ToolDefinition>,
	customTools: readonly RegisteredTool[],
	report: (error: string, extensionPath: string) => void,
): RegisteredTool[] {
	const accepted: RegisteredTool[] = [];
	for (const tool of customTools) {
		const { definition, sourceInfo } = tool;
		const name = definition.name;
		const failures = validateToolDeclaration(definition, {
			kind: ownerKindOf(sourceInfo.source),
			path: sourceInfo.path,
		});
		if (failures.length > 0) {
			report(formatDeclarationFailures(failures), sourceInfo.path);
			continue;
		}
		const displaced = builtInDefinitions.get(name);
		if (displaced) {
			report(
				`Tool "${name}" from ${sourceInfo.path} replaces the built-in of that name. Built-in ceiling: ${describeCeiling(displaced)}. Replacement ceiling: ${describeCeiling(definition)}.`,
				sourceInfo.path,
			);
		}
		registry.set(name, { definition, sourceInfo });
		accepted.push(tool);
	}
	return accepted;
}

/** A declaration as a reader sees it, with "unknown" spelled out instead of printed as nothing. */
function describeCeiling(definition: ToolDefinition): string {
	return definition.permissions
		? definition.permissions.join(", ")
		: "undeclared (unknown, treated as the strictest case)";
}

/**
 * The permissions a re-registration adds to a tool that already exists under the same name.
 *
 * An extension may replace its own tool, and the registry has no generation counter to notice, so
 * the only thing worth refusing is the quiet widening: a tool approved as read-only that comes back
 * claiming to write. Shrinking or changing an unrelated part of the definition stays allowed.
 */
export function widenedPermissions(
	previous: readonly unknown[] | undefined,
	next: readonly unknown[] | undefined,
): readonly string[] {
	if (previous === undefined || next === undefined) return [];
	const held = new Set(previous.filter((id): id is string => typeof id === "string"));
	return next.filter((id): id is string => typeof id === "string" && !held.has(id));
}
