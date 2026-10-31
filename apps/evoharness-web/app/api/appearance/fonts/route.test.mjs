import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test, { after } from "node:test";
import { createJiti } from "jiti";

const originalDir = process.env.EVOHARNESS_CODING_AGENT_DIR;
const dir = await mkdtemp(join(tmpdir(), "evoharness-fonts-test-"));
process.env.EVOHARNESS_CODING_AGENT_DIR = dir;
const { GET, PUT } = await createJiti(import.meta.url, { tsconfigPaths: true }).import("./route.ts");
const file = join(dir, "evoharness-web", "settings.json");
after(async () => {
  if (originalDir === undefined) delete process.env.EVOHARNESS_CODING_AGENT_DIR;
  else process.env.EVOHARNESS_CODING_AGENT_DIR = originalDir;
  await rm(dir, { recursive: true, force: true });
});
const request = (body, headers = {}) => new Request("http://localhost/api/appearance/fonts", {
  method: "PUT", headers: { Host: "localhost", "Content-Type": "application/json", ...headers }, body,
});

test("font saves and resets preserve backgrounds and other EvoHarness preferences", async () => {
  assert.deepEqual(await (await GET()).json(), { fonts: null });
  await mkdir(join(dir, "evoharness-web"), { recursive: true });
  await writeFile(file, JSON.stringify({ background: "mist", artifactsPrompt: false, other: { keep: true } }));
  for (const fonts of [{ ui: "Microsoft YaHei", mono: "Consolas" }, { ui: "思源黑体 CN", mono: "JetBrains Mono" }, { ui: "", mono: "" }]) {
    assert.equal((await PUT(request(JSON.stringify({ fonts })))).status, 200);
    assert.deepEqual(await (await GET()).json(), { fonts });
    const stored = JSON.parse(await readFile(file, "utf8"));
    assert.equal(stored.background, "mist");
    assert.equal(stored.artifactsPrompt, false);
    assert.deepEqual(stored.other, { keep: true });
  }
});

test("untrusted, malformed and CSS-like font values never change the settings file", async () => {
  const before = await readFile(file, "utf8");
  for (const [body, headers, status] of [
    ['{"fonts":{"ui":"Arial","mono":""}}', { Origin: "https://untrusted.example" }, 403],
    ['{"fonts":{"ui":"Arial","mono":""}}', { "Content-Type": "text/plain" }, 415],
    ["{", {}, 400], ["null", {}, 400], ['{"fonts":{}}', {}, 400],
    ['{"fonts":{"ui":"Arial; color:red","mono":""}}', {}, 400],
    ['{"fonts":{"ui":"Arial","mono":12}}', {}, 400],
  ]) {
    assert.equal((await PUT(request(body, headers))).status, status);
    assert.equal(await readFile(file, "utf8"), before);
  }
});

test("an unreadable configuration is reported and cannot be overwritten", async () => {
  await writeFile(file, "{damaged");
  assert.equal((await GET()).status, 500);
  assert.equal((await PUT(request('{"fonts":{"ui":"Arial","mono":""}}'))).status, 500);
  assert.equal(await readFile(file, "utf8"), "{damaged");
});
