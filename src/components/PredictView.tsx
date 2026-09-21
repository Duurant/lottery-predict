"use client";

import { useEffect, useMemo, useState } from "react";
import Ball from "@/components/Ball";
import CopyButton from "@/components/CopyButton";
import CoveragePanel from "@/components/CoveragePanel";
import Disclaimer from "@/components/Disclaimer";
import EChart, { type EOption } from "@/components/EChart";
import GameSwitch, { type ComboKey } from "@/components/GameSwitch";
import {
  backtestAll,
  runStrategy,
  STRATEGIES,
  type BacktestResult,
  type Combo,
  type CoverageReport,
  type Pick,
  type StrategyId,
  type StrategyResult,
} from "@/lib/predict";
import { GAMES, type GameKey } from "@/lib/games";
import { decodeDraws, type CompactDraws } from "@/lib/compact";
import { singleTicketHitVariance } from "@/lib/prize";

/** 初始参数（大乐透 / best / 5 注 / seed 1）在构建期的预计算结果，见 predict/page.tsx */
export interface PredictInitial {
  result: StrategyResult;
  comparison: BacktestResult[];
  coverage: CoverageReport;
}

/**
 * 徽章悬停依据。数字来自 `npm run fit`（全量 walk-forward + 配对检验，5 注，
 * 见 scripts/fit-coverage.mjs / .verify/fit-report.json）——不是营销话术：
 * 说的是「同价位多注的覆盖率」，不是「单注命中率」。
 */
const BEST_BADGE_TITLE =
  "实测依据（npm run fit，全量 walk-forward 配对检验，5 注）：「至少中得某奖级」大乐透 33.7% vs 机选 29.5%（+4.2pp, p=0.016）、双色球 30.9% vs 27.1%（+3.8pp, p<0.001）；「蓝区至少命中 1 个」大乐透 98.5% vs 85.7%、双色球 29.8% vs 25.5%。单注平均命中与机选无显著差异——提高的是同价位至少中得一注的机会，不是单注命中率。";

const SECOND_BADGE_TITLE =
  "在「覆盖率不显著下降」的前提下取最小铺开强度（拟合判据：与最优差距 ≤1SE）。实测 5 注验证段：大乐透「至少中奖」33.8% vs 机选 29.5%（+4.3pp, p=0.011）、双色球 30.0% vs 27.1%（+2.9pp, p=0.004）——两种方案都显著高于机选，差异在噪声量级内。真正的区别是号码铺得多开：次优的号码更集中（大乐透 5 注平均覆盖 24.4 个不同前区号，最优为 25.0）。";

const COUNT_OPTIONS = [1, 3, 5, 8];

const fmtPct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** 纯文本号码串（复制用）：红区补零空格分隔 + 蓝区 */
function comboText(c: Combo): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return c.red.map((p) => pad(p.num)).join(" ") + " + " + c.blue.map((p) => pad(p.num)).join(" ");
}

function PickBalls({ picks, zone }: { picks: Pick[]; zone: "red" | "blue" }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {picks.map((p) => (
        <span key={p.num} title={`近 30 期出现 ${p.recent} 次 · 当前遗漏 ${p.omission} 期`}>
          <Ball n={p.num} zone={zone} size="md" />
        </span>
      ))}
    </div>
  );
}

