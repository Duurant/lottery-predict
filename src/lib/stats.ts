import type { Draw } from "./games";

export type Zone = "red" | "blue";

/** 组合形态：连号按相邻号码对计数，三连号计为两对。 */
export function ticketShape(nums: number[]) {
  const sorted = [...nums].sort((a, b) => a - b);
  return {
    sum: nums.reduce((a, b) => a + b, 0),
    odd: nums.filter((n) => n % 2 === 1).length,
    consecutive: sorted.slice(1).filter((n, i) => n === sorted[i] + 1).length,
  };
}

/** 只读取开奖前的数据；三个形态等权平滑，分数仅表示历史形态相似度。 */
export function shapeScorer(draws: Draw[], before: number, window = 100): (nums: number[]) => number {
  const history = draws.slice(Math.max(0, before - window), before).map((d) => ticketShape(d.red));
  const count = (key: "odd" | "consecutive" | "sum", value: number) =>
    history.filter((s) => key === "sum" ? Math.abs(s.sum - value) <= 10 : s[key] === value).length;
  return (nums) => {
    const s = ticketShape(nums);
    return (count("odd", s.odd) + count("consecutive", s.consecutive) + count("sum", s.sum) + 3) / (3 * (history.length + 1));
  };
}

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
  // 单遍扫描：每期只看该期开出的号码（每期 pick 个），
  // 而不是对每个号码把全部期数 includes 一遍（旧实现是 max × total × pick 次比较）
  const count = new Array<number>(max + 1).fill(0);
  const firstIdx = new Array<number>(max + 1).fill(-1);
  const lastIdx = new Array<number>(max + 1).fill(-1);
  const gapSum = new Float64Array(max + 1);
  const gapMax = new Array<number>(max + 1).fill(0); // 两次开出之间的最大空窗

  for (let i = 0; i < total; i++) {
    // 用 Set 兜住「单期出现重复号码」的畸形数据：与旧实现 includes 的语义一致（一期只计一次）
    const hit = new Set(zoneNums(draws[i], zone));
    for (const n of hit) {
      if (n < 1 || n > max) continue;
      if (count[n] > 0) {
        const gap = i - lastIdx[n]; // 相邻两次开出的间隔（期数差）
        gapSum[n] += gap;
        if (gap - 1 > gapMax[n]) gapMax[n] = gap - 1;
      } else {
        firstIdx[n] = i; // 首次出现前的空窗长度 = i
      }
      count[n]++;
      lastIdx[n] = i;
    }
  }

  const out: NumberInfo[] = [];
  for (let n = 1; n <= max; n++) {
    if (count[n] === 0) {
      out.push({
        num: n,
        count: 0,
        omission: total,
        maxOmission: total,
        avgGap: -1,
        theoreticalGap: pick > 0 ? max / pick : max,
        lastCode: null,
      });
      continue;
    }
    const trailing = total - 1 - lastIdx[n]; // 最后一次开出后的空窗
    out.push({
      num: n,
      count: count[n],
      omission: trailing,
      maxOmission: Math.max(gapMax[n], firstIdx[n], trailing),
      avgGap: count[n] > 1 ? gapSum[n] / (count[n] - 1) : -1,
      theoreticalGap: pick > 0 ? max / pick : max,
      lastCode: draws[lastIdx[n]].code,
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

/** 中位数（偶数个时取中间两个的平均） */
export function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function stdDev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const m = mean(nums);
  return Math.sqrt(nums.reduce((a, b) => a + (b - m) ** 2, 0) / (nums.length - 1));
}

/* ---------------- 形态分布（统计面板用，全部尊重传入的期数范围） ---------------- */

export interface Dist { label: string; count: number }

/**
 * 大小比分布：大号（> max/2）个数 → 期数，按大号个数升序。
 * 与奇偶比分布（在面板内联计算）成对，避免「奇偶有分布、大小没有」的不对称。
 */
export function bigSmallDist(draws: Draw[], max: number): Dist[] {
  const pick = drawnCount(draws);
  const map = new Map<number, number>();
  for (const d of draws) {
    const [big] = bigSmallRatio(d.red, max);
    map.set(big, (map.get(big) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([big, count]) => ({ label: `${big}:${pick - big}`, count }));
}

// 每期红区号码个数（各期一致，取首期即可）
function drawnCount(draws: Draw[]): number {
  return draws.length ? draws[0].red.length : 0;
}

/** 号码分区（默认三等分，尾段收余数）：大乐透 1-12/13-24/25-35、双色球 1-11/12-22/23-33 */
export interface ZonePart {
  from: number;
  to: number;
  /** 该区号码在所选期数范围内出现的总次数 */
  count: number;
  /** 理论期望次数 = 期数 × 每期取号数 × 该区号码占比 */
  expected: number;
  /** 实际占比（用于与理论对照展示） */
  rate: number;
}

export function zoneParts(draws: Draw[], max: number, parts: number): ZonePart[] {
  const size = Math.ceil(max / parts);
  const pick = drawnCount(draws);
  const out: ZonePart[] = [];
  for (let i = 0; i < parts; i++) {
    const from = i * size + 1;
    const to = Math.min((i + 1) * size, max);
    if (from > max) break;
    let count = 0;
    for (const d of draws) for (const n of d.red) if (n >= from && n <= to) count++;
    const span = to - from + 1;
    out.push({
      from,
      to,
      count,
      expected: draws.length * pick * (span / max),
      rate: count / Math.max(draws.length * pick, 1),
    });
  }
  return out;
}

/** 和值直方图（按 binWidth 分箱；返回非空箱） */
export function sumHistogram(draws: Draw[], binWidth = 10): { from: number; to: number; count: number }[] {
  if (!draws.length) return [];
  const sums = draws.map((d) => sumOf(d));
  const lo = Math.min(...sums);
  const hi = Math.max(...sums);
  const start = Math.floor(lo / binWidth) * binWidth;
  const bins: { from: number; to: number; count: number }[] = [];
  for (let b = start; b <= hi; b += binWidth) {
    bins.push({ from: b, to: b + binWidth - 1, count: 0 });
  }
  for (const s of sums) {
    const idx = Math.min(Math.floor((s - start) / binWidth), bins.length - 1);
    if (idx >= 0) bins[idx].count++;
  }
  return bins.filter((b) => b.count > 0);
}

/** 跨度分布（前区最大号 − 最小号 → 期数） */
export function spanDist(draws: Draw[]): { span: number; count: number }[] {
  const map = new Map<number, number>();
  for (const d of draws) {
    const s = spanOf(d.red);
    map.set(s, (map.get(s) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([span, count]) => ({ span, count }));
}

/** 一期红区里的连号组数（连续且相邻的号码为一组，长度 ≥2 才算） */
export function consecutiveGroups(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  let groups = 0;
  let run = 1;
  for (let i = 1; i < s.length; i++) {
    if (s[i] === s[i - 1] + 1) run++;
    else {
      if (run >= 2) groups++;
      run = 1;
    }
  }
  if (run >= 2) groups++;
  return groups;
}

export interface ConsecStats {
  /** 含至少一组连号的期数占比 */
  withConsecRate: number;
  /** 连号组数分布（0 / 1 / 2 及以上） */
  dist: Dist[];
  /** 平均每期连号组数 */
  meanGroups: number;
}

export function consecStats(draws: Draw[]): ConsecStats {
  if (!draws.length) return { withConsecRate: 0, dist: [], meanGroups: 0 };
  let withConsec = 0;
  let total = 0;
  const map = new Map<number, number>();
  for (const d of draws) {
    const g = consecutiveGroups(d.red);
    total += g;
    if (g > 0) withConsec++;
    const key = Math.min(g, 2); // 2 表示「2 组及以上」
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  const dist: Dist[] = [0, 1, 2].map((k) => ({
    label: k === 2 ? "2 组及以上" : `${k} 组`,
    count: map.get(k) ?? 0,
  }));
  return { withConsecRate: withConsec / draws.length, dist, meanGroups: total / draws.length };
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
