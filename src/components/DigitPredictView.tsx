"use client";

import { useMemo, useState } from "react";
import CopyButton from "@/components/CopyButton";
import DigitBall from "@/components/DigitBall";
import Disclaimer from "@/components/Disclaimer";
import {
  DIGIT_STRATEGIES,
  compareDigit,
  runDigitStrategy,
  type DigitCompareReport,
  type DigitStrategyId,
  type DigitStrategyResult,
} from "@/lib/digit-predict";
import { P5_CONFIG, digitText, singleDigitPrizeProb, type DigitDraw } from "@/lib/digit";
import { decodeDigits, type CompactDigits } from "@/lib/compact";

const COUNT_OPTIONS = [1, 5, 10];
const fmtProb = (p: number) => `${(p * 100).toFixed(4)}%`;

/** 初始参数（best / 5 注 / seed 1）在构建期的预计算结果，见 p5/predict/page.tsx */
export interface DigitPredictInitial {
  result: DigitStrategyResult;
  report: DigitCompareReport;
}

/**
 * 排列五的「智能预测」。
 *
 * 与前两个彩种不同：本玩法只有一个奖级（5 位全中，1/100000），每位 0-9 独立均匀，
 * 因此**任何选号方案的单注中奖概率都相同**，没有「最优」可言。页面必须把这一点讲清楚，
 * 否则「最优方案」这个名字本身就会误导人。这里能提供的真实价值只有两件：
 *   1) 保证多注互不重复（唯一能真实省钱的地方）；
 *   2) 用解析概率 + 实测核对把「三者概率相同」摆出来，而不是让用户自己去猜。
 */
