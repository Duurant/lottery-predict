/**
 * 覆盖优化选号核心（方案 id: cover）
 *
 * 本模块解决的**不是**「选哪些号码」，而是「同一批多注之间怎么分配号码」。
 *
 * 原理：开奖为均匀随机时，单注命中期望 = (每注号码数 / 号码池) × 每注号码数，
 * 与选号方式无关——任何热号/冷号/遗漏权重都改变不了它。但同价位 N 注的
 * 「至少中得某奖级」概率取决于各注两两重叠程度：
 *
 *   P(∪Aᵢ) = ΣP(Aᵢ) − ΣP(Aᵢ∩Aⱼ) + …
 *
 * 每注的 P(Aᵢ) 固定，因此重叠越少 → P(Aᵢ∩Aⱼ) 越小 → 并集概率越大。
 * 这就是本方案的全部收益来源：红区尽量铺开（低重叠）、蓝区尽量不重号。
 *
 * 边界：它不提高单注命中期望，也不提高任何单注的中奖概率；收益只在
 * 「同样的钱覆盖更多不同号码」这一层出现，且需要 N ≥ 2 注。
 *
 * 实现说明：本文件除 `import type`（编译期擦除）外不引入任何运行时依赖，
 * 因此 `scripts/fit-coverage.mjs` 可用 `node` 的类型擦除直接 import 同一份
 * 算法做拟合，保证「页面用的」与「拟合用的」是同一套代码（无公式漂移）。
 */
import type { Draw, GameKey } from "./games";

export type CoverZone = "red" | "blue";

/** 单区选号参数（红区、蓝区各自独立，分别拟合） */
export interface CoverParams {
  /** 近 window 期频率（热号）权重 */
  hotWeight: number;
  /** 遗漏回补权重 */
  dueWeight: number;
  /** 回看窗口（期） */
  window: number;
  /** 铺开强度：已被本批其他注占用的号码，权重除以 (1 + spread × 已用次数) */
  spread: number;
}

export interface CoverParamsByZone {
  red: CoverParams;
  blue: CoverParams;
}

/**
 * 强铺开：只要本批还有没用过的号码，就不会再去用已用过的号码。
 * 实现上它让「已用过的号」的抽样键下溢到 0（未用过的号键 = rand ∈ [0,1)），
 * 因此这是一个语义明确的开关，而不是一个需要精调的量。
 */
export const MAX_SPREAD = 1e6;

/**
 * 各彩种红/蓝区的默认参数。
 *
 * 来源：`npm run fit`（scripts/fit-coverage.mjs）在全部历史（大乐透 2923 期、
 * 双色球 2065 期）上做 walk-forward，参数只在前 70% 训练段选择、后 30% 验证段检验。
 *
 * 拟合结论（两个彩种一致，均为红蓝各自独立拟合）：
 *   - 热号/冷号/遗漏比例（hotWeight、dueWeight）**无实际作用**：训练段最好的组合
 *     最好成绩也只比「无权重」高 0.15~0.68pp；其中唯一通过 Bonferroni 校正的一组
 *     （大乐透蓝区 hot，p=0.009）在验证段完全复现不出来（差 0.00pp，p=1.000），
 *     因此判定为噪声，统一取无权重 none。这与「开奖为独立随机事件」一致。
 *   - 铺开强度（spread）是唯一真实有效的参数，且覆盖率随铺开单调上升
 *     （例如双色球红区「至少命中 2 个」：不铺开 85.00% → 最大铺开 95.18%，验证段），
 *     故直接取最大铺开 MAX_SPREAD。
 * 权重为 0 时 window 不参与计算，此处保留页面回看窗口值仅作占位。
 */
export const COVERAGE_PARAMS: Record<GameKey, CoverParamsByZone> = {
  dlt: {
    red: { hotWeight: 0, dueWeight: 0, window: 30, spread: MAX_SPREAD },
    blue: { hotWeight: 0, dueWeight: 0, window: 30, spread: MAX_SPREAD },
  },
  ssq: {
    red: { hotWeight: 0, dueWeight: 0, window: 30, spread: MAX_SPREAD },
    blue: { hotWeight: 0, dueWeight: 0, window: 30, spread: MAX_SPREAD },
  },
};

/** 纯随机对照参数：权重全 0 + 不铺开 → 每注独立均匀随机（＝纯机选） */
export const RANDOM_PARAMS: CoverParams = {
  hotWeight: 0,
  dueWeight: 0,
  window: 30,
  spread: 0,
};

/**
 * FNV-1a 哈希 → 32 位种子。用于「同一期、同一方案、同一注序」得到可复现的随机流，
 * 这样拟合脚本里不同参数配置之间以及 cover / 机选之间是配对的（共同随机数），
 * 差值估计的方差更小，但不会引入偏差。
 */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 2166136261;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface ZoneProfile {
  max: number;
  /** 每注在该区选的号码个数 */
  pick: number;
  /** 每个号码出现的期索引（升序），索引 1..max */
  hits: number[][];
  total: number;
}

/** 预计算某区每个号码的出现期索引，供后续 O(log n) 查询 */
export function buildProfile(draws: Draw[], zone: CoverZone, max: number): ZoneProfile {
  const hits: number[][] = Array.from({ length: max + 1 }, () => []);
  for (let i = 0; i < draws.length; i++) {
    const nums = zone === "red" ? draws[i].red : draws[i].blue;
    for (const n of nums) if (n >= 1 && n <= max) hits[n].push(i);
  }
  const pick = (zone === "red" ? draws[0]?.red.length : draws[0]?.blue.length) ?? 0;
  return { max, pick, hits, total: draws.length };
}

