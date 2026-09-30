"use client";

import { useMemo } from "react";
import { GAMES } from "@/lib/games";
import { preferenceTickets, type LotteryKey, type Notebook } from "@/lib/notebook";
import { selectionSummary } from "@/lib/stats";

export default function PreferencePanel({ notebook, game }: { notebook: Notebook; game: LotteryKey }) {
  const signals = useMemo(() => preferenceTickets(notebook, game), [notebook, game]);
  const rows = signals.map((t) => t.game === "p5" ? t.digits : t.red);
  const summary = selectionSummary(rows, game === "p5" ? 9 : GAMES[game].redMax, game === "p5" ? 0 : 1);
  const zones = game === "p5" ? Array.from({ length: 5 }, (_, p) => ({ name: `第 ${p + 1} 位`, summary: selectionSummary(signals.map((t) => t.game === "p5" ? [t.digits[p]] : []), 9, 0) })) : [
    { name: GAMES[game].redName, summary },
    { name: GAMES[game].blueName, summary: selectionSummary(signals.map((t) => t.game !== "p5" ? t.blue : []), GAMES[game].blueMax) },
  ];
  return <section className="surface preference-panel" data-testid="preference-analysis">
    <div className="section-heading"><div><span className="eyebrow">从您明确的选择中观察</span><h2>选号偏好分析</h2></div><span className="quiet-badge">{signals.length} 注样本</span></div>
    {!signals.length ? <p className="muted record-hint">录入已购号码或主动喜欢一注后，会显示常选号码、奇偶、大小与和值偏好。</p> : <>
      <div className="preference-metrics"><div><span>奇数占比</span><strong>{(summary.oddRate * 100).toFixed(1)}%</strong></div><div><span>大号占比</span><strong>{(summary.bigRate * 100).toFixed(1)}%</strong></div><div><span>平均和值</span><strong>{summary.meanSum.toFixed(1)}</strong></div><div><span>平均连号对</span><strong>{summary.meanConsecutive.toFixed(2)}</strong></div></div>
      {zones.map((z) => <div className="preference-zone" key={z.name}><span>{z.name}常选</span><div>{z.summary.frequent.map((f) => <span className="preference-number" key={f.n}>{game === "p5" ? f.n : String(f.n).padStart(2, "0")} <small>{f.count} 次</small></span>)}</div></div>)}
    </>}
    <p className="fine-print">只分析实际购买和主动喜欢，自动推荐与收藏不参与。复式、胆拖按展开单注计数，同期相同单注仅计一次。{game === "p5" ? "大号为 5–9；连号按数字大小统计，各位置常选分别统计。" : `大号为 ${Math.floor(GAMES[game].redMax / 2) + 1}–${GAMES[game].redMax}；形态仅统计${GAMES[game].redName}。`}统计描述选号习惯，不能预测开奖。</p>
  </section>;
}
