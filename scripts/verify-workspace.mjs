/** 新增取号、输入、期号绑定与偏好隔离的回归检查；只读开奖数据。 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

// Node 原生类型擦除：仅为检查解析项目别名和无后缀的本地 TS 导入。
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) return next(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
  if (specifier.startsWith(".") && context.parentURL?.includes("/src/") && !/\.[a-z]+$/i.test(specifier)) {
    const candidate = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(candidate))) return next(candidate.href, context);
  }
  return next(specifier, context);
}});

const n = await import("../src/lib/notebook.ts");
const { GAMES } = await import("../src/lib/games.ts");
const { P5_CONFIG } = await import("../src/lib/digit.ts");
const { systemTickets } = await import("../src/lib/recommendation.ts");
const { recommendationBatch, runStrategy } = await import("../src/lib/predict.ts");
const { buildProfile } = await import("../src/lib/coverage.ts");
const { runDigitStrategy } = await import("../src/lib/digit-predict.ts");
const { judgePrizeForDraw } = await import("../src/lib/prize.ts");
const { ticketShape } = await import("../src/lib/stats.ts");
const data = Object.fromEntries(["dlt", "ssq", "p5"].map((g) => [g, JSON.parse(readFileSync(new URL(`../data/${g}.json`, import.meta.url), "utf8")).draws]));
let checks = 0;
function test(name, fn) { fn(); checks++; console.log(`通过：${name}`); }

test("排列五保留前导零、重复数字与位置", () => {
  const ts = n.parseTickets("05198\n0 0 9 0 4", "p5");
  assert.equal(n.ticketText(ts[0]), "05198"); assert.equal(n.ticketText(ts[1]), "00904");
  assert.equal(n.checkTicket(ts[1], { code:"26001",date:"2026-01-01",digits:[0,0,9,0,4] }).label, "一等奖");
  assert.equal(n.checkTicket(ts[1], { code:"26001",date:"2026-01-01",digits:[0,9,0,0,4] }).label, "未中奖");
});
test("批量输入拒绝非法字符、重复号、越界和不完整行", () => {
  for (const line of ["00 02 03 04 05 + 01 02", "01 01 03 04 05 + 01 02", "01 02 03 04 36 + 01 02", "01 02 03 04 05 + 01", "01x 02 03 04 05 + 01 02"]) assert.throws(() => n.parseTickets(line, "dlt"));
  assert.throws(() => n.parseTickets("12345\n1234", "p5"));
  assert.throws(() => n.parseTickets("", "ssq"));
  assert.equal(n.parseTickets("05,04,03,02,01＋02,01", "dlt")[0].red.join(","), "1,2,3,4,5");
});
test("形态计算不会修改数字位置，三连号计两对", () => {
  const nums=[9,0,1,2,0], original=[...nums];
  assert.deepEqual(ticketShape(nums), {sum:12,odd:2,consecutive:2}); assert.deepEqual(nums,original);
});
test("开奖绑定支持跨年和休市，缺失结果不判未中奖", () => {
  const draws=[{code:"25153"},{code:"26001"},{code:"26003"}];
  assert.equal(n.resolveDraw("after:25153",draws)?.code,"26001");
  assert.equal(n.resolveDraw("after:26001",draws)?.code,"26003");
  assert.equal(n.resolveDraw("after:26003",draws),undefined);
  assert.equal(n.resolveDraw("after:99999",draws),undefined);
});
test("大乐透奖级按期号切换，双色球特殊奖不误判", () => {
  assert.equal(judgePrizeForDraw(GAMES.dlt,"19018",4,2),3);
  assert.equal(judgePrizeForDraw(GAMES.dlt,"19019",4,2),4);
  assert.equal(judgePrizeForDraw(GAMES.dlt,"26013",4,0),7);
  assert.equal(judgePrizeForDraw(GAMES.dlt,"26014",4,0),5);
  assert.equal(judgePrizeForDraw(GAMES.dlt,"26014",3,0),7);
  const ticket=n.parseTickets("01 02 03 04 05 06 + 01","ssq")[0];
  assert.match(n.checkTicket(ticket,{code:"2026014",date:"2026-02-01",red:[1,2,3,7,8,9],blue:[2]}).label,/待核实/);
});
test("自动推荐和收藏不参与学习，购买与喜欢不重复放大", () => {
  const book=n.emptyNotebook(), ticket=n.parseTickets("05198","p5")[0];
  const base={id:"a",game:"p5",period:"after:26001",tickets:[ticket],reason:"测试",createdAt:10};
  book.records=[{...base,kind:"main"},{...base,id:"b",kind:"personal"},{...base,id:"c",kind:"backup"}];
  assert.equal(n.preferenceTickets(book,"p5").length,0);
  book.records.push({...base,id:"d",kind:"purchase"});
  book.likes.push({id:"liked",period:base.period,ticket,createdAt:11});
  assert.equal(n.preferenceTickets(book,"p5").length,1);
  assert.equal(n.preferenceTickets(book,"dlt").length,0);
  book.preferenceSince=12; book.likes=[];
  assert.equal(n.preferenceTickets(book,"p5").length,0);
  assert.equal(book.records.length,4);
  assert.deepEqual(n.readNotebook(JSON.stringify(book)),book);
  assert.throws(()=>n.readNotebook('{"version":1}'));
});
for (const game of ["dlt","ssq","p5"]) {
  test(`${game} 主推荐可复现、新周期更新、备选不影响主推荐`, () => {
    const a=systemTickets(game,data), b=systemTickets(game,data);
    assert.deepEqual(a,b); assert.equal(a.length,5); assert.equal(new Set(a.map(n.ticketKey)).size,5);
    const previous={...data,[game]:data[game].slice(0,-1)};
    assert.notDeepEqual(systemTickets(game,previous),a);
    assert.notDeepEqual(systemTickets(game,data,100),a);
    assert.deepEqual(systemTickets(game,data),a);
  });
  test(`${game} 个性化合法、去重、避开已购且不改输入`, () => {
    const signals=systemTickets(game,data), original=JSON.stringify(signals);
    for(let i=0;i<25;i++) {
      const result=n.personalizedTickets(game,signals,signals,`after:${26001+i}`);
      assert.equal(result.length,5); assert.equal(new Set(result.map(n.ticketKey)).size,5);
      for(const t of result) { assert(!signals.some((s)=>n.ticketKey(s)===n.ticketKey(t))); assert.deepEqual(n.parseTickets(n.ticketText(t),game)[0],t); }
    }
    assert.equal(JSON.stringify(signals),original);
  });
}
for(const game of ["dlt","ssq"]) test(`${game} 页面与回测生成完全一致，未来数据不泄漏`,()=>{
  const cfg=GAMES[game], draws=data[game], i=draws.length-10;
  const profiles={red:buildProfile(draws,"red",cfg.redMax),blue:buildProfile(draws,"blue",cfg.blueMax)};
  for(const id of ["best","second","random"]) {
    const batch=recommendationBatch(cfg,draws,i,id,5,profiles);
    const page=runStrategy(cfg,draws.slice(0,i),id,5,1).combos;
    assert.deepEqual(batch.red,page.map((t)=>t.red.map((p)=>p.num)));
    assert.deepEqual(batch.blue,page.map((t)=>t.blue.map((p)=>p.num)));
  }
  assert.deepEqual(recommendationBatch(cfg,draws,i,"best",1,profiles),recommendationBatch(cfg,draws,i,"random",1,profiles));
});
test("排列五取号与策略页一致",()=>assert.deepEqual(systemTickets("p5",data).map((t)=>t.digits),runDigitStrategy(P5_CONFIG,data.p5,"best",5,1).tickets));
console.log(`\n全部 ${checks} 组检查通过。`);
