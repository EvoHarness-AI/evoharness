#!/usr/bin/env node
/**
 * Parked ideas must have a wake-up condition, an expiry review, and a premise to
 * re-check — because "useful later" is a guess, and the guess is what expires.
 *
 * A plain list of deferred ideas fails in two directions. It is never noticed when
 * the moment arrives, and it is never deleted when the reason it seemed worth doing
 * turns out to have been wrong. So every entry needs all four lines:
 *
 *   条件：the machine-checkable trigger   `<glob> >= n` | `path_exists <path>` | `仅复核`
 *   复核：review_by <YYYY-MM-DD>          the backstop when the trigger never fires
 *   前提：the belief that made this worth parking, stated so a future reader can
 *                                          falsify it against reality, not against this file
 *   判断依据：the criteria to apply at wake-up
 *
 * `条件：仅复核` is allowed for the honest case where nothing observable marks the
 * moment — the idea then wakes only at its review date. Inventing a filesystem proxy
 * for a non-observable trigger would be false precision, and the review date is what
 * keeps such an entry from becoming a zombie.
 *
 * When this check goes red it demands a decision in the same change: implement it,
 * re-condition it with the observed new fact, or delete it because 前提 no longer
 * holds (commit message prefixed `PARKED-REJECT:`). "Leave it parked" is not one
 * of the three.
 */
import { existsSync, globSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.env.EVOHARNESS_CHECK_ROOT ? resolve(process.env.EVOHARNESS_CHECK_ROOT) : process.cwd();
const FILE = join(ROOT, "docs", "plan", "parked.md");
const TODAY = new Date().toISOString().slice(0, 10);

// [key, regex, 中文标签] —— 标签用于缺字段提示
const FIELDS = [
	["condition", /条件：(.+)$/m, "条件"],
	["review", /复核：(.+)$/m, "复核"],
	["premise", /前提：(.+)$/m, "前提"],
	["criteria", /判断依据：(.+)$/m, "判断依据"],
];

function field(lines, key) {
	const [, re] = FIELDS.find(([k]) => k === key);
	return re.exec(lines)?.[1]?.replaceAll("`", "").trim();
}

function fieldLabel(key) {
	return FIELDS.find(([k]) => k === key)[2];
}

/** Parse `### title` blocks under `## 条目`. Blocks outside that section are ignored. */
function entries(text) {
	const body = text.split(/^## 条目$/m)[1] ?? "";
	return body
		.split(/^### /m)
		.slice(1)
		.map((block) => {
			const [titleLine, ...rest] = block.split("\n");
			const lines = rest.join("\n");
			const entry = { title: titleLine.trim() };
			for (const [key] of FIELDS) entry[key] = field(lines, key);
			return entry;
		});
}

/** `<glob> >= <n>` → arrived when the glob matches at least n entries. */
function evalGlob(expression) {
	const match = /^(\S+)\s*>=\s*(\d+)$/.exec(expression);
	if (!match) return null;
	const pattern = match[1];
	const threshold = Number(match[2]);
	const matched = globSync(pattern, { cwd: ROOT });
	return { arrived: matched.length >= threshold, detail: `${pattern} matched ${matched.length} (threshold ${threshold})` };
}

/** `path_exists <path>` → arrived when the path exists under the repo root. */
function evalPathExists(expression) {
	const match = /^path_exists\s+(\S+)$/.exec(expression);
	if (!match) return null;
	const target = join(ROOT, match[1]);
	const exists = existsSync(target);
	return { arrived: exists, detail: `path ${match[1]} ${exists ? "exists" : "does not exist"}` };
}

/** `仅复核` → never fires on its own; the review date is the only wake-up. */
function evalReviewOnly(expression) {
	return expression === "仅复核" ? { arrived: false, detail: "仅复核（无可观测触发，靠复核日期）" } : null;
}

function evalCondition(expression) {
	return evalGlob(expression) ?? evalPathExists(expression) ?? evalReviewOnly(expression);
}

function evalReview(expression) {
	const match = /^review_by\s+(\d{4}-\d{2}-\d{2})$/.exec(expression);
	if (!match) return null;
	const date = match[1];
	if (Number.isNaN(Date.parse(date))) return null;
	return { arrived: date <= TODAY, detail: `review_by ${date} (today ${TODAY})` };
}

function main() {
	if (!existsSync(FILE)) {
		console.error(`x 缺少 ${FILE}`);
		console.error("  parked 约定要求该文件存在；若要移除整套约定，请同时从 check 链删除 check:parked。");
		process.exit(1);
	}
	const text = readFileSync(FILE, "utf8");
	const all = entries(text);

	// A renamed `## 条目` heading (or renamed `###` blocks) parses to zero entries and would pass
	// silently. The field labels survive that rename, so their presence without entries is drift.
	if (all.length === 0 && text.includes("条件：")) {
		console.error("x parked.md 有条目字段但解析到 0 条：保留 `## 条目` 与 `### 标题` 两个结构，否则守卫会假绿。");
		process.exit(1);
	}

	const problems = [];
	const arrived = [];
	let armed = 0;

	for (const entry of all) {
		for (const [key, , label] of FIELDS) {
			if (!entry[key]) problems.push(`「${entry.title}」缺少字段：${label}：`);
		}
		if (!entry.condition || !entry.review) continue;

		for (const [kind, expression] of [["触发条件", entry.condition], ["到期复核", entry.review]]) {
			const result = kind === "触发条件" ? evalCondition(expression) : evalReview(expression);
			if (!result) {
				problems.push(`「${entry.title}」的${kind}无法判定：\`${expression}\`（只支持 <glob> >= n、path_exists、review_by、仅复核）`);
				continue;
			}
			if (result.arrived) arrived.push({ title: entry.title, kind, detail: result.detail });
		}
		const hasProblem = problems.some((p) => p.includes(`「${entry.title}」`));
		const hasArrived = arrived.some((a) => a.title === entry.title);
		if (entry.condition && entry.review && !hasProblem && !hasArrived) armed++;
	}

	if (problems.length > 0) {
		console.error(`x parked.md 格式问题（${problems.length}）：`);
		for (const p of problems) console.error(`  - ${p}`);
		console.error("  每条必须有四行：条件：/ 复核：/ 前提：/ 判断依据：，且触发表达式合法。");
		process.exit(1);
	}

	if (arrived.length > 0) {
		console.error(`x ${arrived.length} 条 parked 条目到点（today ${TODAY}）：`);
		for (const a of arrived) console.error(`  - 「${a.title}」${a.kind}到点：${a.detail}`);
		console.error("  同一次改动里三选一：做（实现并删条）/ 改条件（写下观察到的新事实）/ 作废（删除并 PARKED-REJECT 提交）。");
		console.error("  没有第四种处理叫“留着以后再说”。");
		process.exit(1);
	}

	console.log(`${armed} parked idea(s) armed; 0 arrived (today ${TODAY}).`);
}

main();
