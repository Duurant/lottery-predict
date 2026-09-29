import { GAMES, type Draw } from "@/lib/games";
import { P5_CONFIG, type DigitDraw } from "@/lib/digit";
import { buildProfile } from "@/lib/coverage";
import { recommendationBatch } from "@/lib/predict";
import { digitRecommendation } from "@/lib/digit-predict";
import type { LotteryKey, Ticket } from "@/lib/notebook";

export interface DrawsByGame { dlt: Draw[]; ssq: Draw[]; p5: DigitDraw[] }

export function systemTickets(game: LotteryKey, data: DrawsByGame, salt = 0): Ticket[] {
  if (!data[game].length) return [];
  if (game === "p5") return digitRecommendation(P5_CONFIG, data.p5, 5, salt).map((digits) => ({ game, digits }));
  const cfg = GAMES[game];
  const draws = data[game];
  const batch = recommendationBatch(cfg, draws, draws.length, "best", 5, {
    red: buildProfile(draws, "red", cfg.redMax), blue: buildProfile(draws, "blue", cfg.blueMax),
  }, salt);
  return batch.red.map((red, i) => ({ game, red, blue: batch.blue[i] }));
}

/** 仅作状态提示；期号绑定以上期官方记录为锚点，不猜测跨年或休市期号。 */
export function expectedDrawTime(game: LotteryKey, latestDate: string): number {
  const cfg = game === "p5" ? P5_CONFIG : GAMES[game];
  const base = Date.parse(`${latestDate}T${cfg.drawTime}:00+08:00`);
  for (let n = 1; n <= 7; n++) {
    const t = base + n * 86400000;
    if (cfg.drawDays.includes(new Date(t + 8 * 3600000).getUTCDay())) return t;
  }
  return base;
}

export function systemReason(tickets: Ticket[]): string {
  if (!tickets.length) return "开奖数据暂不可用。";
  if (tickets[0].game === "p5") return "5 注号码互不重复，保留每一位的位置与数字 0。各选号方式的单注中奖概率相同。";
  const combo = tickets.filter((t) => t.game !== "p5");
  const cfg = GAMES[tickets[0].game];
  return `这组覆盖 ${new Set(combo.flatMap((t) => t.red)).size} 个不同${cfg.redName}号码、${new Set(combo.flatMap((t) => t.blue)).size} 个不同${cfg.blueName}号码，让各注尽量少重叠。下方奇偶、连号和和值用于描述组合，不是中奖信号。`;
}