/** 严格小于 i 的最后一个命中位置（二分） */
function lastHitBefore(hits: number[], i: number): number {
  let lo = 0;
  let hi = hits.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (hits[mid] < i) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** 第一个 ≥ i 的命中位置（二分） */
function firstHitFrom(hits: number[], i: number): number {
  let lo = 0;
  let hi = hits.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (hits[mid] < i) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** 截止索引 i（不含 i）时每号的遗漏期数 */
export function omissionAt(z: ZoneProfile, i: number): number[] {
  const out = new Array<number>(z.max + 1);
  for (let n = 1; n <= z.max; n++) {
    const k = lastHitBefore(z.hits[n], i);
    out[n] = k >= 0 ? i - 1 - z.hits[n][k] : i;
  }
  return out;
}

/** 截止索引 i（不含 i）时近 window 期每号出现次数 */
export function recentFreqAt(z: ZoneProfile, i: number, window: number): number[] {
  const out = new Array<number>(z.max + 1).fill(0);
  const from = Math.max(0, i - window);
  for (let n = 1; n <= z.max; n++) {
    const hs = z.hits[n];
    out[n] = firstHitFrom(hs, i) - firstHitFrom(hs, from);
  }
  return out;
}

/**
 * 按参数给某区所有号码打分：热号占比 + 遗漏回补占比，各自归一化到 [0,1]。
 * 与页面「冷热结合」同源（0.6 热 / 0.4 回补），便于用户理解选号偏好。
 */
export function zoneScore(z: ZoneProfile, i: number, params: CoverParams): number[] {
  const recent = recentFreqAt(z, i, Math.max(1, params.window));
  const omission = omissionAt(z, i);
  const theoretical = z.max / z.pick;
  let maxRecent = 1;
  for (let n = 1; n <= z.max; n++) if (recent[n] > maxRecent) maxRecent = recent[n];

  const out = new Array<number>(z.max + 1).fill(0);
  for (let n = 1; n <= z.max; n++) {
    const hot = recent[n] / maxRecent;
    const due = Math.min(omission[n] / theoretical, 2) / 2;
    out[n] = params.hotWeight * hot + params.dueWeight * due;
  }
  return out;
}

/**
 * 选一注：Efraimidis–Spirakis 加权不放回抽样（key = rand^(1/w) 取前 k 个）。
 *
 * 权重 w = (1 + 评分) / (1 + spread × 本批已用次数)：
 *  - spread = 0 且权重为 0 时 w ≡ 1 → key = rand() → 严格等价于均匀随机选号（纯机选）
 *  - spread 越大，本批已被其他注用过的号码越难再被选中 → 各注趋于互不重叠
 *
 * 权重与铺开是两件事：权重决定「同一次里谁更可能被选中」，铺开决定
 * 「跨注之间怎么分配」，覆盖度收益来自后者。
 */
export function pickCoverTicket(
  z: ZoneProfile,
  i: number,
  params: CoverParams,
  used: number[],
  rand: () => number
): number[] {
  const score = zoneScore(z, i, params);
  const cands: { num: number; key: number }[] = [];
  for (let n = 1; n <= z.max; n++) {
    const w = (1 + score[n]) / (1 + params.spread * used[n]);
    const r = Math.max(rand(), 1e-12);
    // 主项 = Efraimidis–Spirakis 加权抽样键；spread 很大时该项对「已用过的号」会下溢为 0，
    // 此时按定义它们的键应当小于任何未用过的号（未用过的键 = r ∈ [0,1)）——正是「尽量不重号」。
    // 再加一个 r 量级的极小项，只为在「全批号码都已用完、只能重复」时打破 0 与 0 的并列，
    // 让被迫重复也用随机号，而不是退化成固定挑最小的几个号（那会造成多注完全相同、白白浪费覆盖）。
    cands.push({ num: n, key: Math.pow(r, 1 / w) + r * 1e-9 });
  }
  cands.sort((a, b) => b.key - a.key);
  return cands
    .slice(0, z.pick)
    .map((c) => c.num)
    .sort((a, b) => a - b);
}

/**
 * 选一整批（N 注）：逐注调用 pickCoverTicket，并累计「本批已用次数」。
 * 传入 RANDOM_PARAMS 时输出即为 N 注独立均匀随机（机选基准），
 * 传入 COVERAGE_PARAMS 时为低重叠铺开。两条路径共用同一段代码。
 */
export function buildCoverSet(
  z: ZoneProfile,
  i: number,
  params: CoverParams,
  tickets: number,
  rand: () => number
): number[][] {
  const used = new Array<number>(z.max + 1).fill(0);
  const out: number[][] = [];
  for (let t = 0; t < tickets; t++) {
    const nums = pickCoverTicket(z, i, params, used, rand);
    for (const n of nums) used[n]++;
    out.push(nums);
  }
  return out;
}

/** 一批号码用了多少个不同的号（用于展示铺开程度） */
export function distinctCount(set: number[][]): number {
  const s = new Set<number>();
  for (const t of set) for (const n of t) s.add(n);
  return s.size;
}
