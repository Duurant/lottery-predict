"use client";

import { useMemo, useState } from "react";
import Ball from "@/components/Ball";
import Disclaimer from "@/components/Disclaimer";
import EChart, { type EOption } from "@/components/EChart";
import { backtestAll, runStrategy, STRATEGIES, type Pick, type StrategyId } from "@/lib/predict";
import { GAMES, type Draw, type GameKey } from "@/lib/games";

const TAG_STYLE: Record<Pick["tag"], string> = {
  热: "bg-red-500/20 text-red-300",
  回补: "bg-blue-500/20 text-blue-300",
  偏冷: "bg-amber-500/20 text-amber-300",
  均衡: "bg-slate-600/40 text-slate-300",
};

const COUNT_OPTIONS = [1, 3, 5, 8];

function PickBalls({ picks, zone }: { picks: Pick[]; zone: "red" | "blue" }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {picks.map((p) => (
        <span key={p.num} className="relative group">
          <Ball n={p.num} zone={zone} size="md" />
          <span
            className={`absolute -top-1.5 -right-1.5 rounded-full px-1 text-[9px] leading-[14px] ${TAG_STYLE[p.tag]}`}
            title={`近30期出现 ${p.recent} 次 · 当前遗漏 ${p.omission} 期`}
          >
            {p.tag}
          </span>
        </span>
      ))}
    </div>
  );
}