export default function DigitPredictView({
  compact,
  initial,
}: {
  compact: CompactDigits;
  initial: DigitPredictInitial | null;
}) {
  const cfg = P5_CONFIG;
  const [strategy, setStrategy] = useState<DigitStrategyId>("best");
  const [count, setCount] = useState(5);
  const [seed, setSeed] = useState(1);

  // 解码一次（按位还原），子组件接口不变
  const draws = useMemo<DigitDraw[]>(() => decodeDigits(compact), [compact]);

  // 初始参数用构建期预计算结果；参数一变回落到客户端重算（同函数同口径）
  const result = useMemo(
    () =>
      strategy === "best" && count === 5 && seed === 1 && initial?.result
        ? initial.result
        : draws.length
          ? runDigitStrategy(cfg, draws, strategy, count, seed)
          : null,
    [cfg, draws, strategy, count, seed, initial]
  );

  const report = useMemo(
    () =>
      count === 5 && initial?.report
        ? initial.report
        : draws.length
          ? compareDigit(cfg, draws, count)
          : null,
    [cfg, draws, count, initial]
  );

  const single = singleDigitPrizeProb(cfg);

  return (
    <div className="flex flex-col gap-5">
      <section className="pt-2 text-center">
        <h1 className="text-2xl font-bold text-white">号码方案 · 排列五</h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-400">
          排列五只有一个奖级（5 位全中），每位 0-9 独立均匀，单注中奖概率固定为 1/100000。
          因此这里没有「更准」的方案——三个方案的中奖概率完全相同，区别只在号码构成与是否重复。
        </p>
      </section>

      <Disclaimer />

      {draws.length === 0 ? (
        <p className="card text-center text-sm text-slate-500">数据暂时不可用，请稍后再来。</p>
      ) : (
        <>
          {/* 方案选择 */}
          <div className="grid gap-2 sm:grid-cols-3">
            {DIGIT_STRATEGIES.map((s) => {
              const active = strategy === s.id;
              const isBest = s.id === "best";
              return (
                <button
                  key={s.id}
                  onClick={() => setStrategy(s.id)}
                  aria-pressed={active}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    active
                      ? isBest
                        ? "border-violet-400/70 bg-violet-500/10"
                        : "border-slate-500/60 bg-slate-500/10"
                      : "border-slate-800 bg-slate-900/60 hover:border-slate-600"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`text-sm font-semibold ${active ? (isBest ? "text-violet-300" : "text-slate-200") : "text-white"}`}>
                      {s.name}
                    </span>
                    {isBest && (
                      <span className="rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">
                        唯一真实优化
                      </span>
                    )}
                    {s.id === "second" && (
                      <span className="rounded-full bg-slate-600/30 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
                        不改变概率
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] leading-snug text-slate-500">{s.tagline}</div>
                </button>
              );
            })}
          </div>

          {/* 推荐号码 */}
          {result && (
            <section className="card">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-bold text-white">
                  {result.strategy.name}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    基于 {draws.length} 期历史 · {count} 注互不重复
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
                    className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500"
                  >
                    ⟳ 换一批
                  </button>
                  <CopyButton
                    label="复制全部"
                    className="bg-slate-800 px-3 py-1.5 text-sm"
                    text={result.tickets.map(digitText).join("\n")}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {result.tickets.map((t, i) => (
                  <div
                    key={t.join("")}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-800/70 bg-slate-900/40 px-4 py-2.5"
                  >
                    <span className="w-10 text-xs text-slate-500">第 {i + 1} 注</span>
                    <div className="flex items-center gap-1.5">
                      {t.map((n, p) => (
                        <DigitBall key={p} n={n} size="md" title={`第 ${p + 1} 位`} />
                      ))}
                    </div>
                    <span className="text-xs tabular-nums text-slate-500">
                      号码 <span className="text-violet-300">{digitText(t)}</span> · 和值{" "}
                      <span className="text-amber-300/90">{t.reduce((a, b) => a + b, 0)}</span>
                    </span>
                    <CopyButton text={digitText(t)} className="ml-auto" />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 诚实性核心：概率同一性 */}
          {report && (
            <section className="card">
              <h3 className="mb-1 text-sm font-semibold text-white">
                三个方案的概率是一致的（这是排列五的数学事实）
                <span className="ml-2 text-xs font-normal text-slate-500">
                  单注 {fmtProb(single)} = 1/{(cfg.digitMax + 1) ** cfg.positions}
                </span>
              </h3>
              <p className="mb-3 text-xs leading-relaxed text-slate-500">
                每位 0-9 独立均匀 ⇒ 每一注（无论是谁选的、怎么选的）中奖概率都是 1/100000。
                买 {report.tickets} 注时，只要互不重复，概率就是 {report.tickets}/100000；机选可能撞车，
                撞掉的那一注等于白花钱——这就是「去重」的全部收益，也是本玩法唯一真实可做的事。
                由于中奖概率极低，样本内几乎观察不到中奖（{report.draws} 期 × {report.tickets} 注的期望中奖次数仅{" "}
                {(report.draws * report.tickets * single).toFixed(2)} 次），所以这里以**解析概率**为准，
                实测数字只用于核对去重效果与命中位数。
              </p>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-center text-xs">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="py-2 text-left font-normal">方案</th>
                      <th className="py-2 font-normal">
                        每 10 万注期望中奖
                        <span className="ml-1 text-slate-400">（注）</span>
                      </th>
                      <th className="py-2 font-normal">每批去重注数</th>
                      <th className="py-2 font-normal">
                        每注平均命中位数
                        <span className="ml-1 text-slate-400">理论 {report.matchedExpectation.toFixed(3)}</span>
                      </th>
                      <th className="py-2 font-normal">实测中奖期数</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {report.rows.map((r) => {
                      const isCurrent = r.id === strategy;
                      // 机选允许重复，期望中奖注数要用 1−(1−p)^N；去重方案用 N/10^5
                      const prob = r.id === "random" ? report.prob.random : report.prob.distinct;
                      const expectedWins = prob * 1e5;
                      return (
                        <tr
                          key={r.id}
                          className={`border-t border-slate-800/60 ${
                            isCurrent ? "text-violet-300" : "text-slate-300"
                          }`}
                        >
                          <td className="py-2 text-left">
                            {r.name}
                            {isCurrent && <span className="ml-1.5 text-[10px]">←当前</span>}
                          </td>
                          <td className="py-2 font-semibold">{expectedWins.toFixed(6)}</td>
                          <td className="py-2">
                            {r.distinctRate.toFixed(3)}
                            <span className="text-slate-500"> / {report.tickets}</span>
                          </td>
                          <td className="py-2">{r.matchedPerTicket.toFixed(3)}</td>
                          <td className="py-2">
                            {Math.round(r.winRate * report.draws)}
                            <span className="text-slate-500"> / {report.draws}</span>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-slate-800/60 text-slate-500">
                      <td className="py-2 text-left">机选解析参考</td>
                      <td className="py-2">{(report.prob.random * 1e5).toFixed(6)}</td>
                      <td className="py-2" colSpan={3}>
                        {report.tickets} 注**允许重复**时的期望 1−(1−p)^N：比去重低{" "}
                        {((report.prob.distinct - report.prob.random) * 1e5).toFixed(6)} 注 / 10 万注（相对{" "}
                        {(((report.prob.distinct - report.prob.random) / report.prob.random) * 100).toFixed(4)}%）
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                表格里「每注平均命中位数」三行都等于理论值 {report.matchedExpectation.toFixed(3)}
                （= 5 位 × 1/10），这正是「选号方式不影响命中」的直接证据。
                「去重」的收益是真的但极小：每 10 万注差{" "}
                {((report.prob.distinct - report.prob.random) * 1e5).toFixed(6)} 注，
                而机选在 {report.tickets} 注时出现重复注的概率只有约{" "}
                {((1 - Math.exp((-report.tickets * (report.tickets - 1)) / 2 / 1e5)) * 100).toFixed(4)}%
                （{report.draws} 期中约{" "}
                {((1 - Math.exp((-report.tickets * (report.tickets - 1)) / 2 / 1e5)) * report.draws).toFixed(2)} 期），
                所以「每批去重注数」一列两者都显示 {report.tickets.toFixed(3)} 属正常——测量精度不足以呈现这个差异，
                要看解析值那一列。
                <span className="text-slate-400">
                  {" "}
                  结论：去重是唯一真实优化，而它提高的是「不浪费注数」，不是「更可能中」。
                </span>
              </p>
            </section>
          )}

          {/* 方案说明 */}
          {result && (
            <section className="card">
              <h3 className="mb-2 text-sm font-semibold text-white">方案思路</h3>
              <p className="text-sm leading-relaxed text-slate-400">{result.strategy.description}</p>
              <h4 className="mb-2 mt-4 text-sm font-semibold text-white">近期形态参考</h4>
              <ul className="flex flex-col gap-1.5 text-xs text-slate-400">
                <li>
                  近 100 期和值均值：
                  <span className="text-amber-300/90">{result.analysis.avgSum.toFixed(1)}</span>
                  （理论 {(cfg.positions * cfg.digitMax) / 2}）
                </li>
                <li>
                  近 100 期含重复数字的期数占比：
                  <span className="text-slate-300">{(result.analysis.repeatRate * 100).toFixed(1)}%</span>
                  （五位全不同的理论概率 30.24%）
                </li>
              </ul>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
                以上仅是历史统计描述，不参与选号，也不代表下期倾向。
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
