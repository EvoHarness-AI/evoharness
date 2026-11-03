/**
 * Declaring what a tool may affect.
 *
 * `permissions` is a ceiling that the policy layer reads, not a grant: declaring `fs.read` blocks
 * nothing by itself, and leaving it out does not fail either — an undeclared tool is simply *unknown*
 * and any rule written against the built-in set treats unknown as the strictest case. Ids come from
 * `ALL_PERMISSIONS`; a name outside it is refused at registration, naming this extension's path.
 */
import type { ExtensionAPI } from "@evoharness/coding-agent";
import { Type } from "typebox";

export default function (evoharness: ExtensionAPI) {
	evoharness.registerTool({
		name: "word_count",
		label: "word count",
		description: "Count the words in a file. Reads the file and changes nothing.",
		promptSnippet: "Count words in a file",
		parameters: Type.Object({ path: Type.String({ description: "File to count words in" }) }),
		permissions: ["fs.read"],
		async execute(_toolCallId, { path }) {
			const fs = await import("node:fs/promises");
			const text = await fs.readFile(path, "utf8");
			const words = text.split(" ").filter((word) => word.length > 0);
			return { content: [{ type: "text", text: `${words.length} words` }], details: undefined };
		},
	});
}
