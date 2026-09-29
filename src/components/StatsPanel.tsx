"use client";

import { useMemo, useState } from "react";
import EChart, { type EOption } from "@/components/EChart";
import type { Draw, GameConfig } from "@/lib/games";
import { pad2 } from "@/lib/games";
import {
  bigSmallDist,
  consecStats,
  freqCounts,
  mean,
  median,
  numberInfos,
  oddEvenRatio,
  spanDist,
  sumHistogram,
  sumOf,
  zoneParts,
} from "@/lib/stats";

const WINDOWS = [30, 50, 100, 0] as const; // 0 = 全部
const AXIS = { axisLabel: { color: "#64748b", fontSize: 10 }, axisLine: { lineStyle: { color: "#cbd5e1" } } };

function tooltipCfg() {
  return {
    trigger: "axis" as const,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderColor: "#cbd5e1",
    textStyle: { color: "#334155", fontSize: 12 },
  };
}

/** 单 series 的 axis 触发 tooltip：formatter 收到的是参数数组，必须取 [0] */
function oneSeries(render: (p: { name: string; value: number }) => string) {
  return (ps: { name: string; value: number }[]) => render(ps[0]);
}

const BAR = (colors: [string, string]) => ({
  type: "linear" as const,
  x: 0,
  y: 0,
  x2: 0,
  y2: 1,
  colorStops: [
    { offset: 0, color: colors[0] },
    { offset: 1, color: colors[1] },
  ],
});