export default function PredictView({
  drawsOf,
}: {
  drawsOf: Record<GameKey, Draw[]>;
}) {
  const [game, setGame] = useState<GameKey>("dlt");
  const [strategy, setStrategy] = useState<StrategyId>("mix");
  const [count, setCount] = useState(5);
  // 初始种子固定（1），保证静态页 SSR 与客户端首帧一致、无水合警告；
  // 点击「换一批」才会随机换种。
  const [seed, setSeed] = useState(1);

  const cfg = GAMES[game];
  const draws = drawsOf[game];

  const result = useMemo(
    () => (draws.length ? runStrategy(cfg, draws, strategy, count, seed) : null),
    [cfg, draws, strategy, count, seed]
  );

  const comparison = useMemo(
    () => (draws.length ? backtestAll(cfg, draws) : []),
    [cfg, draws]
  );

  const comparisonChart = useMemo<EOption>(() => {
    const nameOf = (id: string) => STRATEGIES.find((s) => s.id === id)?.name ?? id;
    return {
      grid: { left: 100, right: 40, top: 16, bottom: 28 },
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: "rgba(15,23,42,0.95)",
        borderColor: "#334155",
        textStyle: { color: "#e2e8f0", fontSize: 12 },
        formatter: (ps: { name: string; value: number }[]) => {
          const p = ps[0];
          return `${p.name}：平均每期命中 ${p.value.toFixed(3)} 个`;
        },
      },
      xAxis: { type: "value", axisLabel: { color: "#94a3b8", fontSize: 10 }, splitLine: { lineStyle: { color: "#1e293b" } } },
      yAxis: {
        type: "category",
        data: comparison.map((b) => nameOf(b.strategy)).reverse(),
        axisLabel: { color: "#94a3b8", fontSize: 11 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      series: [
        {
          type: "bar",
          data: comparison.map((b) => Math.round(b.avgHits * 1000) / 1000).reverse(),
          barWidth: 16,
          itemStyle: { color: "#f87171", borderRadius: [0, 4, 4, 0] },
          markLine: {
            symbol: "none",
            data: comparison.length
              ? [{ xAxis: Math.round(comparison[0].expectation * 1000) / 1000 }]
              : [],
            lineStyle: { color: "#fbbf24", type: "dashed" },
            label: {
              color: "#fbbf24",
              formatter: `随机期望 ${comparison[0]?.expectation.toFixed(3) ?? ""}`,
              fontSize: 10,
            },
          },
        },
      ],
    };
  }, [comparison]);

  const gameBtn = (g: GameKey, label: string) => (
    <button
      key={g}
      onClick={() => setGame(g)}
      className={`rounded-xl px-5 py-2 text-sm font-medium transition-colors ${
        game === g ? "bg-red-600 text-white shadow" : "bg-slate-900 text-slate-400 hover:text-white"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-5">
      <section className="pt-2 text-center">
        <h1 className="text-2xl font-bold text-white">多方案智能预测</h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-400">
          五种统计思路各有一套推荐逻辑，同一份数据、不同方案，结果各有侧重，并附历史回测对比。
        </p>
      </section>

      <Disclaimer />

      {draws.length === 0 ? (
        <p className="card text-center text-sm text-slate-500">
          暂无数据，请先运行 npm run fetch 抓取开奖数据。
        </p>
      ) : (
        <>
          {/* 彩种切换 */}
          <div className="flex justify-center gap-2">
            {gameBtn("dlt", "超级大乐透")}
            {gameBtn("ssq", "双色球")}
          </div>

          {/* 方案选择 */}
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {STRATEGIES.map((s) => (
              <button
                key={s.id}
                onClick={() => setStrategy(s.id)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  strategy === s.id
                    ? "border-red-500/60 bg-red-500/10"
                    : "border-slate-800 bg-slate-900/60 hover:border-slate-600"
                }`}
              >
                <div className={`text-sm font-semibold ${strategy === s.id ? "text-red-300" : "text-white"}`}>
                  {s.name}
                </div>
                <div className="mt-1 text-[11px] leading-snug text-slate-500">{s.tagline}</div>
              </button>
            ))}
          </div>

          {/* 推荐结果 */}
          {result && (
            <section className="card">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-bold text-white">
                  {result.strategy.name}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    基于 {draws.length} 期历史 · 近 30 期窗口
                  </span>
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">注数</span>
                  <select
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200"
                  >
                    {COUNT_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c} 注
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setSeed(Math.floor(Math.random() * 2 ** 31))}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500"
                  >
                    ⟳ 换一批
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {result.combos.map((c, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-800/70 bg-slate-900/40 px-4 py-3"
                  >
                    <span className="w-10 text-xs text-slate-500">第 {i + 1} 注</span>
                    <PickBalls picks={c.red} zone="red" />
                    <span className="text-slate-600">+</span>
                    <PickBalls picks={c.blue} zone="blue" />
                    <span className="ml-auto text-xs tabular-nums text-slate-500">
                      和值 <span className="text-amber-300/90">{c.sum}</span> · 奇偶 {c.oddEven} · 大小{" "}
                      {c.bigSmall}
                    </span>
                  </div>
                ))}
              </div>

              <p className="mt-3 text-[11px] text-slate-600">
                号码角标：热＝近 30 期高频；回补＝遗漏明显超过自身节奏；偏冷＝遗漏偏高；均衡＝无显著特征。
                悬停号码可查看具体频次与遗漏。
              </p>
            </section>
          )}

          {/* 方案说明 + 分析 */}
          {result && (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="card">
                <h3 className="mb-2 text-sm font-semibold text-white">方案思路</h3>
                <p className="text-sm leading-relaxed text-slate-400">{result.strategy.description}</p>

                <h4 className="mb-2 mt-4 text-sm font-semibold text-white">近期形态参考</h4>
                <ul className="flex flex-col gap-1.5 text-xs text-slate-400">
                  <li>
                    推荐组合和值区间：
                    <span className="text-amber-300/90">
                      {result.analysis.sumRange[0]} ~ {result.analysis.sumRange[1]}
                    </span>
                    （近 100 期和值均值 ± 1.2σ）
                  </li>
                  <li>
                    近 30 期奇偶比高频形态：
                    {result.analysis.oddEvenDist.slice(0, 3).map(([k, v]) => (
                      <span key={k} className="ml-1.5 rounded bg-slate-800 px-1.5 py-0.5 tabular-nums">
                        {k}（{v}期）
                      </span>
                    ))}
                  </li>
                  <li className="flex flex-wrap items-center gap-1.5">
                    近 30 期热号：
                    {result.analysis.hotTop.map((h) => (
                      <span key={h.num} className="rounded bg-red-500/15 px-1.5 py-0.5 text-red-300 tabular-nums">
                        {String(h.num).padStart(2, "0")}·{h.count}次
                      </span>
                    ))}
                  </li>
                  <li className="flex flex-wrap items-center gap-1.5">
                    当前遗漏最深：
                    {result.analysis.coldTop.map((h) => (
                      <span key={h.num} className="rounded bg-slate-700/50 px-1.5 py-0.5 text-slate-300 tabular-nums">
                        {String(h.num).padStart(2, "0")}·遗漏{h.omission}期
                      </span>
                    ))}
                  </li>
                </ul>
              </section>

              <section className="card">
                <h3 className="mb-2 text-sm font-semibold text-white">
                  本方案历史回测
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    最近 {result.analysis.backtest.draws} 期 · 每期用此前数据选号
                  </span>
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div className="rounded-xl bg-slate-800/50 p-3 text-center">
                    <div className="text-lg font-bold tabular-nums text-white">
                      {result.analysis.backtest.avgHits.toFixed(3)}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">平均每期命中</div>
                  </div>
                  <div className="rounded-xl bg-slate-800/50 p-3 text-center">
                    <div className="text-lg font-bold tabular-nums text-amber-300">
                      {result.analysis.backtest.expectation.toFixed(3)}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">随机期望命中</div>
                  </div>
                  <div className="rounded-xl bg-slate-800/50 p-3 text-center">
                    <div className="text-lg font-bold tabular-nums text-white">
                      {(result.analysis.backtest.zeroRate * 100).toFixed(0)}%
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">颗粒无收占比</div>
                  </div>
                  <div className="rounded-xl bg-slate-800/50 p-3 text-center">
                    <div className="text-lg font-bold tabular-nums text-white">
                      {result.analysis.backtest.bestHits}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">最佳单期命中</div>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  回测中每期只用该期之前的历史数据选号，命中数＝推荐号码与实际开奖的交集（红区+蓝区）。
                  可以看到各方案的平均命中都与随机期望处于同一水平——这正是随机事件的本质，请把推荐当娱乐，不要当依据。
                </p>
              </section>
            </div>
          )}

          {/* 方案对比 */}
          {comparison.length > 0 && (
            <section className="card">
              <h3 className="mb-1 text-sm font-semibold text-white">
                五方案回测对比（{cfg.name}）
                <span className="ml-2 text-xs font-normal text-slate-500">
                  最近 {comparison[0].draws} 期平均每期命中个数
                </span>
              </h3>
              <EChart option={comparisonChart} height={220} />
              <div className="overflow-x-auto">
                <table className="mt-2 w-full min-w-[560px] text-center text-xs">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="py-2 text-left font-normal">方案</th>
                      <th className="py-2 font-normal">平均命中</th>
                      <th className="py-2 font-normal">红区命中</th>
                      <th className="py-2 font-normal">蓝区命中</th>
                      <th className="py-2 font-normal">颗粒无收</th>
                      <th className="py-2 font-normal">最佳单期</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {comparison.map((b) => {
                      const def = STRATEGIES.find((s) => s.id === b.strategy)!;
                      const isCurrent = b.strategy === strategy;
                      return (
                        <tr
                          key={b.strategy}
                          className={`border-t border-slate-800/60 ${isCurrent ? "text-red-300" : "text-slate-300"}`}
                        >
                          <td className="py-2 text-left">
                            {def.name}
                            {isCurrent && <span className="ml-1.5 text-[10px]">←当前</span>}
                          </td>
                          <td className="py-2 font-semibold">{b.avgHits.toFixed(3)}</td>
                          <td className="py-2">{b.avgRedHits.toFixed(2)}</td>
                          <td className="py-2">{b.avgBlueHits.toFixed(2)}</td>
                          <td className="py-2">{(b.zeroRate * 100).toFixed(0)}%</td>
                          <td className="py-2">{b.bestHits}</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-slate-800/60 text-slate-500">
                      <td className="py-2 text-left">随机期望</td>
                      <td className="py-2">{comparison[0].expectation.toFixed(3)}</td>
                      <td className="py-2" colSpan={4}>
                        纯随机选号的理论平均命中（({cfg.redCount}²/{cfg.redMax}) + ({cfg.blueCount}²/
                        {cfg.blueMax})）
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
