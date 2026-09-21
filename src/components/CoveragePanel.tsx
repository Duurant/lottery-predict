"use client";

import { useMemo } from "react";
import EChart, { type EOption } from "@/components/EChart";
import type { Draw, GameConfig } from "@/lib/games";
import { compareCoverage, type CoverageReport } from "@/lib/predict";

const pct = (x: number, digits = 2) => `${(x * 100).toFixed(digits)}%`;
const pp = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}pp`;
const pText = (p: number) => (p < 0.001 ? "<0.001" : p.toFixed(3));

const SERIES_COLORS: Record<string, string> = {
  最优方案: "#34d399",
  次优方案: "#a3e635",
  纯机选: "#64748b",
};

/**
 * 覆盖率实测面板：全量 walk-forward（每期只用该期之前的数据选号），
 * 把最优/次优与同注数的纯机选逐期配对比较。
 *
 * 刻意把两件事并列：
 *   1) 覆盖率（至少命中 k 个 / 至少中得某奖级）确实更高，并给出配对 95% CI 与 p 值；
 *   2) 单注平均命中与机选完全同水平——收益来自「减少同批各注之间的重复」，不是预测能力。
 * 只讲第 1 点会让人误以为可以预测，只讲第 2 点又埋掉了真实存在的覆盖差异。
 */
export default function CoveragePanel({
  cfg,
  draws,
  tickets,
  initialReport,
}: {
  cfg: GameConfig;
  draws: Draw[];
  tickets: number;
  /** 构建期预计算的全量报告（参数与当前一致时传入，免去水合时的全量 walk-forward） */
  initialReport?: CoverageReport;
}) {
  const report = useMemo(
    () => initialReport ?? compareCoverage(cfg, draws, tickets),
    [cfg, draws, tickets, initialReport]
  );

  const strategyNames = report.metrics[0]?.byStrategy.map((s) => s.name) ?? [];

  const chart = useMemo<EOption>(() => {
    const rows = [...report.metrics].reverse();
    const max = Math.max(
      ...report.metrics.map((m) => Math.max(m.randomBand[1], ...m.byStrategy.map((s) => s.cell.rate))),
      0.01
    );
    return {
      grid: { left: 132, right: 56, top: 30, bottom: 24 },
      legend: {
        top: 0,
        textStyle: { color: "#94a3b8", fontSize: 11 },
        data: [...strategyNames, "机选噪声带"],
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
        ...strategyNames.map((name, idx) => ({
          name,
          type: "bar" as const,
          barWidth: 11,
          itemStyle: { color: SERIES_COLORS[name] ?? "#94a3b8", borderRadius: [0, 3, 3, 0] as [number, number, number, number] },
          data: rows.map((m) => {
            const cell = m.byStrategy.find((s) => s.name === name);
            return Math.round((cell?.cell.rate ?? 0) * 10000) / 10000;
          }),
          ...(idx === 0
            ? {
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
              }
            : {}),
        })),
      ],
    };
  }, [report, strategyNames]);

  const oneTicket = report.tickets === 1;
  const randomDistinct = report.distinct.find((d) => d.id === "random");

  return (
    <section className="card">
      <h3 className="mb-1 text-sm font-semibold text-white">
        覆盖率实测：最优 / 次优 vs 纯机选
        <span className="ml-2 text-xs font-normal text-slate-500">
          全量 walk-forward · {report.draws} 期（{report.fromDate} ~ {report.toDate}）· {report.tickets} 注
        </span>
      </h3>
      <p className="mb-3 text-xs leading-relaxed text-slate-500">
        每期只用该期之前的历史数据选号，各方案与纯机选使用同一随机数流逐期配对比较；
        灰带是纯机选的 ±1.96 标准误范围——差异落进带内就只是随机波动。
      </p>

      <EChart option={chart} height={220} ariaLabel="三种方案的覆盖率对比条形图：最优/次优/纯机选在四个覆盖率指标上的实测占比，附机选噪声带" />

      <div className="overflow-x-auto">
        <table className="mt-2 w-full min-w-[720px] text-center text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="py-2 text-left font-normal">指标（每期「至少一注…」）</th>
              {strategyNames.map((n) => (
                <th key={n} className="py-2 font-normal">
                  {n}
                </th>
              ))}
              <th className="py-2 font-normal">纯机选</th>
              <th className="py-2 font-normal">机选解析基准</th>
              {strategyNames.map((n) => (
                <th key={`${n}-ci`} className="py-2 font-normal">
                  {n} vs 机选
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {report.metrics.map((m) => (
              <tr key={m.key} className="border-t border-slate-800/60">
                <td className="py-2 text-left text-slate-400" title={m.hint}>
                  {m.label}
                </td>
                {m.byStrategy.map((s) => (
                  <td
                    key={s.id}
                    className={`py-2 font-semibold ${s.cell.significant ? "text-emerald-300" : "text-slate-400"}`}
                  >
                    {pct(s.cell.rate)}
                  </td>
                ))}
                <td className="py-2 text-slate-400">{pct(m.random)}</td>
                <td className="py-2 text-slate-500">{pct(m.analytic)}</td>
                {m.byStrategy.map((s) => (
                  <td key={`${s.id}-d`} className={`py-2 ${s.cell.significant ? "text-emerald-300" : "text-slate-500"}`}>
                    <div>
                      {pp(s.cell.diff)}
                      {s.cell.significant && <span className="ml-1 text-emerald-400">★</span>}
                    </div>
                    <div className="text-[10px] leading-tight text-slate-400">
                      [{pp(s.cell.ci95[0])}, {pp(s.cell.ci95[1])}] p={pText(s.cell.p)}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        ★＝与机选的配对检验 p&lt;0.05。「机选解析基准」是 N 注独立随机的理论值（1−(1−p)^N），
        用于核对实测机选没有算错。
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {report.distinct.map((d) => (
          <div key={d.id} className="rounded-xl bg-slate-800/50 p-3">
            <div className="text-[11px] text-slate-500">平均覆盖不同号码 · {d.name}</div>
            <div className="mt-1 text-sm font-semibold tabular-nums text-white">
              {d.red.toFixed(1)}
              <span className="text-xs font-normal text-slate-500">
                {" "}
                / {report.redMax} ·{cfg.blueName} {d.blue.toFixed(1)} / {report.blueMax}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-xl bg-slate-800/50 p-3">
        <div className="text-[11px] text-slate-500">单注平均命中（诚实性对照：应与人选机选无显著差异）</div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold tabular-nums text-white">
          {report.honesty.byStrategy.map((h) => (
            <span key={h.id}>
              {h.name} {h.hits.toFixed(3)}
              <span className="text-xs font-normal text-slate-500"> (p={pText(h.p)})</span>
            </span>
          ))}
          <span className="text-xs font-normal text-slate-500">理论期望 {report.honesty.expectation.toFixed(3)}</span>
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        {oneTicket ? (
          <>
            注数为 1 时没有可铺开的空间，各方案与机选逐期完全相同（差异 0.00pp）。
            把注数调到 2 注以上才会出现覆盖收益。
          </>
        ) : (
          <>
            收益只出现在「同价位多注」这一层：{report.metrics
              .flatMap((m) => m.byStrategy.filter((s) => s.cell.significant).map((s) => `${s.name}的${m.label}`))
              .slice(0, 4)
              .join("、")}{" "}
            显著高于机选；而红区命中 ≥3 个这类指标与机选无显著差异（靠铺开没有用）。
            纯机选每期平均只覆盖 {randomDistinct?.red.toFixed(1)} 个不同{cfg.redName}号码，
            最优方案能覆盖到 {report.distinct.find((d) => d.id === "best")?.red.toFixed(1)} 个——
            <span className="text-slate-400">
              这减少的是「多注之间互相重复、白花注数」的浪费，不改变单注命中期望，也不提高中大奖的概率。
            </span>
          </>
        )}
      </p>
    </section>
  );
}
