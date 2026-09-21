import Link from "next/link";
import Ball from "@/components/Ball";
import CountdownTimer from "@/components/CountdownTimer";
import { GAMES, type GameData, type GameKey } from "@/lib/games";

export default function LatestDrawCard({ game, data }: { game: GameKey; data: GameData }) {
  const cfg = GAMES[game];
  const latest = data.draws.at(-1);

  return (
    <div className="card flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">{cfg.name}</h3>
        <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-400">
          每周{cfg.drawDays.map((d) => "日一二三四五六"[d]).join("、")} {cfg.drawTime}
        </span>
      </div>

      {latest ? (
        <>
          <p className="text-sm text-slate-400">
            第 <span className="font-semibold text-slate-200">{latest.code}</span> 期
            <span className="ml-2 tabular-nums">{latest.date}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {latest.red.map((n) => (
              <Ball key={`r${n}`} n={n} zone="red" size="lg" />
            ))}
            <span className="mx-1 text-slate-400">+</span>
            {latest.blue.map((n) => (
              <Ball key={`b${n}`} n={n} zone="blue" size="lg" />
            ))}
          </div>
          <div className="flex items-center justify-between">
            <CountdownTimer drawDays={cfg.drawDays} drawTime={cfg.drawTime} />
            <Link
              href={`/${game}`}
              className="text-sm text-red-400 hover:text-red-300"
            >
              走势分析 →
            </Link>
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-500">数据暂时不可用，请稍后再来。</p>
      )}
    </div>
  );
}