export default function PredictView({
  compactOf,
  initial,
}: {
  compactOf: Record<GameKey, CompactDraws>;
  initial: PredictInitial | null;
}) {
  const [game, setGame] = useState<GameKey>("dlt");
  const [strategy, setStrategy] = useState<StrategyId>("best");
  const [count, setCount] = useState(5);
  // 初始种子固定（1），保证静态页 SSR 与客户端首帧一致、无水合警告；
  // 点击「换一批」才会随机换种。
  const [seed, setSeed] = useState(1);

  const cfg = GAMES[game];
  const draws = useMemo(
    () => decodeDraws(compactOf[game]),
    [compactOf, game]
  );

  // ?g= 深链：从排列五页面切回时直接打开对应彩种（挂载后读取，避免水合不一致）
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("g");
    if (q === "ssq" || q === "dlt") setGame(q);
  }, []);

  // 初始参数（dlt / best / 5 注 / seed 1）直接用构建期预计算结果，水合零回测；
  // 参数一变就回落到客户端重算（与预计算同函数同口径）
  const isInitialParams = game === "dlt" && strategy === "best" && count === 5 && seed === 1;

  const result = useMemo(
    () =>
      isInitialParams && initial?.result
        ? initial.result
        : draws.length
          ? runStrategy(cfg, draws, strategy, count, seed)
          : null,
    [cfg, draws, strategy, count, seed, isInitialParams, initial]
  );

  const comparison = useMemo(
    () =>
      isInitialParams && initial?.comparison
        ? initial.comparison
        : draws.length
          ? backtestAll(cfg, draws, count)
          : [],
    [cfg, draws, count, isInitialParams, initial]
  );

  /** 回测图上的噪声带：随机期望 ±1.96SE（SE = sqrt(单注命中方差 / 回测期数)） */
  const noiseBand = useMemo(() => {
    if (!comparison.length) return null;
    const n = Math.max(comparison[0].draws, 1);
    const se = Math.sqrt(singleTicketHitVariance(cfg) / n);
    const e = comparison[0].expectation;
    return {
      lo: Math.round((e - 1.96 * se) * 1000) / 1000,
      hi: Math.round((e + 1.96 * se) * 1000) / 1000,
    };
  }, [comparison, cfg]);

  const comparisonChart = useMemo<EOption>(() => {
    const nameOf = (id: string) => STRATEGIES.find((s) => s.id === id)?.name ?? id;
    return {
      grid: { left: 100, right: 40, top: 16, bottom: 28 },
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: "rgba(15,23,42,0.95)",
        borderColor: "#334155",
        textStyle: { color: "#e2e8f0", fontSize: 12 },
        // trigger: "axis" 时 formatter 收到的是参数数组，必须按数组处理
        formatter: (ps: { name: string; value: number }[]) => {
          const p = ps[0];
          return `${p.name}：平均每期命中 ${p.value.toFixed(3)} 个`;
        },
      },
      xAxis: {
        type: "value",
        axisLabel: { color: "#94a3b8", fontSize: 10 },
        splitLine: { lineStyle: { color: "#1e293b" } },
      },
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
          // 噪声带：同一期望下，仅凭随机波动就可能出现的范围。三个方案都落在带内，
          // 说明它们的单注命中差异没有超出噪声——这正是「看起来更高」与「真的更高」的分界。
          markArea: noiseBand
            ? {
                silent: true,
                itemStyle: { color: "rgba(251,191,36,0.12)" },
                data: [[{ xAxis: noiseBand.lo }, { xAxis: noiseBand.hi }]],
                label: {
                  show: true,
                  position: "insideTop",
                  color: "#fbbf24",
                  fontSize: 10,
                  formatter: "噪声带 ±1.96SE",
                },
              }
            : undefined,
          markLine: {
            symbol: "none",
            data: comparison.length ? [{ xAxis: Math.round(comparison[0].expectation * 1000) / 1000 }] : [],
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
  }, [comparison, noiseBand]);

  const switchGame = (g: ComboKey) => {
    if (g !== game) setGame(g);
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="pt-2 text-center">
        <h1 className="text-2xl font-bold text-white">多方案智能预测</h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-400">
          三种方案：最优（覆盖优化·最大铺开）、次优（覆盖优化·温和铺开）、纯机选（对照）。
          它们都不预测号码，区别只在「同价位多注之间如何分配号码」。
        </p>
      </section>

      <Disclaimer />

      {draws.length === 0 ? (
        <p className="card text-center text-sm text-slate-500">
          数据暂时不可用，请稍后再来。
        </p>
      ) : (
        <>
          <GameSwitch section="predict" active={game} onSelect={switchGame} />

          {/* 方案选择 */}
          <div className="grid gap-2 sm:grid-cols-3">
            {STRATEGIES.map((s) => {
              const active = strategy === s.id;
              const isBest = s.id === "best";
              const isSecond = s.id === "second";
              const accent = isBest ? "emerald" : isSecond ? "lime" : "slate";
              return (
                <button
                  key={s.id}
                  onClick={() => setStrategy(s.id)}
                  aria-pressed={active}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    active
                      ? isBest
                        ? "border-emerald-400/70 bg-emerald-500/10"
                        : isSecond
                          ? "border-lime-400/70 bg-lime-500/10"
                          : "border-red-500/60 bg-red-500/10"
                      : isBest
                        ? "border-emerald-500/40 bg-slate-900/60 hover:border-emerald-400/70"
                        : isSecond
                          ? "border-lime-500/40 bg-slate-900/60 hover:border-lime-400/70"
                          : "border-slate-800 bg-slate-900/60 hover:border-slate-600"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-sm font-semibold ${
                        active
                          ? isBest
                            ? "text-emerald-300"
                            : isSecond
                              ? "text-lime-300"
                              : "text-red-300"
                          : "text-white"
                      }`}
                    >
                      {s.name}
                    </span>
                    {isBest && (
                      <span
                        title={BEST_BADGE_TITLE}
                        className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300"
                      >
                        实测最优
                      </span>
                    )}
                    {isSecond && (
                      <span
                        title={SECOND_BADGE_TITLE}
                        className="rounded-full bg-lime-500/20 px-1.5 py-0.5 text-[10px] font-medium text-lime-300"
                      >
                        号码更集中
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] leading-snug text-slate-500">{s.tagline}</div>
                </button>
              );
            })}
          </div>

          {/* 推荐结果 */}
          {result && (
            <section className="card">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-bold text-white">
                  {result.strategy.name}
                  {result.strategy.id === "best" && (
                    <span
                      title={BEST_BADGE_TITLE}
                      className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 align-middle text-[10px] font-medium text-emerald-300"
                    >
                      实测最优
                    </span>
                  )}
                  {result.strategy.id === "second" && (
                    <span
                      title={SECOND_BADGE_TITLE}
                      className="ml-2 rounded-full bg-lime-500/20 px-2 py-0.5 align-middle text-[10px] font-medium text-lime-300"
                    >
                      号码更集中
                    </span>
                  )}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    基于 {draws.length} 期历史 · 近 30 期窗口
                  </span>
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">注数</span>
                  <select
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    aria-label="注数"
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
                  <CopyButton
                    label="复制全部"
                    className="bg-slate-800 px-3 py-1.5 text-sm"
                    text={result.combos.map(comboText).join("\n")}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {result.combos.map((c, i) => (
                  <div
                    key={`${c.red.map((p) => p.num).join("-")}|${c.blue.map((p) => p.num).join("-")}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-800/70 bg-slate-900/40 px-4 py-3"
                  >
                    <span className="w-10 text-xs text-slate-500">第 {i + 1} 注</span>
                    <PickBalls picks={c.red} zone="red" />
                    <span className="text-slate-400">+</span>
                    <PickBalls picks={c.blue} zone="blue" />
                    <span className="text-xs tabular-nums text-slate-500">
                      和值 <span className="text-amber-300/90">{c.sum}</span> · 奇偶 {c.oddEven} · 大小{" "}
                      {c.bigSmall}
                    </span>
                    <CopyButton text={comboText(c)} className="ml-auto" />
                  </div>
                ))}
              </div>

              <p className="mt-3 text-[11px] text-slate-400">
                悬停号码可查看该号近 30 期出现次数与当前遗漏（纯历史统计，不参与选号）。
                {result.strategy.id === "random"
                  ? "本方案各注之间可能重复覆盖同一号码，这正是机选的浪费所在。"
                  : "本方案的各注之间会尽量避开重复号码，因此同一批覆盖的号码更多。"}
              </p>
            </section>
          )}

          {/* 覆盖率实测：三种方案并列 */}
          {result && (
            <CoveragePanel
              cfg={cfg}
              draws={draws}
              tickets={count}
              initialReport={game === "dlt" && count === 5 ? initial?.coverage : undefined}
            />
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
                    近 30 期热号（仅统计参考，不参与选号）：
                    {result.analysis.hotTop.map((h) => (
                      <span key={h.num} className="rounded bg-red-500/15 px-1.5 py-0.5 text-red-300 tabular-nums">
                        {String(h.num).padStart(2, "0")}·{h.count}次
                      </span>
                    ))}
                  </li>
                  <li className="flex flex-wrap items-center gap-1.5">
                    当前遗漏最深（仅统计参考，不参与选号）：
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
                    最近 {result.analysis.backtest.draws} 期 · {result.analysis.backtest.tickets} 注 · 每期用此前数据选号
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
                      {(result.analysis.backtest.zeroAllRate * 100).toFixed(0)}%
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500" title="该批全部注都没命中任何号码的期数占比">
                      全注落空占比
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-800/50 p-3 text-center">
                    <div className="text-lg font-bold tabular-nums text-white">
                      {result.analysis.backtest.bestHits}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">最佳单期命中</div>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  回测中每期只用该期之前的历史数据选号，单注命中数＝该注号码与实际开奖的交集（红区+蓝区），
                  再按注数平均。三个方案的「平均每期命中」都落在黄色噪声带内、与随机期望同水平——
                  这正是随机事件的本质：单注命中不因选号方式而改变。
                  {result.strategy.id !== "random" && (
                    <> 覆盖优化真正的差异在上方的覆盖率口径上，而不是这里。</>
                  )}
                </p>
              </section>
            </div>
          )}

          {/* 方案对比 */}
          {comparison.length > 0 && (
            <section className="card">
              <h3 className="mb-1 text-sm font-semibold text-white">
                三方案回测对比（{cfg.name}）
                <span className="ml-2 text-xs font-normal text-slate-500">
                  最近 {comparison[0].draws} 期 · {comparison[0].tickets} 注 · 平均命中按注数平均
                </span>
              </h3>
              <EChart option={comparisonChart} height={200} ariaLabel="三种方案的单注平均命中对比条形图，附随机期望与噪声带" />
              <p className="mb-2 text-[11px] leading-relaxed text-slate-400">
                黄色带＝随机期望 ±1.96 标准误（
                {noiseBand ? `${noiseBand.lo.toFixed(3)} ~ ${noiseBand.hi.toFixed(3)}` : ""}）：只统计{" "}
                {comparison[0].draws} 期时，仅凭随机波动就会出现这么大范围的高低差，落在带内说明差异不超出噪声。
                「至少中奖」按官方奖级表判定，允许红蓝命中落在同一批的任意一注上。
              </p>
              <div className="overflow-x-auto">
                <table className="mt-2 w-full min-w-[640px] text-center text-xs">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="py-2 text-left font-normal">方案</th>
                      <th className="py-2 font-normal">平均命中</th>
                      <th className="py-2 font-normal">红区命中</th>
                      <th className="py-2 font-normal">蓝区命中</th>
                      <th className="py-2 font-normal">至少中奖</th>
                      <th className="py-2 font-normal">全注落空</th>
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
                          className={`border-t border-slate-800/60 ${
                            isCurrent ? "text-emerald-300" : "text-slate-300"
                          }`}
                        >
                          <td className="py-2 text-left">
                            {def.name}
                            {isCurrent && <span className="ml-1.5 text-[10px]">←当前</span>}
                          </td>
                          <td className="py-2 font-semibold">{b.avgHits.toFixed(3)}</td>
                          <td className="py-2">{b.avgRedHits.toFixed(2)}</td>
                          <td className="py-2">{b.avgBlueHits.toFixed(2)}</td>
                          <td className="py-2">{fmtPct(b.anyPrizeRate)}</td>
                          <td className="py-2">{fmtPct(b.zeroAllRate)}</td>
                          <td className="py-2">{b.bestHits}</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-slate-800/60 text-slate-500">
                      <td className="py-2 text-left">随机期望（单注）</td>
                      <td className="py-2">{comparison[0].expectation.toFixed(3)}</td>
                      <td className="py-2" colSpan={5}>
                        纯随机选号的理论平均命中（({cfg.redCount}²/{cfg.redMax}) + ({cfg.blueCount}²/
                        {cfg.blueMax})），任何选号方式都相同
                      </td>
                    </tr>
                    <tr className="text-slate-500">
                      <td className="py-2 text-left">机选解析基准（{comparison[0].tickets} 注）</td>
                      <td className="py-2">—</td>
                      <td className="py-2">—</td>
                      <td className="py-2">—</td>
                      <td className="py-2">{fmtPct(comparison[0].batchExpectation.anyPrize)}</td>
                      <td className="py-2" colSpan={2}>
                        {comparison[0].tickets} 注独立随机的「至少中奖」概率（1−(1−p)^N）
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                注意「平均命中」一列：三个方案与机选同水平（都在噪声带内）；差异出现在「至少中奖」一列，
                也就是同价位铺开更多不同号码带来的覆盖收益。
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
