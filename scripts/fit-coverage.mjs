#!/usr/bin/env node
/**
 * 覆盖优化参数拟合与验证（walk-forward）
 *
 * 目的：为「覆盖优化」方案（src/lib/coverage.ts）拟合红区、蓝区各自的选号参数，
 * 并用**未参与拟合**的数据检验其覆盖率是否真高于纯机选。
 *
 * 为什么目标函数是覆盖率而不是「命中个数」：
 *   开奖均匀随机时单注命中期望 = (每注号码数/号码池) × 每注号码数，与选号方式无关
 *   （脚本会把这一点也测出来并写进报告）。唯一能真实做高的是同价位多注的
 *   「至少命中 k 个 / 至少中得某奖级」概率，原理见 coverage.ts 头部注释。
 *
 * 协议（避免把噪声当优势）：
 *   1. walk-forward：每期只用该期之前的数据选号，与页面回测口径一致
 *   2. 训练/验证切分：参数只在训练段（前 70%）选择，验证段（后 30%）只用于检验
 *   3. 配对比较：候选与机选使用共同随机数流（同期、同注序），差值给出配对标准误、
 *      95% 置信区间与 p 值；并输出「仅候选命中 / 仅机选命中 / 两者都命中」计数
 *   4. 选参两步走：
 *        a) 权重是不是有用？在最大铺开下把各「热/冷/遗漏比例」与「无权重」做配对检验；
 *           无显著差异就取无权重（并把这个结论写进报告，而不是硬塞一组拟合值）
 *        b) 铺开要多大？固定权重扫铺开强度，取「达到饱和覆盖率（≤1SE）的最小铺开」
 *   5. 联合微调：奖级要求红蓝命中落在**同一注**上，两个分区的收益不会自动相乘，
 *      因此固定一区、以「至少中得某奖级」为目标再各扫一轮铺开强度
 *   6. 自校验：机选实测覆盖率需与解析基准 1−(1−p)^N 在 2 个标准误内一致
 *
 * 用法：
 *   npm run fit                  # 两个彩种、默认 5 注
 *   npm run fit -- --tickets 5   # 指定注数
 *   npm run fit -- --game dlt    # 只跑一个彩种
 *
 * 输出：.verify/fit-report.json（已在 .gitignore）+ 控制台摘要。
 * 只读 data/*.json，绝不写入（避免干扰计划任务的自动提交）。
 *
 * 算法来源：本脚本直接 import src/lib/coverage.ts、prize.ts、games.ts、stats.ts
 * （Node 类型擦除），因此「拟合用的」与「页面用的」是同一份实现，不存在公式漂移。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GAMES } from "../src/lib/games.ts";
import { mulberry32, shapeScorer } from "../src/lib/stats.ts";
import { mean, pairedDiff, rateSe } from "../src/lib/stat.ts";
import {
  batchAtLeastOne,
  judgePrize,
  singleBlueAnyProb,
  singlePrizeProb,
  singleRedGeProb,
} from "../src/lib/prize.ts";
import {
  buildCoverSet,
  buildCoverBatch,
  recommendationSeed,
  SHAPE_STRENGTH,
  TRIAL_SHAPE_STRENGTH,
  buildProfile,
  COVERAGE_PARAMS,
  distinctCount,
  hashSeed,
  RANDOM_PARAMS,
} from "../src/lib/coverage.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "data");
const OUT_DIR = join(ROOT, ".verify");

const args = process.argv.slice(2);
const argVal = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const ONLY_GAME = argVal("--game", null);
const TICKETS = Number(argVal("--tickets", 5));

/* ---------------- 候选 ---------------- */

