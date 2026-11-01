#!/usr/bin/env node

import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import process from "node:process";

const ignoredDirectories = new Set([".git", "coverage", "dist", "node_modules"]);
// apps/evoharness-web is a vendored fork port (apps/evoharness-web/docs/spec.md):
// its `.js` relative imports into bin/ are upstream's working convention
// (next.config.ts loads the CJS option parser before any bundling), so the
// root convention does not govern it — the app's own eslint does.
const vendoredRoots = ["apps/evoharness-web"];
const files = [];

function collectTypescriptFiles(directory) {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (!ignoredDirectories.has(entry.name)) {
				collectTypescriptFiles(join(directory, entry.name));
			}
			continue;
		}

		if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
			const file = join(directory, entry.name);
			const posix = file.split(sep).join("/");
			if (vendoredRoots.some((vendored) => posix === vendored || posix.startsWith(`${vendored}/`))) continue;
			files.push(file);
		}
	}
}

function isStringLiteralLike(node) {
	return node !== undefined && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node));
}

function isRelativeJavaScriptSpecifier(specifier) {
	return /^\.\.?\//.test(specifier) && /\.js(?:[?#].*)?$/.test(specifier);
}

const failures = [];

collectTypescriptFiles(".");

for (const file of files.sort()) {
	const sourceFile = ts.createSourceFile(
		file,
		readFileSync(file, "utf8"),
		ts.ScriptTarget.Latest,
		/* setParentNodes */ true,
	);

	function checkSpecifier(node) {
		if (!isRelativeJavaScriptSpecifier(node.text)) return;
		const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
		failures.push(`${relative(".", file)}:${line + 1}:${character + 1}: ${node.text}`);
	}

	function visit(node) {
		if (ts.isImportDeclaration(node) && isStringLiteralLike(node.moduleSpecifier)) {
			checkSpecifier(node.moduleSpecifier);
		} else if (ts.isExportDeclaration(node) && isStringLiteralLike(node.moduleSpecifier)) {
			checkSpecifier(node.moduleSpecifier);
		} else if (
			ts.isCallExpression(node) &&
			node.expression.kind === ts.SyntaxKind.ImportKeyword &&
			isStringLiteralLike(node.arguments[0])
		) {
			checkSpecifier(node.arguments[0]);
		} else if (ts.isImportTypeNode(node)) {
			if (isStringLiteralLike(node.argument) && ts.isLiteralTypeNode(node.argument)) {
				checkSpecifier(node.argument.literal);
			}
		}

		node.forEachChild(visit);
	}

	visit(sourceFile);
}

if (failures.length > 0) {
	console.error("Relative .js imports are not allowed in non-declaration .ts files:");
	for (const failure of failures) console.error(`  ${failure}`);
	process.exit(1);
}
