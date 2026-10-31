#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { isBuiltin } from "node:module";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import ts from "typescript";
import process from "node:process";
import { getPublicWorkspacePackages } from "./release-packages.mjs";

// Packages without tsconfig.build.json are checked against a synthetic config.
const fallbackConfigName = "tsconfig.runtime-deps-fallback.json";
const fallbackConfig = JSON.stringify({ include: ["src/**/*"] });
const failures = [];

function checkSource(source, manifest) {
	const file = source.fileName;
	const declared = new Set([
		manifest.name,
		...Object.keys(manifest.dependencies ?? {}),
		...Object.keys(manifest.optionalDependencies ?? {}),
		...Object.keys(manifest.peerDependencies ?? {}),
	]);

	function checkSpecifier(node) {
		if (!node || !(ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) return;
		const specifier = node.text;
		// `cloudflare:` modules are built into the Workers runtime, like `node:` modules are into Node.
		if (
			specifier.startsWith(".") ||
			specifier.startsWith("/") ||
			specifier.startsWith("cloudflare:") ||
			isBuiltin(specifier)
		) {
			return;
		}
		const name = specifier.split("/").slice(0, specifier.startsWith("@") ? 2 : 1).join("/");
		if (declared.has(name)) return;
		const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
		failures.push(`${file}:${line + 1}: ${specifier} is not declared in ${manifest.name}'s runtime dependencies`);
	}

	function visit(node) {
		if (ts.isImportDeclaration(node)) {
			const clause = node.importClause;
			const bindings = clause?.namedBindings;
			if (
				!clause ||
				(!clause.isTypeOnly &&
					(clause.name ||
						!bindings ||
						!ts.isNamedImports(bindings) ||
						bindings.elements.length === 0 ||
						bindings.elements.some((element) => !element.isTypeOnly)))
			) {
				checkSpecifier(node.moduleSpecifier);
			}
		} else if (ts.isExportDeclaration(node) && !node.isTypeOnly) {
			const clause = node.exportClause;
			if (
				!clause ||
				!ts.isNamedExports(clause) ||
				clause.elements.length === 0 ||
				clause.elements.some((element) => !element.isTypeOnly)
			) {
				checkSpecifier(node.moduleSpecifier);
			}
		} else if (
			ts.isCallExpression(node) &&
			(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
				(ts.isIdentifier(node.expression) && node.expression.text === "require") ||
				(ts.isPropertyAccessExpression(node.expression) && node.expression.getText(source) === "require.resolve"))
		) {
			checkSpecifier(node.arguments[0]);
		}
		node.forEachChild(visit);
	}
	visit(source);
}

const packages = getPublicWorkspacePackages()
	.map(({ directory }) => ({ directory, sourceDirectory: resolve(directory, "src") }))
	.filter(({ sourceDirectory }) => existsSync(sourceDirectory))
	.map(({ directory, sourceDirectory }) => {
		const configPath = resolve(directory, "tsconfig.build.json");
		return {
			directory,
			sourceDirectory,
			manifest: JSON.parse(readFileSync(join(directory, "package.json"), "utf8")),
			configPath: existsSync(configPath) ? configPath : resolve(directory, fallbackConfigName),
		};
	});

for (const { directory, sourceDirectory, manifest, configPath } of packages) {
	const configFileParsingDiagnostics = [];
	let fileNames;
	let options;
	if (configPath.endsWith(fallbackConfigName)) {
		// Synthetic config (never on disk): the include pattern is relative to the package.
		const parsed = ts.parseJsonConfigFileContent(
			JSON.parse(fallbackConfig),
			ts.sys,
			directory,
			/* existingErrors */ undefined,
			configPath,
		);
		fileNames = parsed.fileNames;
		options = parsed.options;
	} else {
		const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
		if (readResult.error) {
			throw new Error(ts.flattenDiagnosticMessageText(readResult.error.messageText, "\n"));
		}
		const parsed = ts.parseJsonConfigFileContent(readResult.config, ts.sys, dirname(configPath));
		fileNames = parsed.fileNames;
		options = parsed.options;
	}
	if (configFileParsingDiagnostics.length > 0) {
		throw new Error(configFileParsingDiagnostics.join("\n"));
	}
	const program = ts.createProgram(fileNames, { ...options, noEmit: true });
	const roots = new Set(program.getRootFileNames().map((file) => resolve(file)));
	for (const sourceFile of program.getSourceFiles()) {
		const fileName = resolve(sourceFile.fileName);
		if (fileName.endsWith(".d.ts") || fileName.endsWith(".json")) continue;
		const path = relative(sourceDirectory, fileName);
		if (path.startsWith("..") || isAbsolute(path)) continue;
		// TypeScript's exclude only filters roots: imports can pull excluded files
		// back into the build. Reject that too, including type-only imports.
		if (!roots.has(fileName)) {
			failures.push(`${sourceFile.fileName} is excluded from ${manifest.name}'s build but imported by it`);
		}
		checkSource(sourceFile, manifest);
	}
}

if (failures.length > 0) {
	console.error("Undeclared runtime imports in public packages:");
	for (const failure of failures) console.error(`  ${failure}`);
	process.exit(1);
}
console.log("Public package runtime imports have declared dependencies.");
