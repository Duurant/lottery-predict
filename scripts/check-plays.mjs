/** 玩法录入回归：运行真实解析、持久化校验与偏好去重，无第三方测试框架。 */
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
  if (/^\.{1,2}\//.test(specifier) && !/\.[a-z]+$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { parsePlay, playExample, recommendedPlays, recommendedPlayName } = await import("../src/lib/plays.ts");
const { emptyNotebook, parseTickets, readNotebook, preferenceTickets, ticketKey } = await import("../src/lib/notebook.ts");
const { selectionSummary } = await import("../src/lib/stats.ts");
let checked = 0;
function count(game, mode, text, expected, unique = expected) {
  const tickets = parsePlay(game, { mode, text });
  assert.equal(tickets.length, expected);
  assert.equal(new Set(tickets.map(ticketKey)).size, unique);
  checked++; return tickets;
}
count("dlt", "multiple", "01 02 03 04 05 06 + 01 02", 6);
count("dlt", "multiple", "01 02 03 04 05 + 01 02 03", 3);
count("dlt", "multiple", "01 02 03 04 05 06 + 01 02 03", 18);
const front = count("dlt", "dantuo", "01 02 # 03 04 05 06 + 01 02", 4);
assert.ok(front.every((t) => t.red.includes(1) && t.red.includes(2)));
count("dlt", "dantuo", "01 02 03 04 05 + 01 # 02 03", 2);
count("dlt", "dantuo", "01 02 # 03 04 05 06 + 01 # 02 03", 8);
count("ssq", "multiple", "01 02 03 04 05 06 07 + 01", 7);
count("ssq", "multiple", "01 02 03 04 05 06 + 01 02", 2);
count("ssq", "multiple", "01 02 03 04 05 06 07 + 01 02", 14);
count("ssq", "dantuo", "01 02 # 03 04 05 06 07 + 01", 5);
count("ssq", "dantuo", "01 02 # 03 04 05 06 07 + 01 02", 10);
const digits = count("p5", "multiple", "05 | 0 | 9 | 0 | 48", 4);
assert.deepEqual(digits[0].digits, [0, 0, 9, 0, 4]);
assert.deepEqual(digits[3].digits, [5, 0, 9, 0, 8]);
count("p5", "mixed", "00904\n05 | 1 | 9 | 0 | 48", 5);
count("dlt", "mixed", playExample("dlt", "mixed"), 11, 6);
count("ssq", "mixed", playExample("ssq", "mixed"), 18, 12);
count("dlt", "mixed", "01，02，03，04，05 ＋ 01，02\n01 02 ＃ 03 04 05 06 ＋ 01 02", 5, 4);
for (const [game, mode, text, message] of [
  ["dlt", "dantuo", "01 # 01 02 03 04 05 + 01 02", /重叠/],
  ["dlt", "dantuo", "01 02 03 04 05 # 06 + 01 02", /胆码最多/],
  ["dlt", "dantuo", "01 02 # 03 04 05 + 01 02", /至少 6/],
  ["dlt", "dantuo", "01 02 # 03 04 05 06 + 01 02 03", /另一区/],
  ["ssq", "dantuo", "01 02 # 03 04 05 06 07 + 01 # 02", /不支持/],
  ["dlt", "mixed", "01 02 03 04 05 + 01 02\n00 02 03 04 05 06 + 01 02", /第 2 行.*范围/],
  ["dlt", "multiple", "01 01 02 03 04 05 + 01 02", /重复/],
  ["dlt", "multiple", "01 02 03 04 05 + 01 02", /至少一个区/],
  ["p5", "multiple", "00 | 1 | 2 | 3 | 45", /重复/],
  ["p5", "multiple", "0123456789 | 0123456789 | 0123456789 | 01 | 0", /超过.*1000/],
  ["p5", "mixed", "00904\n0519", /第 2 行/],
  ["p5", "mixed", "\n00904\n\n0519", /第 4 行/],
  ["p5", "mixed", "0".repeat(20001), /文本过长/],
]) { assert.throws(() => parsePlay(game, { mode, text }), message); checked++; }

const book = emptyNotebook();
const entry = { mode: "mixed", text: playExample("dlt", "mixed") };
book.records.push({ id: "purchase:test", game: "dlt", kind: "purchase", period: "after:26105", tickets: parsePlay("dlt", entry), entry, reason: "混合录入", createdAt: 1 });
const restored = readNotebook(JSON.stringify(book));
assert.equal(restored.records[0].entry.text, entry.text);
assert.equal(preferenceTickets(restored, "dlt").length, 6); // 单式和胆拖均包含在复式展开中。
restored.records.push({ ...restored.records[0], id: "backup:test", kind: "backup" });
assert.equal(preferenceTickets(restored, "dlt").length, 6);
restored.records[0].tickets.pop();
assert.throws(() => readNotebook(JSON.stringify(restored)), /原记录未被覆盖/);
checked += 4;

const largeEntry = { mode: "multiple", text: "0123456789 | 0123456789 | 0123456789 | 0 | 0" };
const largeBook = emptyNotebook();
largeBook.records.push({ id: "large", game: "p5", kind: "purchase", period: "after:26105", tickets: parsePlay("p5", largeEntry), entry: largeEntry, reason: "按位复式", createdAt: 1 });
assert.equal(readNotebook(JSON.stringify(largeBook)).records[0].tickets.length, 1000); checked++;
for (const game of ["dlt", "ssq", "p5"]) {
  const ordinary = parseTickets(playExample(game, "single"), game);
  const old = emptyNotebook();
  old.records.push({ id: "old", game, kind: "purchase", period: "after:26105", tickets: ordinary, reason: "旧记录", createdAt: 1 });
  assert.deepEqual(readNotebook(JSON.stringify(old)), old); checked++;
  const candidates = parsePlay(game, { mode: "mixed", text: playExample(game, "mixed") });
  for (const plan of recommendedPlays(game, candidates)) assert.ok(parsePlay(game, plan).length > 1);
  checked++;
}
const summary = selectionSummary([[0], [0], [5], [9]], 9, 0);
assert.equal(summary.frequent[0].n, 0);
assert.equal(summary.frequent[0].count, 2);
assert.equal(summary.bigRate, 0.5); checked++;
const sameRed = parseTickets("01 02 03 04 05 + 01 02\n01 02 03 04 05 + 03 04", "dlt");
const limited = recommendedPlays("dlt", sameRed);
assert.deepEqual(limited.map((entry) => recommendedPlayName("dlt", entry)), ["后区复式", "后区胆拖"]); checked++;
console.log(`玩法回归通过：${checked} 项（注数、胆码、混合录入、位置与前导零、边界、旧记录、偏好去重）。`);
