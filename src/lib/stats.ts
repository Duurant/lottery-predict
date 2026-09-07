import type { Draw } from "./games";

export type Zone = "red" | "blue";

/** 取某区号码 */
export function zoneNums(d: Draw, zone: Zone): number[] {
  return zone === "red" ? d.red : d.blue;
}

/** 每个号码在 draws 中出现的次数（索引 1..max） */
export function freqCounts(draws: Draw[], zone: Zone, max: number): number[] {
  const counts = new Array<number>(max + 1).fill(0);
  for (const d of draws) {
    for (const n of zoneNums(d, zone)) counts[n]++;
  }
  return counts;
}

export interface NumberInfo {
  num: number;
  count: number; // 出现次数
  /** 当前遗漏：最近一次开奖距今多少期（从未出现 = 考察期长度） */
  omission: number;
  /** 历史最大遗漏（考察期内） */
  maxOmission: number;
  /** 平均间隔（出现次数>1 时为平均间隔，否则为 -1） */
  avgGap: number;
  /** 理论平均间隔 = 号码池 / 每期开出个数 */
  theoreticalGap: number;
  /** 最近一次开出的期号（从未出现为 null） */
  lastCode: string | null;
}

/** 每个号码的频率 + 遗漏画像（draws 须按日期升序，oldest → newest） */
export function numberInfos(
  draws: Draw[],
  zone: Zone,
  max: number,
  pick: number
): NumberInfo[] {
  const total = draws.length;
  const out: NumberInfo[] = [];
  for (let n = 1; n <= max; n++) {
    const hits: number[] = [];
    for (let i = 0; i < total; i++) {
      if (zoneNums(draws[i], zone).includes(n)) hits.push(i);
    }
    let maxOmission = hits.length ? hits[0] : total; // 首次出现前的空窗
    for (let k = 1; k < hits.length; k++) {
      maxOmission = Math.max(maxOmission, hits[k] - hits[k - 1] - 1);
    }
    if (hits.length) maxOmission = Math.max(maxOmission, total - 1 - hits[hits.length - 1]);
    else maxOmission = Math.max(maxOmission, total);

    const gaps: number[] = [];
    for (let k = 1; k < hits.length; k++) gaps.push(hits[k] - hits[k - 1]);
    const avgGap = gaps.length
      ? gaps.reduce((a, b) => a + b, 0) / gaps.length
      : -1;

    out.push({
      num: n,
      count: hits.length,
      omission: hits.length ? total - 1 - hits[hits.length - 1] : total,
      maxOmission,
      avgGap,
      theoreticalGap: pick > 0 ? max / pick : max,
      lastCode: hits.length ? draws[hits[hits.length - 1]].code : null,
    });
  }
  return out;
}

export interface ZoneContext {
  max: number;
  pick: number;
  /** 近 window 期每号出现次数（索引 1..max） */
  recentFreq: number[];
  /** 当前遗漏（索引 1..max，基于 draws 全量） */
  omission: number[];
  /** 历史平均间隔（索引 1..max，-1 表示未出现） */
  avgGap: number[];
  /** 理论平均间隔 */
  theoreticalGap: number;
  window: number;
}

/**
 * 为策略引擎构建某区的号码画像。
 * recent 从 draws 尾部取 window 期；omission 基于 draws 全量。
 */
export function buildZoneContext(
  draws: Draw[],
  zone: Zone,
  max: number,
  pick: number,
  window = 30
): ZoneContext {
  const recentDraws = draws.slice(-window);
  const infos = numberInfos(draws, zone, max, pick);
  return {
    max,
    pick,
    recentFreq: freqCounts(recentDraws, zone, max),
    omission: infos.map((i) => i.omission),
    avgGap: infos.map((i) => i.avgGap),
    theoreticalGap: max / pick,
    window,
  };
}

/* ---------------- 形态统计 ---------------- */

/** 和值（红区号码之和） */
export function sumOf(d: Draw): number {
  return d.red.reduce((a, b) => a + b, 0);
}

/** 奇偶比，返回 [奇, 偶] */
export function oddEvenRatio(nums: number[]): [number, number] {
  let odd = 0;
  for (const n of nums) if (n % 2 === 1) odd++;
  return [odd, nums.length - odd];
}

/** 大小比（> max/2 为大），返回 [大, 小] */
export function bigSmallRatio(nums: number[], max: number): [number, number] {
  let big = 0;
  for (const n of nums) if (n > max / 2) big++;
  return [big, nums.length - big];
}

/** 最大连号个数 */
export function maxConsecutive(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  let best = 1;
  let run = 1;
  for (let i = 1; i < s.length; i++) {
    if (s[i] === s[i - 1] + 1) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  return best;
}

/** 跨度（红区最大号 - 最小号） */
export function spanOf(nums: number[]): number {
  return Math.max(...nums) - Math.min(...nums);
}

export function mean(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

export function stdDev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const m = mean(nums);
  return Math.sqrt(nums.reduce((a, b) => a + (b - m) ** 2, 0) / (nums.length - 1));
}

/** 可复现伪随机数生成器（mulberry32），用于回测与策略随机扰动 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
