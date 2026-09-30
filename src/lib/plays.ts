import { GAMES, type GameKey } from "@/lib/games";
import type { LotteryKey, Ticket } from "@/lib/notebook";

export type PlayMode = "single" | "multiple" | "dantuo" | "mixed";
export interface PlayEntry { mode: Exclude<PlayMode, "single">; text: string }
export const PLAY_NAMES: Record<PlayMode, string> = { single: "单式", multiple: "复式", dantuo: "胆拖", mixed: "混合录入" };
export const MAX_PLAY_TICKETS = 1000;
export const MAX_PLAY_TEXT_LENGTH = 20000;

/** 先计算组合数再展开，避免大复式占用浏览器内存。 */
function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let value = 1;
  for (let i = 1; i <= k; i++) value = value * (n - i + 1) / i;
  return Math.round(value);
}
function combinations(nums: number[], count: number): number[][] {
  const result: number[][] = [];
  const walk = (start: number, picked: number[]) => {
    if (picked.length === count) { result.push(picked); return; }
    for (let i = start; i <= nums.length - (count - picked.length); i++) walk(i + 1, [...picked, nums[i]]);
  };
  walk(0, []);
  return result;
}

/** # 左侧为胆码，右侧为拖码；没有 # 的区按普通号码池处理。 */
export function parsePlay(game: LotteryKey, entry: PlayEntry): Ticket[] {
  if (entry.text.length > MAX_PLAY_TEXT_LENGTH) throw new Error("录入文本过长，请移除多余空格或分批保存（最多 20000 字符）。");
  const lines = entry.text.split(/\r?\n/).map((line, index) => ({ line: line.trim(), index })).filter(({ line }) => line);
  if (!lines.length) throw new Error("请先输入号码。");
  if (lines.length > 100) throw new Error("一次最多录入 100 行，请分批保存。");
  if (!["multiple", "dantuo", "mixed"].includes(entry.mode)) throw new Error("不支持的玩法。");
  if (game === "p5" && entry.mode === "dantuo") throw new Error("排列五支持按位复式，不使用红蓝球胆拖玩法。");
  const tickets: Ticket[] = [];
  for (const { index, line } of lines) {
    const mode = entry.mode === "mixed" ? detectPlayMode(game, line) : entry.mode;
    const fail = (message: string): never => { throw new Error(`第 ${index + 1} 行：${message}`); };
    const numbers = (raw: string, max: number, name: string, digits = false): number[] => {
      if (!(digits ? /^[\d\s,，、]+$/ : /^\s*\d{1,2}(?:[\s,，、]+\d{1,2})*\s*$/).test(raw)) return fail(`${name}号码格式不正确。`);
      const nums = digits ? [...raw.replace(/[\s,，、]/g, "")].map(Number) : raw.trim().split(/[\s,，、]+/).map(Number);
      if (nums.some((n) => n < (digits ? 0 : 1) || n > max)) return fail(`${name}范围应为 ${digits ? 0 : 1}–${max}。`);
      if (new Set(nums).size !== nums.length) return fail(`${name}内不能重复录入同一个号码。`);
      return nums.sort((a, b) => a - b);
    };
    const guard = (count: number) => {
      if (tickets.length + count > MAX_PLAY_TICKETS) fail(`展开后共 ${tickets.length + count} 注，超过本站每条记录 ${MAX_PLAY_TICKETS} 注的处理上限，请缩小号码池或分批录入。`);
    };
    if (game === "p5") {
      if (mode === "single") {
        if (!/^[\d\s,，、]+$/.test(line) || !/^\d{5}$/.test(line.replace(/[\s,，、]/g, ""))) fail("单式必须为 5 位数字，允许重复与前导 0。");
        guard(1); tickets.push({ game, digits: [...line.replace(/[\s,，、]/g, "")].map(Number) }); continue;
      }
      const groups = line.split(/[|｜]/);
      if (groups.length !== 5) fail("按位复式需要 5 个号码池，用 | 分隔，例如 05 | 1 | 9 | 0 | 48。");
      const pools = groups.map((g, p) => numbers(g, 9, `第 ${p + 1} 位`, true));
      const count = pools.reduce((n, pool) => n * pool.length, 1);
      if (count <= 1) fail("复式至少有一个位置选择两个数字；单注请切换单式。");
      guard(count);
      const walk = (p: number, digits: number[]) => {
        if (p === 5) { tickets.push({ game, digits }); return; }
        for (const n of pools[p]) walk(p + 1, [...digits, n]);
      };
      walk(0, []); continue;
    }
    const cfg = GAMES[game];
    const parts = line.split(/[+＋|｜]/);
    if (parts.length !== 2) fail(`用 + 分隔${cfg.redName}与${cfg.blueName}。`);
    const zone = (raw: string, count: number, max: number, name: string, canDan: boolean) => {
      const chunks = raw.split(/[#＃]/);
      if (chunks.length > 2) return fail(`${name}只允许一个 # 分隔胆码和拖码。`);
      if (chunks.length === 2 && (mode !== "dantuo" || !canDan)) return fail(`${name}不支持在此玩法中设置胆码。`);
      const dan = chunks.length === 2 ? numbers(chunks[0], max, `${name}胆码`) : [];
      const pool = numbers(chunks.at(-1)!, max, `${name}${dan.length ? "拖码" : "号码"}`);
      if (dan.some((n) => pool.includes(n))) return fail(`${name}胆码与拖码不能重叠。`);
      if (dan.length >= count) return fail(`${name}胆码最多 ${count - 1} 个。`);
      if (dan.length + pool.length < count + (dan.length ? 1 : 0)) return fail(`${name}${dan.length ? "胆码与拖码合计" : "号码"}至少 ${count + (dan.length ? 1 : 0)} 个。`);
      return { dan, pool, count: choose(pool.length, count - dan.length), pick: count - dan.length };
    };
    const red = zone(parts[0], cfg.redCount, cfg.redMax, cfg.redName, true);
    const blue = zone(parts[1], cfg.blueCount, cfg.blueMax, cfg.blueName, game === "dlt");
    if (mode === "dantuo" && !red.dan.length && !blue.dan.length) fail("胆拖至少有一个区设置胆码，请用 胆码 # 拖码 录入。");
    if (mode === "multiple" && red.count * blue.count <= 1) fail("复式至少一个区多选号码；单注请切换单式。");
    // 大乐透的三种胆拖形式中，无胆码的另一区须为基本号码数。
    if (mode === "dantuo" && game === "dlt" && ((!red.dan.length && red.pool.length !== cfg.redCount) || (!blue.dan.length && blue.pool.length !== cfg.blueCount))) fail("大乐透单区胆拖的另一区须为普通单式号码；双区胆拖请在两区分别设置胆码。");
    guard(red.count * blue.count);
    const reds = combinations(red.pool, red.pick), blues = combinations(blue.pool, blue.pick);
    for (const r of reds) for (const b of blues) tickets.push({ game, red: [...red.dan, ...r].sort((a, b) => a - b), blue: [...blue.dan, ...b].sort((a, b) => a - b) });
  }
  return tickets;
}

/** 自动识别仅选择解析器，具体的格式、范围和重复校验仍由解析器负责。 */
export function detectPlayMode(game: LotteryKey, line: string): Exclude<PlayMode, "mixed"> {
  if (/[#＃]/.test(line)) return "dantuo";
  if (game === "p5") return /[|｜]/.test(line) ? "multiple" : "single";
  const cfg = GAMES[game], parts = line.split(/[+＋|｜]/);
  const size = (s: string) => s.trim().split(/[\s,，、]+/).filter(Boolean).length;
  return parts.length === 2 && size(parts[0]) === cfg.redCount && size(parts[1]) === cfg.blueCount ? "single" : "multiple";
}

export function playExample(game: LotteryKey, mode: PlayMode): string {
  if (mode === "mixed") return [playExample(game, "single").split("\n")[0], playExample(game, "multiple"), ...(game === "p5" ? [] : [playExample(game, "dantuo")])].join("\n");
  if (game === "p5") return mode === "single" ? "05198\n00904" : "05 | 1 | 9 | 0 | 48";
  if (mode === "dantuo") return game === "dlt" ? "01 08 # 16 24 28 32 + 03 09" : "01 06 # 12 18 25 28 32 + 09 12";
  if (mode === "multiple") return game === "dlt" ? "01 08 16 24 28 32 + 03 09" : "01 06 12 18 25 28 32 + 09";
  return game === "dlt" ? "01 08 16 24 32 + 03 09" : "01 06 12 18 25 32 + 09";
}

/** 推荐卡片按实际号码池命名，避免候选不足时过滤卡片导致标题错位。 */
export function recommendedPlayName(game: LotteryKey, entry: PlayEntry): string {
  if (game === "p5") return "按位复式";
  const [red, blue] = entry.text.split(" + ");
  if (entry.mode === "dantuo") {
    if (game === "ssq") return blue.split(" ").length > 1 ? "复式胆拖" : "单式胆拖";
    return red.includes("#") ? blue.includes("#") ? "双区胆拖" : "前区胆拖" : "后区胆拖";
  }
  const redMultiple = red.split(" ").length > GAMES[game].redCount;
  const blueMultiple = blue.split(" ").length > GAMES[game].blueCount;
  return redMultiple && blueMultiple ? "双区复式" : `${redMultiple ? GAMES[game].redName : GAMES[game].blueName}复式`;
}

/** 仅把已有候选组织成玩法示例，未对复式、胆拖宣称覆盖优化增益。 */
export function recommendedPlays(game: LotteryKey, tickets: Ticket[]): PlayEntry[] {
  if (tickets.length < 2) return [];
  const pad = (nums: number[]) => nums.map((n) => String(n).padStart(2, "0")).join(" ");
  if (game === "p5") {
    const rows = tickets.filter((t) => t.game === "p5");
    const entry: PlayEntry = { mode: "multiple", text: Array.from({ length: 5 }, (_, p) => [...new Set(rows.map((t) => t.digits[p]))].slice(0, 2).sort().join("")).join(" | ") };
    try { return parsePlay(game, entry).length > 1 ? [entry] : []; } catch { return []; }
  }
  const rows = tickets.filter((t): t is Extract<Ticket, { game: GameKey }> => t.game !== "p5" && t.game === game);
  const first = rows[0];
  if (!first) return [];
  const cfg = GAMES[game];
  const red = [...new Set(rows.flatMap((t) => t.red))].slice(0, cfg.redCount + 1).sort((a, b) => a - b);
  const blue = first.blue;
  const blues = [...new Set(rows.flatMap((t) => t.blue))].slice(0, cfg.blueCount + 1).sort((a, b) => a - b);
  const entries: PlayEntry[] = [
    { mode: "multiple", text: `${pad(red)} + ${pad(blue)}` },
    { mode: "multiple", text: `${pad(first.red)} + ${pad(blues)}` },
    { mode: "multiple", text: `${pad(red)} + ${pad(blues)}` },
    { mode: "dantuo", text: `${pad(red.slice(0, 2))} # ${pad(red.slice(2))} + ${pad(blue)}` },
  ];
  if (game === "dlt") {
    entries.push({ mode: "dantuo", text: `${pad(first.red)} + ${pad(blues.slice(0, 1))} # ${pad(blues.slice(1))}` });
    entries.push({ mode: "dantuo", text: `${pad(red.slice(0, 2))} # ${pad(red.slice(2))} + ${pad(blues.slice(0, 1))} # ${pad(blues.slice(1))}` });
  } else {
    entries.push({ mode: "dantuo", text: `${pad(red.slice(0, 2))} # ${pad(red.slice(2))} + ${pad(blues)}` });
  }
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.mode}:${entry.text}`;
    if (seen.has(key)) return false;
    try { parsePlay(game, entry); seen.add(key); return true; } catch { return false; }
  });
}
