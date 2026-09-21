/**
 * 数据传输紧凑编码（服务端编码 → RSC payload → 客户端解码）。
 *
 * 背景：把全量 Draw[]/DigitDraw[] 直接作为 props 传给客户端组件时，RSC 会把
 * 每期的完整 JSON（含 "code"/"date"/"red"/"blue" 键名与数组括号）序列化进
 * 页面 payload（排列五约 450KB）。这里改为传定宽字符串：去掉重复键名与
 * 括号，传输量减半以上；客户端在 useMemo 里解码一次，子组件拿到的仍是
 * 普通对象数组、接口不变。
 *
 * 约定与前提（改动前必读）：
 *  - 空格作期与期的分隔符（期号/日期/补零号码串都不含空格，安全）；
 *  - 组合型号码必须为 1..99（两位补零定宽）——现有两个彩种 redMax 35 / blueMax 16 满足；
 *  - 数字型每位必须为 0-9 单字符——排列五 digitMax 9 满足；数字的位置语义
 *    由解码逻辑原样保留（一位一字符按位还原，不经过任何排序/去重）；
 *  - 本模块被客户端组件引用，只允许 `import type`（与 games.ts/data.ts 的
 *    拆分同理），否则 Node 直引与客户端打包都会出问题。
 */
import type { Draw } from "./games";
import type { DigitDraw } from "./digit";

/* ---------------- 组合型（大乐透 / 双色球） ---------------- */

export interface CompactDraws {
  /** 期数 */
  n: number;
  /** 每期红区个数（大乐透 5 / 双色球 6） */
  redCount: number;
  /** 每期蓝区个数（大乐透 2 / 双色球 1） */
  blueCount: number;
  /** 期号，空格分隔 */
  codes: string;
  /** 日期 yyyy-MM-dd，空格分隔 */
  dates: string;
  /** 每期 redCount 个号码两位补零连写，期与期空格分隔 */
  reds: string;
  /** 每期 blueCount 个号码两位补零连写，期与期空格分隔 */
  blues: string;
}

export function encodeDraws(draws: Draw[], redCount: number, blueCount: number): CompactDraws {
  const pack = (nums: number[]) => nums.map((n) => String(n).padStart(2, "0")).join("");
  return {
    n: draws.length,
    redCount,
    blueCount,
    codes: draws.map((d) => d.code).join(" "),
    dates: draws.map((d) => d.date).join(" "),
    reds: draws.map((d) => pack(d.red)).join(" "),
    blues: draws.map((d) => pack(d.blue)).join(" "),
  };
}

export function decodeDraws(c: CompactDraws): Draw[] {
  if (c.n === 0) return [];
  const codes = c.codes.split(" ");
  const dates = c.dates.split(" ");
  const reds = c.reds.split(" ");
  const blues = c.blues.split(" ");
  const out: Draw[] = [];
  for (let i = 0; i < c.n; i++) {
    const rs = reds[i] ?? "";
    const bs = blues[i] ?? "";
    const red = new Array<number>(c.redCount);
    for (let k = 0; k < c.redCount; k++) red[k] = Number(rs.slice(k * 2, k * 2 + 2));
    const blue = new Array<number>(c.blueCount);
    for (let k = 0; k < c.blueCount; k++) blue[k] = Number(bs.slice(k * 2, k * 2 + 2));
    out.push({ code: codes[i] ?? "", date: dates[i] ?? "", red, blue });
  }
  return out;
}

/* ---------------- 数字型（排列五） ---------------- */

export interface CompactDigits {
  /** 期数 */
  n: number;
  /** 位数（排列五为 5） */
  positions: number;
  /** 期号，空格分隔 */
  codes: string;
  /** 日期 yyyy-MM-dd，空格分隔 */
  dates: string;
  /** 每期 positions 位数字逐位连写，期与期之间无分隔（定宽切片） */
  digits: string;
}

export function encodeDigits(draws: DigitDraw[], positions: number): CompactDigits {
  return {
    n: draws.length,
    positions,
    codes: draws.map((d) => d.code).join(" "),
    dates: draws.map((d) => d.date).join(" "),
    digits: draws.map((d) => d.digits.join("")).join(""),
  };
}

export function decodeDigits(c: CompactDigits): DigitDraw[] {
  if (c.n === 0) return [];
  const codes = c.codes.split(" ");
  const dates = c.dates.split(" ");
  const out: DigitDraw[] = [];
  for (let i = 0; i < c.n; i++) {
    const digits = new Array<number>(c.positions);
    for (let p = 0; p < c.positions; p++) {
      // 一位一字符按位还原；charCode 直转比 Number(slice) 快且不会吞前导 0
      digits[p] = c.digits.charCodeAt(i * c.positions + p) - 48;
    }
    out.push({ code: codes[i] ?? "", date: dates[i] ?? "", digits });
  }
  return out;
}
