/**
 * 配对统计工具
 *
 * 用于「覆盖优化 vs 纯机选」的对比：两者在同一期、同一注序上使用共同随机数流，
 * 因此逐期差值可做配对检验，方差远小于两组独立样本的比较。
 *
 * 为什么必须配对：覆盖率差异本身不大（几个百分点），若按两组独立比例比较，
 * 置信区间会被样本噪声淹没；配对后只看「同一次开奖里两个方案谁命中」，
 * 才能把真实差异从噪声里分离出来。
 *
 * 实现说明：本文件无运行时依赖（仅类型导入），因此 `scripts/fit-coverage.mjs`
 * 可用 Node 类型擦除直接 import 同一份实现。
 */
import type { Draw } from "./games";

export function mean(a: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return a.length ? s / a.length : 0;
}

/** 标准正态分布 CDF（Abramowitz–Stegun 7.1.26 误差函数近似，精度约 1e-7） */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const q =
    d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - q : q;
}

export interface PairedDiff {
  /** 平均逐期差值（a − b） */
  diff: number;
  /** 配对标准误 */
  se: number;
  /** 95% 置信区间 */
  ci95: [number, number];
  z: number;
  /** 双侧 p 值（正态近似） */
  p: number;
  /** |z| > 1.96 */
  significant: boolean;
  /** 仅 a 命中的期数 */
  aOnly: number;
  /** 仅 b 命中的期数 */
  bOnly: number;
  /** 两者都命中的期数 */
  both: number;
  n: number;
}

/** 对同一批期的 0/1（或数值）指标做配对比较 */
export function pairedDiff(a: ArrayLike<number>, b: ArrayLike<number>): PairedDiff {
  const n = a.length;
  let s = 0;
  let s2 = 0;
  let aOnly = 0;
  let bOnly = 0;
  let both = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - b[i];
    s += x;
    s2 += x * x;
    if (a[i] && b[i]) both++;
    else if (a[i]) aOnly++;
    else if (b[i]) bOnly++;
  }
  const m = n ? s / n : 0;
  const v = n > 1 ? (s2 - n * m * m) / (n - 1) : 0;
  const se = n > 1 ? Math.sqrt(v / n) : 0;
  const z = se > 0 ? m / se : 0;
  return {
    diff: m,
    se,
    ci95: [m - 1.96 * se, m + 1.96 * se],
    z,
    p: 2 * (1 - normCdf(Math.abs(z))),
    significant: Math.abs(z) > 1.96,
    aOnly,
    bOnly,
    both,
    n,
  };
}

/** 比例的标准误（二项近似） */
export function rateSe(rate: number, n: number): number {
  return Math.sqrt(Math.max(rate * (1 - rate), 1e-12) / n);
}

/** 每期「一批号码里命中的个数」：红区命中 + 蓝区命中 */
export function hitsOf(draw: Draw, red: number[], blue: number[]): { red: number; blue: number; total: number } {
  let r = 0;
  for (const n of red) if (draw.red.includes(n)) r++;
  let b = 0;
  for (const n of blue) if (draw.blue.includes(n)) b++;
  return { red: r, blue: b, total: r + b };
}
