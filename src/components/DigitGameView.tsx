"use client";

import { useMemo, useState } from "react";
import DigitHistoryQuery from "@/components/DigitHistoryQuery";
import DigitStatsPanel from "@/components/DigitStatsPanel";
import DigitTrendChart from "@/components/DigitTrendChart";
import { P5_CONFIG, type DigitDraw } from "@/lib/digit";
import { decodeDigits, type CompactDigits } from "@/lib/compact";

const TABS = ["走势图", "统计分析", "历史查询"] as const;
type Tab = (typeof TABS)[number];
const RANGES = [30, 50, 100] as const;

/** 排列五的游戏页外壳：三个 tab（与组合型的 GameView 结构一致，内容换成数字型组件） */
export default function DigitGameView({ compact }: { compact: CompactDigits }) {
  const cfg = P5_CONFIG;
  const [tab, setTab] = useState<Tab>("走势图");
  const [range, setRange] = useState<number>(30);

  // 解码一次（按位还原，保留前导 0 与位置语义），子组件接口不变
  const draws = useMemo<DigitDraw[]>(() => decodeDigits(compact), [compact]);

  const scoped = tab === "走势图" && range > 0 ? draws.slice(-range) : draws;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl bg-slate-900 p-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={`rounded-lg px-4 py-1.5 text-sm transition-colors ${
                tab === t ? "bg-slate-700 font-medium text-white" : "text-slate-400 hover:text-white"
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
                  range === r ? "bg-slate-700 text-white" : "bg-slate-900 text-slate-400 hover:text-white"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === "走势图" && <DigitTrendChart draws={scoped} cfg={cfg} />}
      {tab === "统计分析" && <DigitStatsPanel draws={draws} cfg={cfg} />}
      {tab === "历史查询" && <DigitHistoryQuery draws={draws} cfg={cfg} />}
    </div>
  );
}