export default function StatsPanel({ draws, cfg }: { draws: Draw[]; cfg: GameConfig }) {
  const [win, setWin] = useState<number>(30);

  const scoped = useMemo(
    () => (win === 0 ? draws : draws.slice(-win)),
    [draws, win]
  );

  const redFreq = useMemo(() => freqCounts(scoped, "red", cfg.redMax), [scoped, cfg.redMax]);
  const blueFreq = useMemo(() => freqCounts(scoped, "blue", cfg.blueMax), [scoped, cfg.blueMax]);
  // 遗漏画像基于全部历史（遗漏值本身要与「历史上最近一次开出」对齐，不能只看窗口）
  const redInfos = useMemo(
    () => numberInfos(draws, "red", cfg.redMax, cfg.redCount),
    [draws, cfg.redMax, cfg.redCount]
  );
  const blueInfos = useMemo(
    () => numberInfos(draws, "blue", cfg.blueMax, cfg.blueCount),
    [draws, cfg.blueMax, cfg.blueCount]
  );

  const redFreqOption = useMemo<EOption>(() => {
    const avg = mean(redFreq.slice(1));
    return {
      grid: { left: 40, right: 16, top: 24, bottom: 28 },
      tooltip: tooltipCfg(),
      xAxis: { type: "category", data: redFreq.slice(1).map((_, i) => pad2(i + 1)), ...AXIS },
      yAxis: { type: "value", ...AXIS, splitLine: { lineStyle: { color: "#e2e8f0" } } },
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
      yAxis: { type: "value", ...AXIS, splitLine: { lineStyle: { color: "#e2e8f0" } } },
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
        formatter: oneSeries((p) => `${p.name}：已遗漏 ${p.value} 期`),
      },
      xAxis: { type: "value", ...AXIS, splitLine: { lineStyle: { color: "#e2e8f0" } } },
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
            label: { color: "#64748b", formatter: "理论均值间隔", fontSize: 10 },
          },
        },
      ],
    };
  }, [redInfos, cfg.redMax, cfg.redCount]);

  /** 蓝区遗漏排行（与红区同口径：全部历史） */
  const blueOmissionOption = useMemo<EOption>(() => {
    const top = [...blueInfos].sort((a, b) => b.omission - a.omission).slice(0, 10).reverse();
    return {
      grid: { left: 70, right: 40, top: 16, bottom: 28 },
      tooltip: {
        ...tooltipCfg(),
        formatter: oneSeries((p) => `${p.name}：已遗漏 ${p.value} 期`),
      },
      xAxis: { type: "value", ...AXIS, splitLine: { lineStyle: { color: "#e2e8f0" } } },
      yAxis: { type: "category", data: top.map((t) => pad2(t.num)), ...AXIS },
      series: [
        {
          type: "bar",
          data: top.map((t) => t.omission),
          itemStyle: { color: "#38bdf8", borderRadius: [0, 3, 3, 0] },
          markLine: {
            symbol: "none",
            data: [{ xAxis: Math.round(cfg.blueMax / cfg.blueCount) }],
            lineStyle: { color: "#64748b", type: "dashed" },
            label: { color: "#64748b", formatter: "理论均值间隔", fontSize: 10 },
          },
        },
      ],
    };
  }, [blueInfos, cfg.blueMax, cfg.blueCount]);

  /** 和值走势：尊重窗口选择器（此前固定近 100 期，与其它面板不同步） */
  const sumOption = useMemo<EOption>(() => {
    const sums = scoped.map(sumOf);
    const m = mean(sums);
    const start = Math.max(0, sums.length - 50);
    return {
      grid: { left: 44, right: 16, top: 24, bottom: 40 },
      tooltip: {
        ...tooltipCfg(),
        formatter: oneSeries((p) => `${p.name}：和值 ${p.value}`),
      },
      dataZoom: [{ type: "inside", xAxisIndex: 0, startValue: start, endValue: Math.max(sums.length - 1, 0) }],
      xAxis: {
        type: "category",
        data: scoped.map((d) => d.code),
        ...AXIS,
        axisLabel: { ...AXIS.axisLabel, interval: Math.max(Math.floor(sums.length / 10), 0) },
      },
      yAxis: { type: "value", scale: true, ...AXIS, splitLine: { lineStyle: { color: "#e2e8f0" } } },
      series: [
        {
          type: "line",
          data: sums,
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
  }, [scoped]);

  /** 和值分布直方图（均值/中位数放在标题文字里，避免依赖未注册的 graphic 组件） */
  const sumHistOption = useMemo<EOption>(() => {
    const bins = sumHistogram(scoped, 10);
    return {
      grid: { left: 44, right: 16, top: 24, bottom: 28 },
      tooltip: {
        ...tooltipCfg(),
        formatter: oneSeries((p) => `和值 ${p.name}：${p.value} 期`),
      },
      xAxis: { type: "category", data: bins.map((b) => `${b.from}-${b.to}`), ...AXIS },
      yAxis: { type: "value", ...AXIS, splitLine: { lineStyle: { color: "#e2e8f0" } } },
      series: [
        {
          type: "bar",
          data: bins.map((b) => b.count),
          itemStyle: { color: BAR(["#fdba74", "#c2410c"]), borderRadius: [3, 3, 0, 0] },
        },
      ],
    };
  }, [scoped]);

  /** 和值摘要（均值/中位数/分位数），展示在标题里 */
  const sumStats = useMemo(() => {
    const sums = scoped.map(sumOf);
    if (!sums.length) return { mean: 0, median: 0, lo: 0, hi: 0 };
    const lo = Math.min(...sums);
    const hi = Math.max(...sums);
    return { mean: mean(sums), median: median(sums), lo, hi };
  }, [scoped]);

  /** 奇偶比分布（红区） */
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
        formatter: oneSeries((p) => `奇:偶 ${p.name}：${p.value} 期`),
      },
      xAxis: { type: "category", data: entries.map((e) => e[0]), ...AXIS },
      yAxis: { type: "value", ...AXIS, minInterval: 1, splitLine: { lineStyle: { color: "#e2e8f0" } } },
      series: [
        {
          type: "bar",
          data: entries.map((e) => e[1]),
          itemStyle: { color: "#fb7185", borderRadius: [3, 3, 0, 0] },
          label: { show: true, position: "top", color: "#64748b", fontSize: 10 },
        },
      ],
    };
  }, [scoped]);

  /** 大小比分布（红区）——与奇偶比分布对称，此前只有奇偶有分布图 */
  const bigSmallOption = useMemo<EOption>(() => {
    const dist = bigSmallDist(scoped, cfg.redMax);
    return {
      grid: { left: 40, right: 16, top: 24, bottom: 28 },
      tooltip: {
        ...tooltipCfg(),
        formatter: oneSeries((p) => `大:小 ${p.name}：${p.value} 期`),
      },
      xAxis: { type: "category", data: dist.map((d) => d.label), ...AXIS },
      yAxis: { type: "value", ...AXIS, minInterval: 1, splitLine: { lineStyle: { color: "#e2e8f0" } } },
      series: [
        {
          type: "bar",
          data: dist.map((d) => d.count),
          itemStyle: { color: "#facc15", borderRadius: [3, 3, 0, 0] },
          label: { show: true, position: "top", color: "#64748b", fontSize: 10 },
        },
      ],
    };
  }, [scoped, cfg.redMax]);

  /** 跨度分布（红区最大号 − 最小号） */
  const spanOption = useMemo<EOption>(() => {
    const dist = spanDist(scoped);
    const spans = scoped.map((d) => Math.max(...d.red) - Math.min(...d.red));
    const m = mean(spans);
    // markLine 用分类标签定位（平均值落到最近的实际跨度值上）
    const nearest = dist.reduce((best, d) => (Math.abs(d.span - m) < Math.abs(best - m) ? d.span : best), dist[0]?.span ?? 0);
    return {
      grid: { left: 40, right: 16, top: 24, bottom: 28 },
      tooltip: {
        ...tooltipCfg(),
        formatter: oneSeries((p) => `跨度 ${p.name}：${p.value} 期`),
      },
      xAxis: { type: "category", data: dist.map((d) => String(d.span)), ...AXIS },
      yAxis: { type: "value", ...AXIS, minInterval: 1, splitLine: { lineStyle: { color: "#e2e8f0" } } },
      series: [
        {
          type: "bar",
          data: dist.map((d) => d.count),
          itemStyle: { color: BAR(["#7dd3fc", "#0369a1"]), borderRadius: [3, 3, 0, 0] },
          markLine: dist.length
            ? {
                symbol: "none",
                data: [{ xAxis: String(nearest) }],
                lineStyle: { color: "#fbbf24", type: "dashed" },
                label: { color: "#fbbf24", formatter: `均值 ${m.toFixed(1)}`, fontSize: 10 },
              }
            : undefined,
        },
      ],
    };
  }, [scoped]);

  /** 连号形态：0 / 1 / 2 组及以上的分布 */
  const consec = useMemo(() => consecStats(scoped), [scoped]);
  const consecOption = useMemo<EOption>(() => {
    return {
      grid: { left: 40, right: 16, top: 24, bottom: 28 },
      tooltip: {
        ...tooltipCfg(),
        formatter: oneSeries((p) => `${p.name}：${p.value} 期`),
      },
      xAxis: { type: "category", data: consec.dist.map((d) => d.label), ...AXIS },
      yAxis: { type: "value", ...AXIS, minInterval: 1, splitLine: { lineStyle: { color: "#e2e8f0" } } },
      series: [
        {
          type: "bar",
          data: consec.dist.map((d) => d.count),
          itemStyle: { color: "#a3e635", borderRadius: [3, 3, 0, 0] },
          label: { show: true, position: "top", color: "#64748b", fontSize: 10 },
        },
      ],
    };
  }, [consec]);

  /** 三分区分布（大乐透 1-12/13-24/25-35、双色球 1-11/12-22/23-33） */
  const zp = useMemo(() => zoneParts(scoped, cfg.redMax, 3), [scoped, cfg.redMax]);
  const zoneOption = useMemo<EOption>(() => {
    return {
      grid: { left: 48, right: 16, top: 28, bottom: 28 },
      legend: { top: 0, textStyle: { color: "#64748b", fontSize: 11 }, data: ["实际开出", "理论期望"] },
      tooltip: {
        ...tooltipCfg(),
        formatter: (ps: { seriesName: string; name: string; value: number }[]) => {
          const [actual, expect] = ps;
          return actual
            ? `${actual.name}<br/>实际 ${actual.value} 个<br/>期望 ${(expect?.value ?? 0).toFixed(1)} 个`
            : "";
        },
      },
      xAxis: { type: "category", data: zp.map((z) => `${z.from}-${z.to}`), ...AXIS },
      yAxis: { type: "value", ...AXIS, minInterval: 1, splitLine: { lineStyle: { color: "#e2e8f0" } } },
      series: [
        {
          type: "bar",
          name: "实际开出",
          data: zp.map((z) => z.count),
          itemStyle: { color: BAR(["#c4b5fd", "#6d28d9"]), borderRadius: [3, 3, 0, 0] },
          label: { show: true, position: "top", color: "#64748b", fontSize: 10 },
        },
        {
          // 各区号码占比不同（末段常少一个号），期望值逐区画线，不用单一平均值
          type: "line",
          name: "理论期望",
          data: zp.map((z) => Math.round(z.expected * 10) / 10),
          symbol: "none",
          lineStyle: { color: "#fbbf24", type: "dashed", width: 1.5 },
          itemStyle: { color: "#fbbf24" },
          tooltip: { show: false },
        },
      ],
    };
  }, [zp]);

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

  /** 各区「历史最长遗漏 / 平均间隔」画像（全部历史口径） */
  const gapBoards = useMemo(() => {
    const build = (infos: ReturnType<typeof numberInfos>) => ({
      maxOmission: [...infos].sort((a, b) => b.maxOmission - a.maxOmission).slice(0, 5),
      slowest: [...infos]
        .filter((i) => i.avgGap > 0)
        .sort((a, b) => b.avgGap - a.avgGap)
        .slice(0, 5),
    });
    return { red: build(redInfos), blue: build(blueInfos) };
  }, [redInfos, blueInfos]);

  const chip = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs tabular-nums";
  const subTitle = (extra?: string) => (
    <span className="ml-2 text-xs font-normal text-slate-500">
      {win === 0 ? "全部" : `近${win}期`}
      {extra ? ` · ${extra}` : ""}
    </span>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* 窗口切换 */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-500">统计范围</span>
        {WINDOWS.map((w) => (
          <button
            key={w}
            onClick={() => setWin(w)}
            aria-pressed={win === w}
            className={`rounded-lg px-3 py-1 text-xs transition-colors ${
              win === w ? "bg-red-100 text-slate-900" : "bg-slate-100 text-slate-500 hover:text-slate-900"
            }`}
          >
            {w === 0 ? "全部历史" : `近${w}期`}
          </button>
        ))}
      </div>

      {/* 全部历史时的已知数据特征提示（如大乐透 2007–2013 年高位号偏多） */}
      {win === 0 && cfg.historyNote && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-800/90">
          ℹ️ {cfg.historyNote}
        </p>
      )}

      {/* 冷热榜 */}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">
            {cfg.redName}冷热榜 <span className="text-xs font-normal text-slate-500">（{win === 0 ? "全部" : `近${win}期`}）</span>
          </h3>
          <div className="flex flex-col gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-10 text-slate-500">热号</span>
              {hotCold.red.hot.map((h) => (
                <span key={h.num} className={`${chip} bg-red-500/15 text-red-700`}>
                  {pad2(h.num)}·{h.count}次
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-10 text-slate-500">冷号</span>
              {hotCold.red.cold.map((h) => (
                <span key={h.num} className={`${chip} bg-slate-200/50 text-slate-600`}>
                  {pad2(h.num)}·{h.count}次
                </span>
              ))}
            </div>
          </div>
        </section>
        <section className="card">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">
            {cfg.blueName}冷热榜 <span className="text-xs font-normal text-slate-500">（{win === 0 ? "全部" : `近${win}期`}）</span>
          </h3>
          <div className="flex flex-col gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-10 text-slate-500">热号</span>
              {hotCold.blue.hot.map((h) => (
                <span key={h.num} className={`${chip} bg-blue-500/15 text-blue-700`}>
                  {pad2(h.num)}·{h.count}次
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-10 text-slate-500">冷号</span>
              {hotCold.blue.cold.map((h) => (
                <span key={h.num} className={`${chip} bg-slate-200/50 text-slate-600`}>
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
          <h3 className="mb-2 text-sm font-semibold text-slate-900">
            {cfg.redName}号码频率
            <span className="ml-2 text-xs font-normal text-slate-500">出现次数</span>
          </h3>
          <EChart option={redFreqOption} height={260} ariaLabel={`${cfg.redName}各号码的历史出现次数柱状图（含均值线）`} />
        </section>
        <section className="card">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">
            {cfg.blueName}号码频率
            <span className="ml-2 text-xs font-normal text-slate-500">出现次数</span>
          </h3>
          <EChart option={blueFreqOption} height={260} ariaLabel={`${cfg.blueName}各号码的历史出现次数柱状图（含均值线）`} />
        </section>
      </div>

      {/* 遗漏排行（红 / 蓝对称） */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">
            当前遗漏排行（{cfg.redName}）
            <span className="ml-2 text-xs font-normal text-slate-500">距最近一次开出 · 全部历史口径</span>
          </h3>
          <EChart option={omissionOption} height={260} ariaLabel="当前遗漏最深的号码条形图" />
          <div className="mt-3 flex flex-col gap-1.5 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-16 text-slate-500">最长遗漏</span>
              {gapBoards.red.maxOmission.map((t) => (
                <span key={t.num} className={`${chip} bg-amber-500/15 text-amber-700`}>
                  {pad2(t.num)}·{t.maxOmission}期
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-16 text-slate-500">平均间隔最久</span>
              {gapBoards.red.slowest.map((t) => (
                <span key={t.num} className={`${chip} bg-slate-200/50 text-slate-600`}>
                  {pad2(t.num)}·{t.avgGap.toFixed(1)}期
                </span>
              ))}
            </div>
          </div>
        </section>
        <section className="card">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">
            当前遗漏排行（{cfg.blueName}）
            <span className="ml-2 text-xs font-normal text-slate-500">距最近一次开出 · 全部历史口径</span>
          </h3>
          <EChart option={blueOmissionOption} height={260} ariaLabel="蓝区各号码的当前遗漏条形图" />
          <div className="mt-3 flex flex-col gap-1.5 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-16 text-slate-500">最长遗漏</span>
              {gapBoards.blue.maxOmission.map((t) => (
                <span key={t.num} className={`${chip} bg-sky-500/15 text-sky-300`}>
                  {pad2(t.num)}·{t.maxOmission}期
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-16 text-slate-500">平均间隔最久</span>
              {gapBoards.blue.slowest.map((t) => (
                <span key={t.num} className={`${chip} bg-slate-200/50 text-slate-600`}>
                  {pad2(t.num)}·{t.avgGap.toFixed(1)}期
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* 形态分布：奇偶 / 大小 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">
            奇偶比分布（{cfg.redName}）{subTitle()}
          </h3>
          <EChart option={oddEvenOption} height={260} ariaLabel="奇偶比形态分布柱状图" />
        </section>
        <section className="card">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">
            大小比分布（{cfg.redName}）{subTitle(`大号 > ${cfg.redMax / 2}`)}
          </h3>
          <EChart option={bigSmallOption} height={260} ariaLabel="大小比形态分布柱状图" />
        </section>
      </div>

      {/* 跨度 / 连号 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">
            跨度分布（{cfg.redName}）{subTitle("最大号 − 最小号")}
          </h3>
          <EChart option={spanOption} height={260} ariaLabel="前区跨度分布柱状图（含均值线）" />
        </section>
        <section className="card">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">
            连号形态（{cfg.redName}）{subTitle(`${(consec.withConsecRate * 100).toFixed(1)}% 的期数含连号`)}
          </h3>
          <EChart option={consecOption} height={260} ariaLabel="每期连号组数分布柱状图" />
        </section>
      </div>

      {/* 和值：走势 + 分布 */}
      <section className="card">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">
          和值走势（{cfg.redName}）
          <span className="ml-2 text-xs font-normal text-slate-500">跟随统计范围，可缩放</span>
        </h3>
        <EChart option={sumOption} height={280} ariaLabel="和值走势折线图（含均值线）" />
      </section>

      <section className="card">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">
          和值分布（{cfg.redName}）
          {subTitle(`每 10 一箱 · 均值 ${sumStats.mean.toFixed(1)} · 中位数 ${sumStats.median.toFixed(1)}`)}
        </h3>
        <EChart option={sumHistOption} height={260} ariaLabel="和值分布直方图" />
      </section>

      {/* 三分区 */}
      <section className="card">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">
          号码区间分布（{cfg.redName}）{subTitle("号码池三等分")}
        </h3>
        <EChart option={zoneOption} height={260} ariaLabel="号码池三分区出现次数柱状图（含各区期望线）" />
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          以上均为历史统计描述：各区开出次数与其号码占比的期望值接近，长期波动属正常随机现象，
          不构成对任何号码的倾向判断。
        </p>
      </section>
    </div>
  );
}
