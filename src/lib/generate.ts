/**
 * 号码生成器：均匀随机机选 + 可选形态过滤
 */
import type { GameConfig } from "./games";
import { bigSmallRatio, maxConsecutive, oddEvenRatio } from "./stats";

export interface GenCombo {
  red: number[];
  blue: number[];
  sum: number;
  oddEven: string;
  bigSmall: string;
}

export interface GenOptions {
  /** 注数 1-10 */
  count: number;
  /** 奇偶比：any / balanced / odd（偏奇）/ even（偏偶） */
  oddEven: "any" | "balanced" | "odd" | "even";
  /** 大小比：any / balanced / big / small */
  bigSmall: "any" | "balanced" | "big" | "small";
  /** 和值范围（红区号码之和） */
  sumMin: number;
  sumMax: number;
  /** 最大连号数，99 = 不限 */
  maxConsec: number;
  /** 排除历史上已开出过的完全相同组合 */
  excludeHistory: boolean;
}

export const DEFAULT_GEN_OPTIONS: Omit<GenOptions, "count"> = {
  oddEven: "any",
  bigSmall: "any",
  sumMin: 0,
  sumMax: 999,
  maxConsec: 99,
  excludeHistory: true,
};

function okRatio([a, b]: [number, number], mode: string): boolean {
  switch (mode) {
    case "balanced":
      return Math.abs(a - b) <= 1;
    case "odd":
    case "big":
      return a > b;
    case "even":
    case "small":
      return a < b;
    default:
      return true;
  }
}

function sample(count: number, max: number): number[] {
  const pool = Array.from({ length: max }, (_, i) => i + 1);
  // 部分洗牌取前 count 个
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(Math.random() * (max - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}

function tryOne(cfg: GameConfig, opts: GenOptions, historyKeys: Set<string>): GenCombo | null {
  const red = sample(cfg.redCount, cfg.redMax);
  const blue = sample(cfg.blueCount, cfg.blueMax);

  const sum = red.reduce((a, b) => a + b, 0);
  if (sum < opts.sumMin || sum > opts.sumMax) return null;

  const oe = oddEvenRatio(red);
  if (!okRatio(oe, opts.oddEven)) return null;

  const bs = bigSmallRatio(red, cfg.redMax);
  if (!okRatio(bs, opts.bigSmall)) return null;

  if (opts.maxConsec < 99 && maxConsecutive(red) > opts.maxConsec) return null;

  if (opts.excludeHistory && historyKeys.has(red.join(",") + "|" + blue.join(","))) return null;

  const [odd] = oe;
  const [big, small] = bs;
  return {
    red,
    blue,
    sum,
    oddEven: `${odd}:${red.length - odd}`,
    bigSmall: `${big}:${small}`,
  };
}

export interface GenOutcome {
  combos: GenCombo[];
  /** 因条件过紧未能凑满时为 true */
  relaxed: boolean;
}

/** 生成 N 注，每注最多尝试 600 次；条件过紧时返回实际能生成的注数 */
export function generateCombos(
  cfg: GameConfig,
  opts: GenOptions,
  historyKeys: Set<string>
): GenOutcome {
  const combos: GenCombo[] = [];
  const seen = new Set<string>();
  let relaxed = false;

  for (let i = 0; i < opts.count; i++) {
    let got: GenCombo | null = null;
    for (let t = 0; t < 600; t++) {
      const c = tryOne(cfg, opts, historyKeys);
      if (!c) continue;
      const key = c.red.join(",") + "|" + c.blue.join(",");
      if (seen.has(key)) continue;
      got = c;
      break;
    }
    if (got) {
      seen.add(got.red.join(",") + "|" + got.blue.join(","));
      combos.push(got);
    } else {
      relaxed = true;
      break;
    }
  }
  return { combos, relaxed };
}
