"use client";

import { useState } from "react";
import HistoryQuery from "@/components/HistoryQuery";
import StatsPanel from "@/components/StatsPanel";
import TrendChart from "@/components/TrendChart";
import type { Draw, GameConfig } from "@/lib/games";

const TABS = ["走势图", "统计分析", "历史查询"] as const;
type Tab = (typeof TABS)[number];

const RANGES = [30, 50, 100] as const;

export default function GameView({
  cfg,
  draws,
}: {
  cfg: GameConfig;
  draws: Draw[];
}) {
  const [tab, setTab] = useState<Tab>("走势图");
  const [range, setRange] = useState<number>(30);

  const scoped =
    tab === "走势图" && range > 0 ? draws.slice(-range) : draws;

  return (
    <div className="flex flex-col gap-4">
      {/* Tab 与期数切换 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl bg-slate-900 p-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-1.5 text-sm transition-colors ${
                tab === t
                  ? "bg-slate-700 font-medium text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "走势图" && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500">期数</span>
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                  range === r
                    ? "bg-slate-700 text-white"
                    : "bg-slate-900 text-slate-400 hover:text-white"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === "走势图" && <TrendChart draws={scoped} cfg={cfg} />}
      {tab === "统计分析" && <StatsPanel draws={draws} cfg={cfg} />}
      {tab === "历史查询" && <HistoryQuery draws={draws} cfg={cfg} />}
    </div>
  );
}