/** 热/冷/遗漏权重组合（成对，和为 1） */
const TILTS = [
  { name: "none", hot: 0, due: 0 },
  { name: "hot", hot: 1, due: 0 },
  { name: "due", hot: 0, due: 1 },
  { name: "mix2575", hot: 0.75, due: 0.25 },
  { name: "mix5050", hot: 0.5, due: 0.5 },
  { name: "mix7525", hot: 0.25, due: 0.75 },
];
/** 铺开强度：0 = 机选；1e6 = 强铺开（几乎不重号） */
const SPREADS = [0, 6, 24, 60, 1e6];
const SPREAD_MAX = SPREADS[SPREADS.length - 1];
const WINDOW = 30;
/** 权重为 0 时 window 不参与计算，此处仅占位 */
const p = (tilt, spread, window = WINDOW) => ({
  hotWeight: tilt.hot,
  dueWeight: tilt.due,
  window,
  spread,
});
const label = (tiltName, spread) => `${tiltName}/s${spread}`;

/* ---------------- 统计工具 ---------------- */
// mean / pairedDiff / rateSe 从 src/lib/stat.ts 引入（与页面「覆盖优化 vs 纯机选」
// 对比用的是同一份实现），避免两处统计口径漂移。

/* ---------------- 评估 ---------------- */

/**
 * 在给定期索引区间上跑 walk-forward：每期只用之前的数据选号。
 * 返回每期指标数组（配对统计需要逐期值，不能只留均值）。
 */
function evaluate(cfg, profiles, draws, idxs, redParams, blueParams, tickets, shapeStrength = (redParams.spread || blueParams.spread) ? SHAPE_STRENGTH : 0) {
  const n = idxs.length;
  const anyPrize = new Uint8Array(n);
  const redGe2 = new Uint8Array(n);
  const redGe3 = new Uint8Array(n);
  const blueAny = new Uint8Array(n);
  const allZero = new Uint8Array(n);
  const avgHits = new Float64Array(n);
  /** 每期该批号码中得的最好奖等（0 = 未中奖），用于说明中奖结构 */
  const tierHist = new Uint8Array(n + 1);
  let distinctRed = 0;
  let distinctBlue = 0;

  for (let k = 0; k < n; k++) {
    const i = idxs[k];
    // 共同随机数：同一期同一随机源，候选与机选配对（同一期、同一注序）
    const rand = mulberry32(recommendationSeed(cfg.key, draws[i - 1].code, draws[i - 1].date));
    const batch = buildCoverBatch(profiles, i, { red: redParams, blue: blueParams }, tickets, rand, shapeStrength ? shapeScorer(draws, i) : undefined, shapeStrength);
    const redSet = batch.red;
    const blueSet = batch.blue;
    distinctRed += distinctCount(redSet);
    distinctBlue += distinctCount(blueSet);

    let ap = 0;
    let r2 = 0;
    let r3 = 0;
    let ba = 0;
    let hitAny = 0;
    let sumHits = 0;
    let bestTier = 0;
    for (let t = 0; t < tickets; t++) {
      const rh = redSet[t].filter((x) => draws[i].red.includes(x)).length;
      const bh = blueSet[t].filter((x) => draws[i].blue.includes(x)).length;
      const tier = judgePrize(cfg, rh, bh);
      if (tier > 0) {
        ap = 1;
        if (bestTier === 0 || tier < bestTier) bestTier = tier;
      }
      if (rh >= 2) r2 = 1;
      if (rh >= 3) r3 = 1;
      if (bh >= 1) ba = 1;
      if (rh + bh > 0) hitAny = 1;
      sumHits += rh + bh;
    }
    anyPrize[k] = ap;
    redGe2[k] = r2;
    redGe3[k] = r3;
    blueAny[k] = ba;
    allZero[k] = hitAny ? 0 : 1;
    avgHits[k] = sumHits / tickets;
    tierHist[bestTier]++;
  }

  return {
    anyPrize,
    redGe2,
    redGe3,
    blueAny,
    allZero,
    avgHits,
    tierHist,
    n,
    distinctRed: distinctRed / n,
    distinctBlue: distinctBlue / n,
  };
}

