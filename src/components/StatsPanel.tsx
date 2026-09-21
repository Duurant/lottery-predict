"use client";

import { useMemo, useState } from "react";
import EChart, { type EOption } from "@/components/EChart";
import type { Draw, GameConfig } from "@/lib/games";
import { pad2 } from "@/lib/games";
import {
  freqCounts,
  mean,
  numberInfos,
  sumOf,
  oddEvenRatio,
} from "@/lib/stats";

const WINDOWS = [30, 50, 100, 0] as const; // 0 = 全部
const AXIS = { axisLabel: { color: "#94a3b8", fontSize: 10 }, axisLine: { lineStyle: { color: "#334155" } } };

function tooltipCfg() {
  return {
    trigger: "axis" as const,
    backgroundColor: "rgba(15,23,42,0.95)",
    borderColor: "#334155",
    textStyle: { color: "#e2e8f0", fontSize: 12 },
  };
}

export default function StatsPanel({ draws, cfg }: { draws: Draw[]; cfg: GameConfig }) {
  const [win, setWin] = useState<number>(30);

  const scoped = useMemo(
    () => (win === 0 ? draws : draws.slice(-win)),
    [draws, win]
  );

  const redFreq = useMemo(() => freqCounts(scoped, "red", cfg.redMax), [scoped, cfg.redMax]);
  const blueFreq = useMemo(() => freqCounts(scoped, "blue", cfg.blueMax), [scoped, cfg.blueMax]);
  const redInfos = useMemo(
    () => numberInfos(draws, "red", cfg.redMax, cfg.redCount),
    [draws, cfg.redMax, cfg.redCount]
  );

  const redFreqOption = useMemo<EOption>(() => {
    const avg = mean(redFreq.slice(1));
    return {
      grid: { left: 40, right: 16, top: 24, bottom: 28 },
      tooltip: tooltipCfg(),
      xAxis: { type: "category", data: redFreq.slice(1).map((_, i) => pad2(i + 1)), ...AXIS },
      yAxis: { type: "value", ...AXIS, splitLine: { lineStyle: { color: "#1e293b" } } },
      series: [
        {
          type: "bar",
          data: redFreq.slice(1),
          itemStyle: {
            color: {
              type: "linear", x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: "#f87171" },
                { offset: 1, color: "#b91c1c" },
              ],
            },
            borderRadius: [3, 3, 0, 0],
          },
          markLine: {
            symbol: "none",
            data: [{ yAxis: Math.round(avg * 10) / 10 }],
            lineStyle: { color: "#fbbf24", type: "dashed" },
            label: { color: "#fbbf24", formatter: `均值 ${avg.toFixed(1)}`, fontSize: 10 },
          },
        },
      ],
    };
  }, [redFreq]);

  const blueFreqOption = useMemo<EOption>(() => {
    const avg = mean(blueFreq.slice(1));
    return {
      grid: { left: 40, right: 16, top: 24, bottom: 28 },
      tooltip: tooltipCfg(),
      xAxis: { type: "category", data: blueFreq.slice(1).map((_, i) => pad2(i + 1)), ...AXIS },
      yAxis: { type: "value", ...AXIS, splitLine: { lineStyle: { color: "#1e293b" } } },
      series: [
        {
          type: "bar",
          data: blueFreq.slice(1),
          itemStyle: {
            color: {
              type: "linear", x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: "#60a5fa" },
                { offset: 1, color: "#1d4ed8" },
              ],
            },
            borderRadius: [3, 3, 0, 0],
          },
          markLine: {
            symbol: "none",
            data: [{ yAxis: Math.round(avg * 10) / 10 }],
            lineStyle: { color: "#fbbf24", type: "dashed" },
            label: { color: "#fbbf24", formatter: `均值 ${avg.toFixed(1)}`, fontSize: 10 },
          },
        },
      ],
    };
  }, [blueFreq]);

  const omissionOption = useMemo<EOption>(() => {
    const top = [...redInfos].sort((a, b) => b.omission - a.omission).slice(0, 10).reverse();
    return {
      grid: { left: 70, right: 40, top: 16, bottom: 28 },
      tooltip: {
        ...tooltipCfg(),
        // axis 触发时 formatter 收到的是参数数组，单 series 取第一项
        formatter: (ps: { value: number; name: string }[]) => {
          const p = ps[0];
          return `${p.name}：已遗漏 ${p.value} 期`;
        },
      },
      xAxis: { type: "value", ...AXIS, splitLine: { lineStyle: { color: "#1e293b" } } },
      yAxis: {
        type: "category",
        data: top.map((t) => pad2(t.num)),
        ...AXIS,
      },
      series: [
        {
          type: "bar",
          data: top.map((t) => t.omission),
          itemStyle: { color: "#f59e0b", borderRadius: [0, 3, 3, 0] },
          markLine: {
            symbol: "none",
            data: [{ xAxis: Math.round(cfg.redMax / cfg.redCount) }],
            lineStyle: { color: "#64748b", type: "dashed" },
            label: { color: "#94a3b8", formatter: "理论均值间隔", fontSize: 10 },
          },
        },
      ],
    };
  }, [redInfos, cfg.redMax, cfg.redCount]);

  const sumOption = useMemo<EOption>(() => {
    const recent = draws.slice(-100).map(sumOf);
    const m = mean(recent);
    return {
      grid: { left: 44, right: 16, top: 24, bottom: 40 },
      tooltip: tooltipCfg(),
      dataZoom: [
        { type: "inside", xAxisIndex: 0, startValue: Math.max(0, recent.length - 50), endValue: recent.length - 1 },
      ],
      xAxis: {
        type: "category",
        data: draws.slice(-100).map((d) => d.code),
        ...AXIS,
        axisLabel: { ...AXIS.axisLabel, interval: Math.floor(recent.length / 10) },
      },
      yAxis: { type: "value", scale: true, ...AXIS, splitLine: { lineStyle: { color: "#1e293b" } } },
      series: [
        {
          type: "line",
          data: recent,
          symbol: "none",
          lineStyle: { color: "#f87171", width: 1.5 },
          areaStyle: { color: "rgba(248,113,113,0.08)" },
          markLine: {
            symbol: "none",
            data: [{ yAxis: Math.round(m) }],
            lineStyle: { color: "#fbbf24", type: "dashed" },
            label: { color: "#fbbf24", formatter: `均值 ${Math.round(m)}`, fontSize: 10 },
          },
        },
      ],
    };
  }, [draws]);

  const oddEvenOption = useMemo<EOption>(() => {
    const dist = new Map<string, number>();
    for (const d of scoped) {
      const [odd, even] = oddEvenRatio(d.red);
      const k = `${odd}:${even}`;
      dist.set(k, (dist.get(k) ?? 0) + 1);
    }
    const entries = [...dist.entries()].sort((a, b) => {
      const [ao] = a[0].split(":").map(Number);
      const [bo] = b[0].split(":").map(Number);
      return ao - bo;
    });
    return {
      grid: { left: 40, right: 16, top: 24, bottom: 28 },
      // axis 触发时 formatter 收到的是参数数组，单 series 取第一项
      tooltip: {
        ...tooltipCfg(),
        formatter: (ps: { name: string; value: number }[]) => {
          const p = ps[0];
          return `奇:偶 ${p.name}：${p.value} 期`;
        },
      },
      xAxis: { type: "category", data: entries.map((e) => e[0]), ...AXIS },
      yAxis: { type: "value", ...AXIS, splitLine: { lineStyle: { color: "#1e293b" } } },
      series: [
        {
          type: "bar",
          data: entries.map((e) => e[1]),
          itemStyle: { color: "#fb7185", borderRadius: [3, 3, 0, 0] },
          label: { show: true, position: "top", color: "#94a3b8", fontSize: 10 },
        },
      ],
    };
  }, [scoped]);

  const hotCold = useMemo(() => {
    const byFreq = (zone: "red" | "blue", max: number) => {
      const f = freqCounts(scoped, zone, max);
      const arr = f.slice(1).map((count, i) => ({ num: i + 1, count }));
      return {
        hot: [...arr].sort((a, b) => b.count - a.count).slice(0, 5),
        cold: [...arr].sort((a, b) => a.count - b.count).slice(0, 5),
      };
    };
    return {
      red: byFreq("red", cfg.redMax),
      blue: byFreq("blue", cfg.blueMax),
    };
  }, [scoped, cfg.redMax, cfg.blueMax]);

  const chip = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs tabular-nums";

  return (
    <div className="flex flex-col gap-4">
      {/* 窗口切换 */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-400">统计范围</span>
        {WINDOWS.map((w) => (
          <button
            key={w}
            onClick={() => setWin(w)}
            aria-pressed={win === w}
            className={`rounded-lg px-3 py-1 text-xs transition-colors ${
              win === w ? "bg-red-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            {w === 0 ? "全部历史" : `近${w}期`}
          </button>
        ))}
      </div>

      {/* 全部历史时的已知数据特征提示（如大乐透 2007–2013 年高位号偏多） */}
      {win === 0 && cfg.historyNote && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200/90">
          ℹ️ {cfg.historyNote}
        </p>
      )}

      {/* 冷热榜 */}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card">
          <h3 className="mb-3 text-sm font-semibold text-white">
            {cfg.redName}冷热榜 <span className="text-xs font-normal text-slate-500">（{win === 0 ? "全部" : `近${win}期`}）</span>
          </h3>
          <div className="flex flex-col gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-10 text-slate-400">热号</span>
              {hotCold.red.hot.map((h) => (
                <span key={h.num} className={`${chip} bg-red-500/15 text-red-300`}>
                  {pad2(h.num)}·{h.count}次
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-10 text-slate-400">冷号</span>
              {hotCold.red.cold.map((h) => (
                <span key={h.num} className={`${chip} bg-slate-700/50 text-slate-300`}>
                  {pad2(h.num)}·{h.count}次
                </span>
              ))}
            </div>
          </div>
        </section>
        <section className="card">
          <h3 className="mb-3 text-sm font-semibold text-white">
            {cfg.blueName}冷热榜 <span className="text-xs font-normal text-slate-500">（{win === 0 ? "全部" : `近${win}期`}）</span>
          </h3>
          <div className="flex flex-col gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-10 text-slate-400">热号</span>
              {hotCold.blue.hot.map((h) => (
                <span key={h.num} className={`${chip} bg-blue-500/15 text-blue-300`}>
                  {pad2(h.num)}·{h.count}次
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-10 text-slate-400">冷号</span>
              {hotCold.blue.cold.map((h) => (
                <span key={h.num} className={`${chip} bg-slate-700/50 text-slate-300`}>
                  {pad2(h.num)}·{h.count}次
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* 频率图 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h3 className="mb-2 text-sm font-semibold text-white">
            {cfg.redName}号码频率
            <span className="ml-2 text-xs font-normal text-slate-500">出现次数</span>
          </h3>
          <EChart option={redFreqOption} height={260} ariaLabel={`${cfg.redName}各号码的历史出现次数柱状图（含均值线）`} />
        </section>
        <section className="card">
          <h3 className="mb-2 text-sm font-semibold text-white">
            {cfg.blueName}号码频率
            <span className="ml-2 text-xs font-normal text-slate-500">出现次数</span>
          </h3>
          <EChart option={blueFreqOption} height={260} ariaLabel={`${cfg.blueName}各号码的历史出现次数柱状图（含均值线）`} />
        </section>
      </div>

      {/* 遗漏 + 奇偶 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h3 className="mb-2 text-sm font-semibold text-white">
            当前遗漏排行（{cfg.redName}）
            <span className="ml-2 text-xs font-normal text-slate-500">距最近一次开出</span>
          </h3>
          <EChart option={omissionOption} height={260} ariaLabel="当前遗漏最深的号码条形图" />
        </section>
        <section className="card">
          <h3 className="mb-2 text-sm font-semibold text-white">
            奇偶比分布（{cfg.redName}）
            <span className="ml-2 text-xs font-normal text-slate-500">
              {win === 0 ? "全部" : `近${win}期`}
            </span>
          </h3>
          <EChart option={oddEvenOption} height={260} ariaLabel="奇偶比形态分布柱状图" />
        </section>
      </div>

      {/* 和值走势 */}
      <section className="card">
        <h3 className="mb-2 text-sm font-semibold text-white">
          和值走势（{cfg.redName}）
          <span className="ml-2 text-xs font-normal text-slate-500">近 100 期，可缩放</span>
        </h3>
        <EChart option={sumOption} height={280} ariaLabel="和值走势折线图（含均值线）" />
      </section>
    </div>
  );
}
