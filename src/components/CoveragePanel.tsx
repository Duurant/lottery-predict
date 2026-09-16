"use client";

import { useMemo } from "react";
import EChart, { type EOption } from "@/components/EChart";
import type { Draw, GameConfig } from "@/lib/games";
import { compareCoverage } from "@/lib/predict";

const pct = (x: number, digits = 2) => `${(x * 100).toFixed(digits)}%`;
const pp = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}pp`;
const pText = (p: number) => (p < 0.001 ? "<0.001" : p.toFixed(3));

/**
 * 覆盖优化的实测面板：全量 walk-forward（每期只用该期之前的数据选号），
 * 把它与同注数的纯机选逐期配对比较。
 *
 * 这里刻意把两件事同时摆出来：
 *   1) 覆盖率（至少命中 k 个 / 至少中得某奖级）确实更高，且给出配对 95% 置信区间与 p 值；
 *   2) 单注平均命中与机选完全同水平——收益来自「减少同批各注之间的重复」，不是预测能力。
 * 只讲第 1 点会让人误以为可以预测，只讲第 2 点又埋掉了真实存在的覆盖差异，两者必须并列。
 */
export default function CoveragePanel({
  cfg,
  draws,
  tickets,
}: {
  cfg: GameConfig;
  draws: Draw[];
  tickets: number;
}) {
  const report = useMemo(() => compareCoverage(cfg, draws, tickets), [cfg, draws, tickets]);

  const chart = useMemo<EOption>(() => {
    const rows = [...report.metrics].reverse();
    const max = Math.max(...report.metrics.map((m) => Math.max(m.cover, m.random, m.ci95[1])), 0.01);
    return {
      grid: { left: 132, right: 56, top: 30, bottom: 24 },
      legend: {
        top: 0,
        textStyle: { color: "#94a3b8", fontSize: 11 },
        data: ["覆盖优化", "纯机选", "机选噪声带"],
      },
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: "rgba(15,23,42,0.95)",
        borderColor: "#334155",
        textStyle: { color: "#e2e8f0", fontSize: 12 },
        // trigger: "axis" 时 formatter 收到的是参数数组，必须按数组处理
        formatter: (ps: { seriesName: string; name: string; value: number }[]) => {
          const p = ps[0];
          const lines = ps
            .filter((x) => x.seriesName !== "机选噪声带")
            .map((x) => `${x.seriesName}：${pct(x.value)}`);
          return `${p.name}<br/>${lines.join("<br/>")}`;
        },
      },
      xAxis: {
        type: "value",
        max: Math.ceil(max * 105) / 100,
        axisLabel: { color: "#94a3b8", fontSize: 10, formatter: (v: number) => `${Math.round(v * 100)}%` },
        splitLine: { lineStyle: { color: "#1e293b" } },
      },
      yAxis: {
        type: "category",
        data: rows.map((m) => m.label),
        axisLabel: { color: "#94a3b8", fontSize: 11 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      series: [
        {
          name: "覆盖优化",
          type: "bar",
          barWidth: 13,
          itemStyle: { color: "#34d399", borderRadius: [0, 4, 4, 0] },
          data: rows.map((m) => Math.round(m.cover * 10000) / 10000),
        },
        {
          name: "纯机选",
          type: "bar",
          barWidth: 13,
          itemStyle: { color: "#64748b", borderRadius: [0, 4, 4, 0] },
          data: rows.map((m) => Math.round(m.random * 10000) / 10000),
          // 机选基准的 ±1.96SE 噪声带：差异若落在这条带内，就只是随机波动
          markArea: {
            silent: true,
            itemStyle: { color: "rgba(148,163,184,0.16)" },
            data: rows.map(
              (m) =>
                [
                  { yAxis: m.label, xAxis: Math.round(m.randomBand[0] * 10000) / 10000 },
                  { xAxis: Math.round(m.randomBand[1] * 10000) / 10000 },
                ] as [{ yAxis: string; xAxis: number }, { xAxis: number }]
            ),
          },
        },
      ],
    };
  }, [report]);

  const sigRows = report.metrics.filter((m) => m.significant);
  const oneTicket = report.tickets === 1;

  return (
    <section className="card">
      <h3 className="mb-1 text-sm font-semibold text-white">
        覆盖优化 vs 纯机选
        <span className="ml-2 text-xs font-normal text-slate-500">
          全量 walk-forward · {report.draws} 期（{report.fromDate} ~ {report.toDate}）· {report.tickets} 注
        </span>
      </h3>
      <p className="mb-3 text-xs leading-relaxed text-slate-500">
        每期只用该期之前的历史数据选号，覆盖优化与纯机选使用同一随机数流逐期配对比较；
        灰带是纯机选的 ±1.96 标准误范围——差异落进带内就只是随机波动。
      </p>

      <EChart option={chart} height={220} />

      <div className="overflow-x-auto">
        <table className="mt-2 w-full min-w-[620px] text-center text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="py-2 text-left font-normal">指标（每期「至少一注…」）</th>
              <th className="py-2 font-normal">覆盖优化</th>
              <th className="py-2 font-normal">纯机选</th>
              <th className="py-2 font-normal">机选解析基准</th>
              <th className="py-2 font-normal">差值 95% CI</th>
              <th className="py-2 font-normal">p 值</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {report.metrics.map((m) => (
              <tr
                key={m.key}
                className={`border-t border-slate-800/60 ${m.significant ? "text-emerald-300" : "text-slate-400"}`}
              >
                <td className="py-2 text-left" title={m.hint}>
                  {m.label}
                </td>
                <td className="py-2 font-semibold">{pct(m.cover)}</td>
                <td className="py-2">{pct(m.random)}</td>
                <td className="py-2 text-slate-500">{pct(m.analytic)}</td>
                <td className="py-2">
                  {pp(m.diff)} [{pp(m.ci95[0])}, {pp(m.ci95[1])}]
                </td>
                <td className="py-2">
                  {pText(m.p)}
                  {m.significant && <span className="ml-1 text-emerald-400">★</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-800/50 p-3">
          <div className="text-[11px] text-slate-500">平均覆盖不同{cfg.redName}号码</div>
          <div className="mt-1 text-sm font-semibold tabular-nums text-white">
            {report.distinct.coverRed.toFixed(1)}
            <span className="text-xs font-normal text-slate-500">
              {" "}
              / {report.distinct.redMax} ·机选 {report.distinct.randomRed.toFixed(1)}
            </span>
          </div>
        </div>
        <div className="rounded-xl bg-slate-800/50 p-3">
          <div className="text-[11px] text-slate-500">平均覆盖不同{cfg.blueName}号码</div>
          <div className="mt-1 text-sm font-semibold tabular-nums text-white">
            {report.distinct.coverBlue.toFixed(1)}
            <span className="text-xs font-normal text-slate-500">
              {" "}
              / {report.distinct.blueMax} ·机选 {report.distinct.randomBlue.toFixed(1)}
            </span>
          </div>
        </div>
        <div className="rounded-xl bg-slate-800/50 p-3">
          <div className="text-[11px] text-slate-500">单注平均命中（诚实性对照）</div>
          <div className="mt-1 text-sm font-semibold tabular-nums text-white">
            {report.honesty.coverHits.toFixed(3)}
            <span className="text-xs font-normal text-slate-500">
              {" "}
              vs 机选 {report.honesty.randomHits.toFixed(3)} · 期望 {report.honesty.expectation.toFixed(3)}
            </span>
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        {oneTicket ? (
          <>
            注数为 1 时没有可铺开的空间，覆盖优化与机选逐期完全相同（差异 0.00pp）。
            把注数调到 2 注以上才会出现覆盖收益。
          </>
        ) : (
          <>
            覆盖优化的收益只出现在「同价位多注」这一层：{sigRows.map((m) => m.label).join("、")}
            {sigRows.length ? " 显著高于机选" : "与机选无显著差异"}
            {report.metrics.some((m) => !m.significant)
              ? `；而 ${report.metrics
                  .filter((m) => !m.significant)
                  .map((m) => m.label)
                  .join("、")} 与机选无显著差异（如需红区命中 ≥3 个，靠铺开没有用）`
              : ""}
            。注意上表最后一行：单注平均命中与机选、与理论期望
            {report.honesty.p >= 0.05 ? "均无显著差异" : "存在差异（需警惕）"}
            （p={pText(report.honesty.p)}）——铺开不改变单注命中期望，也不提高中大奖的概率，
            它只减少了「同一批注之间互相重复、白花注数」的浪费。
          </>
        )}
      </p>
    </section>
  );
}