/** 汇总指标（每期 0/1 指标的均值即该指标的发生率） */
function summarize(ev) {
  return {
    anyPrize: mean(ev.anyPrize),
    redGe2: mean(ev.redGe2),
    redGe3: mean(ev.redGe3),
    blueAny: mean(ev.blueAny),
    allZero: mean(ev.allZero),
    avgHits: mean(ev.avgHits),
    distinctRed: ev.distinctRed,
    distinctBlue: ev.distinctBlue,
    tierHist: Array.from(ev.tierHist),
  };
}

const fmtPct = (x) => `${(x * 100).toFixed(2)}%`;
const fmtPp = (x) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}pp`;

function row(name, coverEv, randomEv) {
  const d = pairedDiff(coverEv[name], randomEv[name]);
  return {
    metric: name,
    cover: mean(coverEv[name]),
    random: mean(randomEv[name]),
    diff: d.diff,
    ci95: d.ci95,
    p: d.p,
    significant: d.significant,
    coverOnly: d.aOnly,
    randomOnly: d.bOnly,
    both: d.both,
    draws: d.n,
  };
}

function printRows(rows) {
  for (const r of rows) {
    console.log(
      `  ${r.metric.padEnd(9)} 覆盖 ${fmtPct(r.cover)} vs 机选 ${fmtPct(r.random)} | 差 ${fmtPp(r.diff).padStart(8)}  ` +
        `95%CI [${fmtPct(r.ci95[0])}, ${fmtPct(r.ci95[1])}] p=${r.p < 0.001 ? "<0.001" : r.p.toFixed(3)} ` +
        `${r.significant ? "★显著" : "不显著"}  (仅候选 ${r.coverOnly} / 仅机选 ${r.randomOnly} / 均中 ${r.both})`
    );
  }
}

/* ---------------- 分区选参 ---------------- */

/** 权重检验的显著性阈值：6 个候选里只有 5 个与 none 比较，做 Bonferroni 校正 */
const TILT_ALPHA = 0.05 / (TILTS.length - 1);

/**
 * 选一个区的参数，两步：
 *   a) 权重（热/冷/遗漏比例）到底有没有用？最大铺开下各候选与「无权重」配对比较，
 *      训练段须通过 Bonferroni 校正，且必须在**验证段同向复现**才采用，否则一律取 none。
 *      （开奖均匀随机时权重理论上无增益，这一步就是把这个结论检验出来，而不是硬塞一组拟合值。）
 *   b) 铺开强度取最大：理论与实测曲线均显示「尽量不重号」对覆盖率单调有利，
 *      因此不做「最小饱和」式的收缩，只把曲线留给报告备查。
 */
function fitZone({ runTrain, runValid, metric, zoneLabel, trainN }) {
  const noneTilt = { name: "none", hot: 0, due: 0 };

  const tiltTrain = TILTS.map((t) => ({ t, ev: runTrain(p(t, SPREAD_MAX)) }));
  const baseTrain = tiltTrain.find((x) => x.t.name === "none").ev;
  let best = tiltTrain[0];
  for (const x of tiltTrain) if (mean(x.ev[metric]) > mean(best.ev[metric])) best = x;
  const trainTest = pairedDiff(best.ev[metric], baseTrain[metric]);
  const passesTrain = best.t.name !== "none" && trainTest.p < TILT_ALPHA;

  let validTest = null;
  let adopted = noneTilt;
  if (passesTrain) {
    const evBest = runValid(p(best.t, SPREAD_MAX));
    const evBase = runValid(p(noneTilt, SPREAD_MAX));
    validTest = pairedDiff(evBest[metric], evBase[metric]);
    if (validTest.diff > 0 && validTest.p < 0.05) adopted = best.t;
  }

  console.log(
    `  [${zoneLabel}] 权重检验：最优 ${best.t.name} ${fmtPct(mean(best.ev[metric]))} vs 无权重 ${fmtPct(mean(baseTrain[metric]))} | ` +
      `训练段差 ${fmtPp(trainTest.diff)} p=${trainTest.p.toFixed(3)}（阈值 ${TILT_ALPHA.toFixed(3)}）` +
      (validTest
        ? ` | 验证段差 ${fmtPp(validTest.diff)} p=${validTest.p.toFixed(3)}`
        : " | 训练段未过阈值，不做验证段检验") +
      ` → ${adopted.name === "none" ? "采用无权重 none" : `采用 ${adopted.name}`}`
  );

  const curveTrain = SPREADS.map((s) => ({ spread: s, rate: mean(runTrain(p(adopted, s))[metric]) }));
  const curveValid = SPREADS.map((s) => ({ spread: s, rate: mean(runValid(p(adopted, s))[metric]) }));
  const monotone = curveValid.every((x, i) => i === 0 || x.rate >= curveValid[i - 1].rate - 1e-12);
  console.log(
    `  [${zoneLabel}] 铺开曲线（训练/验证）：` +
      curveTrain.map((x, i) => `s${x.spread}=${fmtPct(x.rate)}/${fmtPct(curveValid[i].rate)}`).join("  ") +
      `  → 取最大铺开 s${SPREAD_MAX}（验证段单调递增：${monotone ? "是 ✔" : "否"}）`
  );

  // 次优档位：在「覆盖率不显著下降」的前提下取**最小**铺开强度。
  // 判据：该档位的训练段覆盖率与最优差距不超过 1 个标准误（rateSe）。
  // 这样「次优方案」是一个真实可辨的选择——覆盖率几乎不变、但号码更集中
  // （实测：大乐透红区不同号 24.4 vs 25.0）；若直接取「排名第二档」（s60），
  // 输出与最优几乎完全一致（24.7 vs 25.0），这个槽位就没有意义了。
  const bestCurveRate = Math.max(...curveTrain.map((c) => c.rate));
  const satTol = rateSe(bestCurveRate, trainN);
  const saturatedSpreads = curveTrain.filter((c) => bestCurveRate - c.rate <= satTol).map((c) => c.spread);
  const secondSpread = saturatedSpreads.length ? Math.min(...saturatedSpreads) : SPREADS[SPREADS.length - 2];

  return {
    params: p(adopted, SPREAD_MAX),
    secondParams: p(adopted, secondSpread),
    secondSpread,
    saturationTolerance: satTol,
    secondCurveRate: curveTrain.find((c) => c.spread === secondSpread)?.rate ?? null,
    bestCurveRate,
    tiltName: adopted.name,
    objective: metric,
    tiltTest: {
      best: best.t.name,
      trainDiff: trainTest.diff,
      trainP: trainTest.p,
      alpha: TILT_ALPHA,
      passesTrain,
      validDiff: validTest?.diff ?? null,
      validP: validTest?.p ?? null,
      adopted: adopted.name,
    },
    curveTrain,
    curveValid,
    monotoneValid: monotone,
  };
}

/* ---------------- 主流程 ---------------- */

function fitGame(key, tickets) {
  const cfg = GAMES[key];
  const draws = JSON.parse(readFileSync(join(DATA_DIR, `${key}.json`), "utf8")).draws;
  const profiles = {
    red: buildProfile(draws, "red", cfg.redMax),
    blue: buildProfile(draws, "blue", cfg.blueMax),
  };

  // 评估区间：留出 200 期历史供窗口/遗漏统计；训练段前 70%，验证段后 30%
  const all = [];
  for (let i = 200; i < draws.length; i++) all.push(i);
  const split = Math.floor(all.length * 0.7);
  const train = all.slice(0, split);
  const valid = all.slice(split);

  console.log(
    `\n=== ${cfg.name}（${key}） ${draws.length} 期 | 训练 ${train.length} 期 | 验证 ${valid.length} 期 | ${tickets} 注 ===`
  );

  // --- 1) 分区选参（蓝区看「至少命中1个蓝号」，红区看「至少命中2个红号」） ---
  const blueFit = fitZone({
    runTrain: (bp) => evaluate(cfg, profiles, draws, train, RANDOM_PARAMS, bp, tickets),
    runValid: (bp) => evaluate(cfg, profiles, draws, valid, RANDOM_PARAMS, bp, tickets),
    metric: "blueAny",
    zoneLabel: "蓝区",
    trainN: train.length,
  });
  const redFit = fitZone({
    runTrain: (rp) => evaluate(cfg, profiles, draws, train, rp, RANDOM_PARAMS, tickets),
    runValid: (rp) => evaluate(cfg, profiles, draws, valid, rp, RANDOM_PARAMS, tickets),
    metric: "redGe2",
    zoneLabel: "红区",
    trainN: train.length,
  });
  const finalParams = { red: redFit.params, blue: blueFit.params };

  // --- 2) 联合诊断：奖级要求红蓝命中落在**同一注**上，两个分区的收益不会自动相乘，
  //        因此把「至少中得某奖级」随各区铺开强度的变化单独测一遍（训练段/验证段各一份），
  //        确认「最大铺开」在奖级口径下同样不亏 ---
  const jointBlueCurve = SPREADS.map((s) => {
    const bp = p({ name: "none", hot: 0, due: 0 }, s);
    return {
      spread: s,
      train: mean(evaluate(cfg, profiles, draws, train, redFit.params, bp, tickets).anyPrize),
      valid: mean(evaluate(cfg, profiles, draws, valid, redFit.params, bp, tickets).anyPrize),
    };
  });
  const jointRedCurve = SPREADS.map((s) => {
    const rp = p({ name: "none", hot: 0, due: 0 }, s);
    return {
      spread: s,
      train: mean(evaluate(cfg, profiles, draws, train, rp, blueFit.params, tickets).anyPrize),
      valid: mean(evaluate(cfg, profiles, draws, valid, rp, blueFit.params, tickets).anyPrize),
    };
  });
  console.log(
    `  联合诊断（至少中奖 随蓝区铺开，训练/验证）：` +
      jointBlueCurve.map((x) => `s${x.spread}=${fmtPct(x.train)}/${fmtPct(x.valid)}`).join("  ")
  );
  console.log(
    `  联合诊断（至少中奖 随红区铺开，训练/验证）：` +
      jointRedCurve.map((x) => `s${x.spread}=${fmtPct(x.train)}/${fmtPct(x.valid)}`).join("  ")
  );

  // --- 3) 机选基准 + 解析值自校验，然后对「最优 / 次优」两套配置分别详细评价 ---
  const randomFull = evaluate(cfg, profiles, draws, all, RANDOM_PARAMS, RANDOM_PARAMS, tickets);
  const randomValid = evaluate(cfg, profiles, draws, valid, RANDOM_PARAMS, RANDOM_PARAMS, tickets);

  const analytic = {
    anyPrize: batchAtLeastOne(singlePrizeProb(cfg), tickets),
    redGe2: batchAtLeastOne(singleRedGeProb(cfg, 2), tickets),
    redGe3: batchAtLeastOne(singleRedGeProb(cfg, 3), tickets),
    blueAny: batchAtLeastOne(singleBlueAnyProb(cfg), tickets),
    avgHits: (cfg.redCount * cfg.redCount) / cfg.redMax + (cfg.blueCount * cfg.blueCount) / cfg.blueMax,
  };

  // 自校验：机选实测应落在解析值 2 个标准误内（否则说明脚本或算法有问题）
  const selfCheck = {};
  for (const m of ["anyPrize", "redGe2", "redGe3", "blueAny"]) {
    const measured = mean(randomFull[m]);
    const prob = analytic[m];
    const se = Math.sqrt((prob * (1 - prob)) / all.length);
    selfCheck[m] = { measured, analytic: prob, se, inside2se: Math.abs(measured - prob) <= 2 * se };
  }
  const selfOk = Object.values(selfCheck).every((v) => v.inside2se);
  console.log(`自校验（机选实测 vs 解析基准，2SE 内）：${selfOk ? "通过 ✔" : "未通过 ✘"}`);

  const metricNames = ["anyPrize", "blueAny", "redGe2", "redGe3", "allZero"];

  /** 评价一套参数：训练/验证/全区间 + 配对检验 + 诚实性对照 */
  const evaluateConfig = (cfgParams, label) => {
    const fullEv = evaluate(cfg, profiles, draws, all, cfgParams.red, cfgParams.blue, tickets);
    const validEv = evaluate(cfg, profiles, draws, valid, cfgParams.red, cfgParams.blue, tickets);
    const trainEv = evaluate(cfg, profiles, draws, train, cfgParams.red, cfgParams.blue, tickets);
    const vRows = metricNames.map((m) => row(m, validEv, randomValid));
    const fRows = metricNames.map((m) => row(m, fullEv, randomFull));
    const honestEv = {
      avgHits: mean(fullEv.avgHits),
      randomAvgHits: mean(randomFull.avgHits),
      expectation: analytic.avgHits,
      diff: pairedDiff(fullEv.avgHits, randomFull.avgHits),
    };
    console.log(`\n  【${label}】验证段配对检验（${valid.length} 期）：`);
    printRows(vRows);
    console.log(`  【${label}】全区间配对检验（${all.length} 期）：`);
    printRows(fRows);
    console.log(
      `  【${label}】单注平均命中（全区间）：${honestEv.avgHits.toFixed(4)} vs 机选 ${honestEv.randomAvgHits.toFixed(4)} | ` +
        `理论期望 ${honestEv.expectation.toFixed(4)} | 差 ${honestEv.diff.diff.toFixed(4)} p=${honestEv.diff.p.toFixed(3)} ` +
        `${honestEv.diff.significant ? "★显著（需警惕）" : "无显著差异 ✔"}`
    );
    return {
      params: cfgParams,
      train: summarize(trainEv),
      valid: summarize(validEv),
      full: summarize(fullEv),
      validRows: vRows,
      fullRows: fRows,
      honest: honestEv,
    };
  };

  const configs = {
    best: evaluateConfig(finalParams, "最优（最大铺开）"),
    second: evaluateConfig(
      { red: redFit.secondParams, blue: blueFit.secondParams },
      `次优（铺开 s${redFit.secondSpread}）`
    ),
  };
  const honest = configs.best.honest;

  // --- 5) 注数边界：1 注（铺不开）、8 注（双色球红区必然重叠） ---
  const edge = {};
  for (const n of [1, 8]) {
    const rc = evaluate(cfg, profiles, draws, valid, finalParams.red, finalParams.blue, n);
    const rr = evaluate(cfg, profiles, draws, valid, RANDOM_PARAMS, RANDOM_PARAMS, n);
    const dAp = pairedDiff(rc.anyPrize, rr.anyPrize);
    const dB = pairedDiff(rc.blueAny, rr.blueAny);
    const dR2 = pairedDiff(rc.redGe2, rr.redGe2);
    edge[n] = {
      tickets: n,
      anyPrize: { cover: mean(rc.anyPrize), random: mean(rr.anyPrize), diff: dAp.diff, significant: dAp.significant, p: dAp.p },
      blueAny: { cover: mean(rc.blueAny), random: mean(rr.blueAny), diff: dB.diff, significant: dB.significant, p: dB.p },
      redGe2: { cover: mean(rc.redGe2), random: mean(rr.redGe2), diff: dR2.diff, significant: dR2.significant, p: dR2.p },
      distinctRed: rc.distinctRed,
      distinctBlue: rc.distinctBlue,
      avgHits: mean(rc.avgHits),
    };
    console.log(
      `  ${n} 注：至少中奖 ${fmtPct(edge[n].anyPrize.cover)} vs 机选 ${fmtPct(edge[n].anyPrize.random)} ` +
        `(${fmtPp(edge[n].anyPrize.diff)}, ${edge[n].anyPrize.significant ? "显著" : "不显著"}) | ` +
        `至少中蓝 ${fmtPct(edge[n].blueAny.cover)} | 覆盖不同红号 ${edge[n].distinctRed.toFixed(2)}/${cfg.redMax}`
    );
  }

  // 页面当前默认参数的表现（用于判断是否需要更新 COVERAGE_PARAMS）
  const defaults = evaluate(cfg, profiles, draws, all, COVERAGE_PARAMS[key].red, COVERAGE_PARAMS[key].blue, tickets);
  const defaultsValid = evaluate(cfg, profiles, draws, valid, COVERAGE_PARAMS[key].red, COVERAGE_PARAMS[key].blue, tickets);

  // 固定软形态方案与无形态基线比较，不按验证结果反复调强度。
  const plainValid = evaluate(cfg, profiles, draws, valid, COVERAGE_PARAMS[key].red, COVERAGE_PARAMS[key].blue, tickets, 0);
  const trialValid = evaluate(cfg, profiles, draws, valid, COVERAGE_PARAMS[key].red, COVERAGE_PARAMS[key].blue, tickets, TRIAL_SHAPE_STRENGTH);
  const shapeValidation = {
    strength: TRIAL_SHAPE_STRENGTH,
    activeStrength: SHAPE_STRENGTH,
    note: "奇偶、相邻连号对数、和值等权；只做软倾向，不宣称预测优势",
    anyPrize: pairedDiff(trialValid.anyPrize, plainValid.anyPrize),
    avgHits: pairedDiff(trialValid.avgHits, randomValid.avgHits),
    withShape: summarize(trialValid),
    withoutShape: summarize(plainValid),
  };
  console.log(`  软形态独立验证：覆盖差 ${fmtPp(shapeValidation.anyPrize.diff)} p=${shapeValidation.anyPrize.p.toFixed(3)}；单注命中 vs 机选 p=${shapeValidation.avgHits.p.toFixed(3)}`);

  return {
    game: key,
    name: cfg.name,
    draws: draws.length,
    tickets,
    range: { train: train.length, valid: valid.length, first: draws[all[0]].date, last: draws.at(-1).date },
    blueFit,
    redFit,
    joint: { blueCurve: jointBlueCurve, redCurve: jointRedCurve },
    finalParams,
    configs,
    analytic,
    selfCheck,
    selfOk,
    shapeValidation,
    randomValid: summarize(randomValid),
    randomFull: summarize(randomFull),
    edge,
    defaults: {
      params: COVERAGE_PARAMS[key],
      full: summarize(defaults),
      valid: summarize(defaultsValid),
    },
  };
}

mkdirSync(OUT_DIR, { recursive: true });
// 排列五不参与覆盖拟合：它只有一个奖级（5 位全中，1/100000），每位 0-9 独立均匀，
// 「铺开」在数学上无法提高概率——唯一可做的是保证多注互不重复，收益约 N²/2/1e5 量级。
// 排列五页面按「去重铺开 / 位置频率偏好 / 机选」三档如实展示，不在此处拟合。
const games = ONLY_GAME ? [ONLY_GAME] : ["dlt", "ssq"];
const report = {
  generatedAt: new Date().toISOString(),
  tickets: TICKETS,
  protocol: {
    walkForward: true,
    trainRatio: 0.7,
    objectives: { red: "redGe2（至少命中2个红号）", blue: "blueAny（至少命中1个蓝号）", joint: "anyPrize（至少中得某奖级）" },
    pairing: "common random numbers per draw",
    selection: "权重先做配对检验（训练段 Bonferroni 校正 + 验证段同向复现，否则取 none）；铺开强度取最大（理论与实测曲线均单调）",
  },
  games: [],
};

for (const g of games) report.games.push(fitGame(g, TICKETS));

writeFileSync(join(OUT_DIR, "fit-report.json"), JSON.stringify(report, null, 2), "utf8");
console.log(`\n报告已写入 .verify/fit-report.json（${report.games.length} 个彩种，${TICKETS} 注）`);
