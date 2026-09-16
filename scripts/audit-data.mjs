#!/usr/bin/env node
/**
 * 开奖数据体检（只读，绝不写入 data/）
 *
 * 两类检查：
 *  A. 结构性（硬性）：期号格式与唯一性、日期格式/升序/非未来、号码个数与范围、
 *     号码不重复、开奖星期是否符合各彩种规律（法定休市属已知例外，单独列出）。
 *     发现问题 → 退出码 1。
 *  B. 统计性（提示，不改变退出码）：每区号码频率的卡方拟合检验。号码频率若整体
 *     偏离均匀，可能是数据被错误解析，也可能是官方历史记录本身如此——因此当某个
 *     区显著偏离时会自动做「前后半段 + 分段」诊断，用来区分「某一段数据可疑」与
 *     「长期稳定偏差」。
 *
 * 用法：npm run audit
 *
 * 说明：卡方统计量按「不放回抽样」做了尺度修正（Var 比二项小 (池-每期个数)/(池-1)），
 * 并对同一彩种多个号码池的重复检验使用 1% 阈值判定「高度提示」，避免多重比较误报。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GAMES } from "../src/lib/games.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "data");

/* ---------------- 卡方分布上尾概率 ---------------- */

function gammaln(x) {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
    0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** 下不完全伽马 P(a,x) 的级数展开 */
function gser(a, x) {
  let ap = a;
  let sum = 1 / a;
  let del = sum;
  for (let n = 0; n < 200; n++) {
    ap++;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - gammaln(a));
}

/** 上不完全伽马 Q(a,x) 的连分式 */
function gcf(a, x) {
  const FPMIN = 1e-300;
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
}

/** 卡方上尾概率 p = P(X ≥ chi2) */
function chi2UpperP(chi2, df) {
  if (chi2 <= 0) return 1;
  const a = df / 2;
  const x = chi2 / 2;
  return x < a + 1 ? 1 - gser(a, x) : gcf(a, x);
}

/* ---------------- 检查 ---------------- */

let hard = 0;
const fail = (msg) => {
  hard++;
  console.log("  ✗ " + msg);
};

/** 号码频率卡方（含不放回尺度修正）＋必要时做分期诊断 */
function frequencyCheck(label, draws, zone, pool, pick) {
  const counts = new Array(pool + 1).fill(0);
  for (const d of draws) for (const n of d[zone]) counts[n]++;
  const total = draws.length * pick;
  const exp = total / pool;
  let pearson = 0;
  for (let n = 1; n <= pool; n++) pearson += ((counts[n] - exp) ** 2) / exp;
  // 不放回抽样使计数方差比二项小 (pool-pick)/(pool-1)
  const scale = (pool - pick) / (pool - 1);
  const chi2 = pearson * scale;
  const df = pool - 1;
  const p = chi2UpperP(chi2, df);
  const sd = Math.sqrt(exp * scale);
  const arr = counts.slice(1).map((v, i) => ({ n: i + 1, v }));
  const hi = [...arr].sort((a, b) => b.v - a.v).slice(0, 3);
  const lo = [...arr].sort((a, b) => a.v - b.v).slice(0, 3);
  const fmt = (r) => `${String(r.n).padStart(2, "0")}(${r.v},${((r.v - exp) / sd >= 0 ? "+" : "")}${((r.v - exp) / sd).toFixed(1)}σ)`;

  const verdict = p < 0.001 ? "✗ 高度偏离均匀" : p < 0.01 ? "⚠ 偏离均匀（1% 水平）" : "✔ 与均匀一致";
  console.log(
    `  ${label} 频率: 期望 ${exp.toFixed(1)} 次/号 | 实测 ${Math.min(...counts.slice(1))}~${Math.max(...counts.slice(1))} | ` +
      `卡方 ${chi2.toFixed(2)} (df=${df}, p=${p < 0.001 ? "<0.001" : p.toFixed(3)}) → ${verdict}`
  );
  console.log(`     最多: ${hi.map(fmt).join(" ")} | 最少: ${lo.map(fmt).join(" ")}`);

  if (p < 0.01) {
    const mid = Math.floor(draws.length / 2);
    const seg = (ds) => {
      const c = new Array(pool + 1).fill(0);
      for (const d of ds) for (const n of d[zone]) c[n]++;
      const e = (ds.length * pick) / pool;
      let x = 0;
      for (let n = 1; n <= pool; n++) x += ((c[n] - e) ** 2) / e;
      const xi = x * scale;
      return { chi2: xi, p: chi2UpperP(xi, df), n: ds.length, hiRatio: hi.reduce((a, r) => a + c[r.n], 0) / hi.length / e };
    };
    const a = seg(draws.slice(0, mid));
    const b = seg(draws.slice(mid));
    console.log(
      `     分期诊断: 前半(${a.n}期) 卡方 ${a.chi2.toFixed(1)} p=${a.p < 0.001 ? "<0.001" : a.p.toFixed(3)} 高频号占期望 ${(a.hiRatio * 100).toFixed(0)}% | ` +
        `后半(${b.n}期) 卡方 ${b.chi2.toFixed(1)} p=${b.p < 0.001 ? "<0.001" : b.p.toFixed(3)} 高频号占期望 ${(b.hiRatio * 100).toFixed(0)}%`
    );
    const era =
      a.p < 0.01 && b.p >= 0.01
        ? "→ 异常集中在**前半段**：请核对该段原始记录；若与官方接口逐条比对一致，则属官方历史记录本身特征（大乐透 2007–2013 年即属此情况，见 data/dlt.json 与 GAMES.dlt.historyNote）"
        : a.p >= 0.01 && b.p < 0.01
          ? "→ 异常集中在**后半段**：优先怀疑近期抓取或解析"
          : "→ 前后段均偏离：更像长期特征或系统性偏差，建议与官方源逐条比对后再下结论";
    console.log(`     ${era}`);
  }
  return p;
}

console.log(`开奖数据体检（只读）—— ${new Date().toISOString().slice(0, 10)}\n`);

for (const [key, cfg] of Object.entries(GAMES)) {
  let data;
  try {
    data = JSON.parse(readFileSync(join(DATA_DIR, `${key}.json`), "utf8"));
  } catch (e) {
    fail(`${cfg.name}: data/${key}.json 读取失败（${e.message}）`);
    continue;
  }
  const draws = data.draws ?? [];
  console.log(`=== ${cfg.name}（${key}）${draws.length} 期 | ${draws[0]?.date} ~ ${draws.at(-1)?.date} | updatedAt=${data.updatedAt} ===`);
  if (!draws.length) {
    fail(`${cfg.name}: 数据为空`);
    continue;
  }

  const codes = new Set();
  const weekdayOff = [];
  let prev = "";
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < draws.length; i++) {
    const d = draws[i];
    const at = `第${i + 1}条 ${d.code}/${d.date}`;
    if (codes.has(d.code)) fail(`${at}: 期号重复`);
    codes.add(d.code);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) fail(`${at}: 日期格式异常`);
    if (d.date < prev) fail(`${at}: 日期未升序`);
    if (d.date > today) fail(`${at}: 日期在未来`);
    prev = d.date;
    if (d.red.length !== cfg.redCount) fail(`${at}: ${cfg.redName}${d.red.length}个（应 ${cfg.redCount}）`);
    if (d.blue.length !== cfg.blueCount) fail(`${at}: ${cfg.blueName}${d.blue.length}个（应 ${cfg.blueCount}）`);
    if (new Set(d.red).size !== d.red.length) fail(`${at}: ${cfg.redName}有重复号`);
    if (new Set(d.blue).size !== d.blue.length) fail(`${at}: ${cfg.blueName}有重复号`);
    for (const n of d.red) if (!Number.isInteger(n) || n < 1 || n > cfg.redMax) fail(`${at}: ${cfg.redName}越界 ${n}`);
    for (const n of d.blue) if (!Number.isInteger(n) || n < 1 || n > cfg.blueMax) fail(`${at}: ${cfg.blueName}越界 ${n}`);
    const [yy, mm, dd] = d.date.split("-").map(Number);
    const wd = new Date(Date.UTC(yy, mm - 1, dd, 12)).getUTCDay();
    if (!cfg.drawDays.includes(wd)) weekdayOff.push(`${d.date}(${"日一二三四五六"[wd]})`);
  }
  console.log(`  期号唯一 ${codes.size === draws.length ? "✔" : "✗"} | 结构与范围检查完成`);
  console.log(
    `  开奖星期不符合规律: ${weekdayOff.length} 期${weekdayOff.length ? `（法定休市属预期）→ ${weekdayOff.slice(0, 8).join(" ")}${weekdayOff.length > 8 ? " …" : ""}` : " ✔"}`
  );
  frequencyCheck(cfg.redName, draws, "red", cfg.redMax, cfg.redCount);
  frequencyCheck(cfg.blueName, draws, "blue", cfg.blueMax, cfg.blueCount);
  console.log("");
}

console.log(hard ? `结构性检查发现 ${hard} 处问题（退出码 1）` : "结构性检查通过 ✔（频率偏离仅作提示，不视为错误）");
process.exit(hard ? 1 : 0);
