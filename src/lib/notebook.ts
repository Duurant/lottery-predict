import { GAMES, type Draw, type GameKey } from "@/lib/games";
import { P5_CONFIG, judgeDigitPrize, type DigitDraw } from "@/lib/digit";
import { judgePrizeForDraw } from "@/lib/prize";
import { mulberry32, ticketShape } from "@/lib/stats";
import { hashSeed } from "@/lib/coverage";

export type LotteryKey = GameKey | "p5";
export type Ticket = { game: GameKey; red: number[]; blue: number[] } | { game: "p5"; digits: number[] };
export type RecordKind = "main" | "personal" | "backup" | "purchase";
export interface SavedRecord {
  id: string; game: LotteryKey; kind: RecordKind; period: string;
  tickets: Ticket[]; reason: string; createdAt: number; updatedAt?: number;
}
export interface Like { id: string; period: string; ticket: Ticket; createdAt: number }
export interface Notebook { version: 1; records: SavedRecord[]; likes: Like[]; preferenceSince: number }
export const STORAGE_KEY = "lottery-notebook-v1";
export const emptyNotebook = (): Notebook => ({ version: 1, records: [], likes: [], preferenceSince: 0 });
export const gameName = (game: LotteryKey) => game === "p5" ? "排列五" : GAMES[game].name;
export const KIND_NAMES: Record<RecordKind, string> = { main: "系统推荐", personal: "猜您喜欢", backup: "备选收藏", purchase: "实际购买" };

export function ticketText(t: Ticket): string {
  if (t.game === "p5") return t.digits.join("");
  const pad = (a: number[]) => a.map((n) => String(n).padStart(2, "0")).join(" ");
  return `${pad(t.red)} + ${pad(t.blue)}`;
}
export const ticketKey = (t: Ticket) => `${t.game}:${ticketText(t)}`;

/** 单式解析：逐行校验，任何一行有误都不部分保存；保留排列五的位置和前导零。 */
export function parseTickets(text: string, game: LotteryKey): Ticket[] {
  const lines = text.trim().split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (!lines.length) throw new Error("请先输入号码，每行一注。");
  if (lines.length > 100) throw new Error("一次最多录入 100 注，请分批保存。");
  return lines.map((line, index) => {
    const fail = (message: string): never => { throw new Error(`第 ${index + 1} 行：${message}`); };
    if (game === "p5") {
      if (!/^[\d\s,，、]+$/.test(line)) return fail("请填写 5 位数字，例如 05198。");
      const compact = line.replace(/[\s,，、]/g, "");
      if (!/^\d{5}$/.test(compact)) return fail("排列五必须恰好有 5 位数字，允许重复与前导 0。");
      return { game, digits: [...compact].map(Number) };
    }
    const cfg = GAMES[game];
    const parts = line.split(/[+＋|｜]/);
    if (parts.length !== 2) return fail(`请用 + 分隔${cfg.redName}和${cfg.blueName}。`);
    const zone = (raw: string, count: number, max: number, name: string) => {
      if (!/^\s*\d{1,2}(?:[\s,，、]+\d{1,2})*\s*$/.test(raw)) return fail(`${name}请用空格或逗号分隔。`);
      const nums = raw.trim().split(/[\s,，、]+/).map(Number);
      if (nums.length !== count || nums.some((n) => n < 1 || n > max) || new Set(nums).size !== count)
        return fail(`${name}需要 ${count} 个不重复号码，范围 1–${max}。`);
      return nums.sort((a, b) => a - b);
    };
    return { game, red: zone(parts[0], cfg.redCount, cfg.redMax, cfg.redName), blue: zone(parts[1], cfg.blueCount, cfg.blueMax, cfg.blueName) };
  });
}

function validTicket(value: unknown): value is Ticket {
  if (!value || typeof value !== "object") return false;
  const t = value as Ticket;
  if (!["dlt", "ssq", "p5"].includes(t.game)) return false;
  const valid = (a: unknown, length: number, max: number, min: number, unique: boolean) => Array.isArray(a) && a.length === length && a.every((n) => Number.isInteger(n) && n >= min && n <= max) && (!unique || new Set(a).size === length);
  if (t.game === "p5") return valid(t.digits, 5, 9, 0, false);
  const cfg = GAMES[t.game];
  return valid(t.red, cfg.redCount, cfg.redMax, 1, true) && valid(t.blue, cfg.blueCount, cfg.blueMax, 1, true);
}

/** 不信任持久化数据；损坏时保留原值，由界面提示，禁止静默覆盖。 */
export function readNotebook(raw: string | null): Notebook {
  if (!raw) return emptyNotebook();
  const n = JSON.parse(raw) as Notebook;
  const periodOk = (p: unknown) => typeof p === "string" && /^(after|code):\d{5,7}$/.test(p);
  const timeOk = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
  if (n.version !== 1 || !Array.isArray(n.records) || !Array.isArray(n.likes) || !timeOk(n.preferenceSince)
    || !n.records.every((r) => r && typeof r.id === "string" && Object.hasOwn(KIND_NAMES, r.kind) && periodOk(r.period) && timeOk(r.createdAt)
      && (r.updatedAt === undefined || timeOk(r.updatedAt)) && typeof r.reason === "string" && r.reason.length < 10000
      && Array.isArray(r.tickets) && r.tickets.length > 0 && r.tickets.length <= 100 && r.tickets.every((t) => validTicket(t) && t.game === r.game))
    || !n.likes.every((l) => l && typeof l.id === "string" && timeOk(l.createdAt) && periodOk(l.period) && validTicket(l.ticket)))
    throw new Error("本地记录格式无法读取，原记录未被覆盖。请先备份浏览器数据，再处理存储问题。");
  return n;
}

