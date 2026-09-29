"use client";

import { useMemo, useState } from "react";
import HistoryQuery from "@/components/HistoryQuery";
import StatsPanel from "@/components/StatsPanel";
import TrendChart from "@/components/TrendChart";
import type { Draw, GameConfig } from "@/lib/games";
import { decodeDraws, type CompactDraws } from "@/lib/compact";

const TABS = ["走势图", "统计分析", "历史查询"] as const;
type Tab = (typeof TABS)[number];

const RANGES = [30, 50, 100] as const;

export default function GameView({
  cfg,
  compact,
}: {
  cfg: GameConfig;
  compact: CompactDraws;
}) {
  const [tab, setTab] = useState<Tab>("统计分析");
  const [range, setRange] = useState<number>(30);

  // 解码一次，子组件拿到的仍是普通 Draw[]（接口不变）
  const draws = useMemo(() => decodeDraws(compact), [compact]);

  const scoped =
    tab === "走势图" && range > 0 ? draws.slice(-range) : draws;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">热号是近期出现较多的号码；遗漏是距上次出现经过的期数。这里只描述历史，不预示下一期。<a className="ml-2 underline" href={`/generator?g=${cfg.key}`}>高级条件选号</a></div>
      {/* Tab 与期数切换 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl bg-white p-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={`rounded-lg px-4 py-1.5 text-sm transition-colors ${
                tab === t
                  ? "bg-slate-200 font-medium text-slate-900"
                  : "text-slate-500 hover:text-slate-900"
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
                aria-pressed={range === r}
                className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                  range === r
                    ? "bg-slate-200 text-slate-900"
                    : "bg-white text-slate-500 hover:text-slate-900"
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
