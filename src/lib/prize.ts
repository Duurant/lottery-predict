/**
 * 奖级判定
 *
 * 用于「同价位多注至少中得某奖级」这一覆盖度指标的计算：只要给定
 * 红区/蓝区命中个数，即可判定该注是否中奖、以及中得第几等奖。
 *
 * 奖级表按官方规则整理（红区命中数 + 蓝区命中数 → 奖等）：
 *  - 双色球：红球 6/33、蓝球 1/16，六等奖含「只中蓝球」
 *  - 大乐透：前区 5/35、后区 2/12，九等奖含「只中后区两个」
 */
import type { GameConfig, GameKey } from "./games";

export interface PrizeRule {
  /** 红区（前区/红球）命中个数 */
  red: number;
  /** 蓝区（后区/蓝球）命中个数 */
  blue: number;
  /** 奖等：1 为一等奖，数值越大奖级越低 */
  tier: number;
}

/** 各彩种奖级表（命中个数 → 奖等），与官方规则一致 */
export const PRIZE_RULES: Record<GameKey, PrizeRule[]> = {
  dlt: [
    { red: 5, blue: 2, tier: 1 },
    { red: 5, blue: 1, tier: 2 },
    { red: 5, blue: 0, tier: 3 },
    { red: 4, blue: 2, tier: 4 },
    { red: 4, blue: 1, tier: 5 },
    { red: 3, blue: 2, tier: 6 },
    { red: 4, blue: 0, tier: 7 },
    { red: 3, blue: 1, tier: 8 },
    { red: 2, blue: 2, tier: 8 },
    { red: 3, blue: 0, tier: 9 },
    { red: 1, blue: 2, tier: 9 },
    { red: 2, blue: 1, tier: 9 },
    { red: 0, blue: 2, tier: 9 },
  ],
  ssq: [
    { red: 6, blue: 1, tier: 1 },
    { red: 6, blue: 0, tier: 2 },
    { red: 5, blue: 1, tier: 3 },
    { red: 5, blue: 0, tier: 4 },
    { red: 4, blue: 1, tier: 4 },
    { red: 4, blue: 0, tier: 5 },
    { red: 3, blue: 1, tier: 5 },
    { red: 2, blue: 1, tier: 6 },
    { red: 1, blue: 1, tier: 6 },
    { red: 0, blue: 1, tier: 6 },
  ],
};

/** 判定单注奖等：未中奖返回 0，中奖返回奖等（1 为最高） */
export function judgePrize(cfg: GameConfig, redHits: number, blueHits: number): number {
  for (const r of PRIZE_RULES[cfg.key]) {
    if (r.red === redHits && r.blue === blueHits) return r.tier;
  }
  return 0;
}

/** 组合数 C(n, k)，n 较小时直接用乘除（本文件仅用于小参数） */
function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** 超几何概率：从 pool 个号中开出的 drawn 个号里，自己选的 pick 个号中恰好命中 hits 个 */
export function hypergeometric(pool: number, pick: number, drawn: number, hits: number): number {
  return (choose(pick, hits) * choose(pool - pick, drawn - hits)) / choose(pool, drawn);
}

/**
 * 单注中得任意奖级的理论概率（按奖级表精确枚举，不模拟）。
 * 同时用于多注随机基准：N 注独立时至少一注中奖的概率 = 1 − (1 − p)^N。
 */
export function singlePrizeProb(cfg: GameConfig): number {
  let p = 0;
  for (let r = 0; r <= cfg.redCount; r++) {
    const pr = hypergeometric(cfg.redMax, cfg.redCount, cfg.redCount, r);
    for (let b = 0; b <= cfg.blueCount; b++) {
      const pb = hypergeometric(cfg.blueMax, cfg.blueCount, cfg.blueCount, b);
      if (judgePrize(cfg, r, b) > 0) p += pr * pb;
    }
  }
  return p;
}

/** 单注「红区至少命中 min 个」的理论概率 */
export function singleRedGeProb(cfg: GameConfig, min: number): number {
  let p = 0;
  for (let r = min; r <= cfg.redCount; r++) {
    p += hypergeometric(cfg.redMax, cfg.redCount, cfg.redCount, r);
  }
  return p;
}

/** 单注「蓝区至少命中 1 个」的理论概率 */
export function singleBlueAnyProb(cfg: GameConfig): number {
  return 1 - hypergeometric(cfg.blueMax, cfg.blueCount, cfg.blueCount, 0);
}

/**
 * N 注独立随机时「至少一注发生」的概率。
 * 随机基准用解析值而非模拟，避免参考线本身带噪声。
 */
export function batchAtLeastOne(singleProb: number, tickets: number): number {
  return 1 - Math.pow(1 - singleProb, tickets);
}

/** 超几何分布的方差：从 pool 个号中开出 drawn 个，自己选的 pick 个号里的命中个数 */
function hypergeometricVar(pool: number, drawn: number, pick: number): number {
  return pick * (drawn / pool) * (1 - drawn / pool) * ((pool - pick) / (pool - 1));
}

/**
 * 单注命中个数（红区+蓝区）的理论方差，用于回测图上的噪声带：
 * 回测 B 期的平均命中标准误 = sqrt(方差 / B)，因此 ±1.96SE 就是「仅凭随机波动
 * 就能出现的差异范围」——各方案落在这条带内，就说明差异没有超出噪声。
 */
export function singleTicketHitVariance(cfg: GameConfig): number {
  return (
    hypergeometricVar(cfg.redMax, cfg.redCount, cfg.redCount) +
    hypergeometricVar(cfg.blueMax, cfg.blueCount, cfg.blueCount)
  );
}