/** 只学习明确的购买、喜欢；同一周期同一注同时购买和喜欢只算一次。 */
export function preferenceTickets(n: Notebook, game: LotteryKey): Ticket[] {
  const signals = new Map<string, Ticket>();
  for (const r of n.records) if (r.game === game && r.kind === "purchase" && (r.updatedAt ?? r.createdAt) > n.preferenceSince)
    for (const t of r.tickets) signals.set(`${r.period}:${ticketKey(t)}`, t);
  for (const l of n.likes) if (l.ticket.game === game && l.createdAt > n.preferenceSince) signals.set(`${l.period}:${ticketKey(l.ticket)}`, l.ticket);
  return [...signals.values()];
}

/** 个性化仅表达选号口味：带平滑的号码频次 + 奇偶、连号、和值相似度，始终保留探索。 */
export function personalizedTickets(game: LotteryKey, signals: Ticket[], excluded: Ticket[], period: string): Ticket[] {
  if (!signals.length) return [];
  const rand = mulberry32(hashSeed(game, period, ...signals.map(ticketKey).sort(), ...excluded.map(ticketKey).sort()));
  const used = new Set(excluded.map(ticketKey));
  const out: Ticket[] = [];
  const signalNumbers = signals.map((t) => t.game === "p5" ? t.digits : t.red);
  const shapes = signalNumbers.map(ticketShape);
  const draw = (max: number, min: number, count: number, histories: number[][]) => {
    const candidates = Array.from({ length: max - min + 1 }, (_, i) => i + min).map((num) => {
      const frequency = histories.filter((a) => a.includes(num)).length / histories.length;
      return { num, score: Math.pow(Math.max(rand(), 1e-12), 1 / (1 + frequency * 2)) };
    });
    return candidates.sort((a, b) => b.score - a.score).slice(0, count).map((x) => x.num).sort((a, b) => a - b);
  };
  for (let tries = 0; out.length < 5 && tries < 1500; tries++) {
    let t: Ticket;
    if (game === "p5") {
      t = { game, digits: Array.from({ length: 5 }, (_, p) => draw(9, 0, 1, signals.map((s) => s.game === "p5" ? [s.digits[p]] : []))[0]) };
    } else {
      const cfg = GAMES[game];
      t = { game, red: draw(cfg.redMax, 1, cfg.redCount, signalNumbers), blue: draw(cfg.blueMax, 1, cfg.blueCount, signals.map((s) => s.game !== "p5" ? s.blue : [])) };
    }
    if (used.has(ticketKey(t))) continue;
    const s = ticketShape(t.game === "p5" ? t.digits : t.red);
    const affinity = shapes.reduce((v, h) => v + (h.odd === s.odd ? 1 : 0) + (h.consecutive === s.consecutive ? 1 : 0) + (Math.abs(h.sum - s.sum) <= 10 ? 1 : 0), 0) / (3 * shapes.length);
    if (tries < 1000 && rand() > 0.65 + 0.35 * affinity) continue;
    used.add(ticketKey(t)); out.push(t);
  }
  return out;
}

export function resolveDraw<T extends { code: string }>(period: string, draws: T[]): T | undefined {
  if (period.startsWith("code:")) return draws.find((d) => d.code === period.slice(5));
  const index = draws.findIndex((d) => d.code === period.slice(6));
  return index >= 0 ? draws[index + 1] : undefined;
}

export function checkTicket(t: Ticket, draw: Draw | DigitDraw) {
  if (t.game === "p5" && "digits" in draw) {
    const matched = t.digits.filter((n, p) => n === draw.digits[p]).length;
    return { label: judgeDigitPrize(P5_CONFIG, t.digits, draw.digits) ? "一等奖" : "未中奖", detail: `命中 ${matched} 个位置` };
  }
  if (t.game !== "p5" && "red" in draw) {
    const red = t.red.filter((n) => draw.red.includes(n)).length;
    const blue = t.blue.filter((n) => draw.blue.includes(n)).length;
    const tier = judgePrizeForDraw(GAMES[t.game], draw.code, red, blue);
    const special = t.game === "ssq" && draw.code >= "2026014" && red === 3 && blue === 0;
    return { label: special ? "福运奖待核实（需当期特别规定）" : tier ? `${["", "一", "二", "三", "四", "五", "六", "七", "八", "九"][tier]}等奖` : "未中奖", detail: `${GAMES[t.game].redName} ${red} 个 · ${GAMES[t.game].blueName} ${blue} 个` };
  }
  throw new Error("号码与开奖彩种不匹配");
}
