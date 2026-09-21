import type { Metadata } from "next";
import Ball from "@/components/Ball";
import CountdownTimer from "@/components/CountdownTimer";
import Disclaimer from "@/components/Disclaimer";
import GameView from "@/components/GameView";
import { loadGame } from "@/lib/data";
import { GAMES } from "@/lib/games";
import { encodeDraws } from "@/lib/compact";

export const metadata: Metadata = {
  title: "大乐透走势图与统计分析",
  description:
    "超级大乐透前区后区走势图、号码频率、冷热号、遗漏值、和值走势与历史开奖查询，数据同步中国体彩官网。",
};

export default function DltPage() {
  const cfg = GAMES.dlt;
  const data = loadGame("dlt");
  const latest = data.draws.at(-1);

  return (
    <div className="flex flex-col gap-5">
      {/* 页头：最新开奖 */}
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white">{cfg.name}</h1>
            {latest ? (
              <p className="mt-1 text-sm text-slate-400">
                第 <span className="font-semibold text-slate-200">{latest.code}</span> 期
                <span className="ml-2 tabular-nums">{latest.date}</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-500">暂无数据，请先运行 npm run fetch</p>
            )}
          </div>
          {latest && (
            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {latest.red.map((n) => (
                  <Ball key={`r${n}`} n={n} zone="red" />
                ))}
                <span className="mx-1 text-slate-600">+</span>
                {latest.blue.map((n) => (
                  <Ball key={`b${n}`} n={n} zone="blue" />
                ))}
              </div>
              <CountdownTimer drawDays={cfg.drawDays} drawTime={cfg.drawTime} compact />
            </div>
          )}
        </div>
      </section>

      <GameView cfg={cfg} compact={encodeDraws(data.draws, cfg.redCount, cfg.blueCount)} />

      <Disclaimer compact />
    </div>
  );
}
