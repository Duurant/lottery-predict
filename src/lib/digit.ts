/**
 * 数字型玩法模块（排列五）
 *
 * 与组合型（大乐透/双色球的红区+蓝区、号码互不重复、升序）是**两套不同的模型**：
 * 排列五是 5 个**有序**数字位、每位 0–9、**允许重复**、**允许前导 0**，且只有一个奖级。
 * 因此这里的实现是并列的一套，而不是复用 Draw/GameConfig——后者若被改成联合类型，
 * 会让每个读 red/blue 的既有组件都要加类型收窄，风险远大于收益。
 *
 * 三个容易踩的坑（本文件已处理，改动时请保持）：
 *  1. 数字 0 是合法取值：不能用「1..max」这类循环或 `n >= 1` 的过滤；
 *  2. 数字可重复：不能用 Set 去重后比较长度的方式做合法性校验；
 *  3. 位置有意义：任何 sort 都会毁掉开奖信息，禁止对 digits 排序。
 */
export type DigitGameKey = "p5";

export interface DigitDraw {
  /** 期号，如 26248 */
  code: string;
  /** 开奖日期 yyyy-MM-dd */
  date: string;
  /** 5 位开奖数字（有序，可重复、可含 0） */
  digits: number[];
}

export interface DigitGameConfig {
  key: DigitGameKey;
  name: string;
  /** 位数 */
  positions: number;
  /** 每位最大数字（0..digitMax） */
  digitMax: number;
  /** 开奖星期（0=周日 … 6=周六）：排列五每日开奖 */
  drawDays: number[];
  /** 开奖时刻 HH:mm */
  drawTime: string;
  /** 页面主题色 */
  accent: string;
  /** 各位名称（从第 1 位到第 5 位） */
  positionNames: string[];
  historyNote?: string;
}

export const P5_CONFIG: DigitGameConfig = {
  key: "p5",
  name: "排列五",
  positions: 5,
  digitMax: 9,
  drawDays: [0, 1, 2, 3, 4, 5, 6], // 每日开奖
  drawTime: "20:30",
  accent: "#8b5cf6",
  positionNames: ["第1位", "第2位", "第3位", "第4位", "第5位"],
};

export const DIGIT_GAME_KEYS: DigitGameKey[] = ["p5"];

/* ---------------- 奖级 ---------------- */

/**
 * 排列五只有一个奖级：5 位全部按位相同（直选）。
 * 单注概率 = 1/10^5 = 1/100000，与买哪一注无关——这一点决定了任何「选号方案」
 * 都无法提高命中概率，页面必须如实说明（唯一可做的是避免多注之间重复）。
 */
export function judgeDigitPrize(cfg: DigitGameConfig, ticket: number[], drawn: number[]): boolean {
  for (let i = 0; i < cfg.positions; i++) if (ticket[i] !== drawn[i]) return false;
  return true;
}

/** 单注中奖概率（解析值）：1 / (digitMax+1)^positions */
export function singleDigitPrizeProb(cfg: DigitGameConfig): number {
  return 1 / Math.pow(cfg.digitMax + 1, cfg.positions);
}

/**
 * N 注**互不重复**时的至少中一注概率：N / 10^5（精确）。
 * 机选 N 注允许重复，概率略低：1 − (1 − p)^N —— 两者之差就是「去重」的全部收益。
 */
export function distinctBatchProb(cfg: DigitGameConfig, tickets: number): number {
  return Math.min(tickets, Math.pow(cfg.digitMax + 1, cfg.positions)) / Math.pow(cfg.digitMax + 1, cfg.positions);
}

export function randomBatchProb(cfg: DigitGameConfig, tickets: number): number {
  return 1 - Math.pow(1 - singleDigitPrizeProb(cfg), tickets);
}

/* ---------------- 形态统计 ---------------- */

export const digitSum = (d: DigitDraw): number => d.digits.reduce((a, b) => a + b, 0);
export const digitSpan = (d: DigitDraw): number => Math.max(...d.digits) - Math.min(...d.digits);
export const oddCount = (d: DigitDraw): number => d.digits.filter((n) => n % 2 === 1).length;
/** 重复数字个数（5 − 不同数字个数）：如 12622 有 2 个重复位 */
export const repeatCount = (d: DigitDraw): number => d.digits.length - new Set(d.digits).size;
export const distinctDigits = (d: DigitDraw): number => new Set(d.digits).size;

/** 展示用文本：12622（保留前导 0） */
export const digitText = (digits: number[]): string => digits.join("");

/** 每一位的出现次数（索引 0..digitMax） */
export function positionFreq(draws: DigitDraw[], position: number, digitMax: number): number[] {
  const counts = new Array<number>(digitMax + 1).fill(0);
  for (const d of draws) {
    const n = d.digits[position];
    if (Number.isInteger(n) && n >= 0 && n <= digitMax) counts[n]++;
  }
  return counts;
}

/** 某位上每个数字的当前遗漏（自上次在该位出现以来过了多少期；从未出现 = 考察期长度） */
export function positionOmission(draws: DigitDraw[], position: number, digitMax: number): number[] {
  const out = new Array<number>(digitMax + 1).fill(draws.length);
  for (let n = 0; n <= digitMax; n++) {
    for (let i = draws.length - 1; i >= 0; i--) {
      if (draws[i].digits[position] === n) {
        out[n] = draws.length - 1 - i;
        break;
      }
    }
  }
  return out;
}

/** 历史最大遗漏（某位某数字在考察期内最长多久没出现） */
export function positionMaxOmission(draws: DigitDraw[], position: number, digitMax: number): number[] {
  const out = new Array<number>(digitMax + 1).fill(0);
  const gap = new Array<number>(digitMax + 1).fill(0);
  for (const d of draws) {
    for (let n = 0; n <= digitMax; n++) {
      if (d.digits[position] === n) {
        if (gap[n] > out[n]) out[n] = gap[n];
        gap[n] = 0;
      } else gap[n]++;
    }
  }
  for (let n = 0; n <= digitMax; n++) if (gap[n] > out[n]) out[n] = gap[n];
  return out;
}

/** 和值分布（0..positions*digitMax → 期数） */
export function sumDistribution(draws: DigitDraw[], cfg: DigitGameConfig): { sum: number; count: number }[] {
  const counts = new Array<number>(cfg.positions * cfg.digitMax + 1).fill(0);
  for (const d of draws) counts[digitSum(d)]++;
  return counts.map((count, sum) => ({ sum, count }));
}
