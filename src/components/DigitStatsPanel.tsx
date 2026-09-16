"use client";

import { useMemo, useState } from "react";
import EChart, { type EOption } from "@/components/EChart";
import {
  digitSpan,
  digitSum,
  positionFreq,
  positionMaxOmission,
  positionOmission,
  repeatCount,
  type DigitDraw,
  type DigitGameConfig,
} from "@/lib/digit";

const WINDOWS = [30, 50, 100, 0] as const; // 0 = 全部
const AXIS = { axisLabel: { color: "#94a3b8", fontSize: 10 }, axisLine: { lineStyle: { color: "#334155" } } };

/**
 * 排列五统计分析：各位数字频率、当前遗漏排行、和值/跨度/重复数字分布。
 * 全部是历史统计描述，不构成任何「下期更可能出现」的暗示。
 */
export default function DigitStatsPanel({ draws, cfg }: { draws: DigitDraw[]; cfg: DigitGameConfig }) {
  const [win, setWin] = useState<number>(30);
  const [position, setPosition] = useState(0);
  const scoped = useMemo(() => (win === 0 ? draws : draws.slice(-win)), [draws, win]);

  const freq = useMemo(() => positionFreq(scoped, position, cfg.digitMax), [scoped, position, cfg.digitMax]);
  const omission = useMemo(() => positionOmission(draws, position, cfg.digitMax), [draws, position, cfg.digitMax]);
  const maxOmission = useMemo(
    () => positionMaxOmission(draws, position, cfg.digitMax),
    [draws, position, cfg.digitMax]
  );

  const freqChart = useMemo<EOption>(
    () => ({
      grid: { left: 40, right: 16, top: 16, bottom: 24 },
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: "rgba(15,23,42,0.95)",
        borderColor: "#334155",
        textStyle: { color: "#e2e8f0", fontSize: 12 },
        formatter: (ps: { name: string; value: number }[]) => {
          const p = ps[0];
          return `数字 ${p.name}：出现 ${p.value} 次`;
        },
      },
      xAxis: { type: "category", data: freq.map((_, n) => String(n)), ...AXIS },
      yAxis: { type: "value", ...AXIS, splitLine: { lineStyle: { color: "#1e293b" } } },
      series: [
        {
          type: "bar",
          data: freq,
          barWidth: 18,
          itemStyle: { color: "#a78bfa", borderRadius: [4, 4, 0, 0] },
        },
      ],
    }),
    [freq]
  );

  const sumDist = useMemo(() => {
    const counts = new Array<number>(cfg.positions * cfg.digitMax + 1).fill(0);
    for (const d of scoped) counts[digitSum(d)]++;
    return counts.map((count, sum) => (count > 0 ? { sum, count } : null)).filter(Boolean) as {
      sum: number;
      count: number;
    }[];
  }, [scoped, cfg]);

  const sumChart = useMemo<EOption>(
    () => ({
      grid: { left: 40, right: 16, top: 16, bottom: 24 },
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: "rgba(15,23,42,0.95)",
        borderColor: "#334155",
        textStyle: { color: "#e2e8f0", fontSize: 12 },
        formatter: (ps: { name: string; value: number }[]) => {
          const p = ps[0];
          return `和值 ${p.name}：${p.value} 期`;
        },
      },
      xAxis: { type: "category", data: sumDist.map((x) => String(x.sum)), ...AXIS },
      yAxis: { type: "value", ...AXIS, splitLine: { lineStyle: { color: "#1e293b" } } },
      series: [
        { type: "bar", data: sumDist.map((x) => x.count), barWidth: "60%", itemStyle: { color: "#8b5cf6" } },
      ],
    }),
    [sumDist]
  );

  const repeatDist = useMemo(() => {
    const counts = new Array<number>(cfg.positions).fill(0);
    for (const d of scoped) counts[repeatCount(d)]++;
    return counts.map((count, r) => ({ r, count }));
  }, [scoped, cfg]);

  const spanDist = useMemo(() => {
    const counts = new Array<number>(cfg.digitMax + 1).fill(0);
    for (const d of scoped) counts[digitSpan(d)]++;
    return counts.map((count, span) => ({ span, count }));
  }, [scoped, cfg]);

  const omissionRank = useMemo(
    () => omission.map((o, n) => ({ n, o, max: maxOmission[n] })).sort((a, b) => b.o - a.o),
    [omission, maxOmission]
  );

  const chip = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs tabular-nums";

  return (
    <div className="flex flex-col gap-4">
      {/* 范围与位置 */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">统计范围</span>
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setWin(w)}
              className={`rounded-lg px-3 py-1 text-xs transition-colors ${
                win === w ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {w === 0 ? "全部历史" : `近${w}期`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">位置</span>
          {cfg.positionNames.map((name, p) => (
            <button
              key={name}
              onClick={() => setPosition(p)}
              className={`rounded-lg px-3 py-1 text-xs transition-colors ${
                position === p ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h3 className="mb-3 text-sm font-semibold text-white">
            {cfg.positionNames[position]}数字频率
            <span className="ml-2 text-xs font-normal text-slate-500">
              （{win === 0 ? "全部" : `近${win}期`}，0-{cfg.digitMax} 各 {scoped.length ? (scoped.length / (cfg.digitMax + 1)).toFixed(0) : 0} 次为期望）
            </span>
          </h3>
          <EChart option={freqChart} height={200} />
        </section>

        <section className="card">
          <h3 className="mb-3 text-sm font-semibold text-white">
            {cfg.positionNames[position]}当前遗漏
            <span className="ml-2 text-xs font-normal text-slate-500">（基于全部历史，单位：期）</span>
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {omissionRank.map((r) => (
              <div key={r.n} className="flex items-center justify-between rounded-lg bg-slate-800/50 px-3 py-2">
                <span className={`${chip} bg-violet-500/15 text-violet-300`}>{r.n}</span>
                <span className="tabular-nums text-slate-300">
                  遗漏 <span className="font-semibold text-white">{r.o}</span> 期
                  <span className="ml-1 text-slate-500">（历史最长 {r.max}）</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h3 className="mb-3 text-sm font-semibold text-white">
            和值分布
            <span className="ml-2 text-xs font-normal text-slate-500">
              （五位之和 · {win === 0 ? "全部" : `近${win}期`} · 理论均值 {(cfg.positions * cfg.digitMax) / 2}）
            </span>
          </h3>
          <EChart option={sumChart} height={180} />
        </section>

        <section className="card">
          <h3 className="mb-3 text-sm font-semibold text-white">
            跨度与重复数字
            <span className="ml-2 text-xs font-normal text-slate-500">（{win === 0 ? "全部" : `近${win}期`}）</span>
          </h3>
          <div className="flex flex-col gap-2 text-xs">
            <div>
              <div className="mb-1 text-slate-500">跨度（最大数字 − 最小数字）</div>
              <div className="flex flex-wrap gap-1">
                {spanDist
                  .filter((x) => x.count > 0)
                  .map((x) => (
                    <span key={x.span} className={`${chip} bg-slate-800 text-slate-300`}>
                      {x.span}
                      <span className="text-slate-500">{Math.round((x.count / scoped.length) * 100)}%</span>
                    </span>
                  ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-slate-500">
                含重复数字的位数占比（五位里有几位是重复的）
              </div>
              <div className="flex flex-wrap gap-1">
                {repeatDist.map((x) => (
                  <span key={x.r} className={`${chip} bg-slate-800 text-slate-300`}>
                    {x.r} 个
                    <span className="text-slate-500">
                      {scoped.length ? Math.round((x.count / scoped.length) * 100) : 0}%
                    </span>
                  </span>
                ))}
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              五位数字全部不同的理论概率为 10×9×8×7×6 / 10⁵ = 30.24%，即约 69.8% 的期数含重复数字；
              上表与该理论值对照即可判断数据是否正常。
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
