"use client";

import { useMemo, useState } from "react";
import CopyButton from "@/components/CopyButton";
import PreferencePanel from "@/components/PreferencePanel";
import { gameName, type LotteryKey, type Notebook, type Ticket } from "@/lib/notebook";
import { parsePlay, PLAY_NAMES, recommendedPlays, recommendedPlayName, type PlayEntry } from "@/lib/plays";

export default function PlayRecommendations({ game, main, personal, notebook, ready, waiting, latestCode, save, records, single }: {
  game: LotteryKey; main: Ticket[]; personal: Ticket[]; notebook: Notebook; ready: boolean; waiting: boolean; latestCode: string;
  save: (entry: PlayEntry) => boolean; records: () => void; single: () => void;
}) {
  const [mode, setMode] = useState("multiple");
  const [source, setSource] = useState("system");
  const [message, setMessage] = useState("");
  const entries = useMemo(() => recommendedPlays(game, source === "personal" && personal.length ? personal : main), [game, source, main, personal]);
  const cards = entries.filter((e) => e.mode === mode);
  const ruleUrl = game === "ssq" ? "https://www.szlottery.org/fcw/fcxw/tzgg/content/post_127200.html" : game === "p5" ? "https://m.lottery.gov.cn/ksjz/plw/guize/" : "https://m.lottery.gov.cn/ksjz/m/yxgz_dlt/";
  return <div className="play-layout">
    <section className="surface main-recommendation">
      <div className="section-heading"><div><span className="eyebrow">把候选号码组织成不同玩法</span><h2>玩法推荐 <span className="source-tag">{gameName(game)}</span></h2></div><button className="text-button" onClick={single}>查看单注推荐 →</button></div>
      <p className="period-label">接续第 {latestCode} 期的下一期开奖 · 以下为号码搭配示例</p>
      <div className="play-controls"><div className="game-tabs" aria-label="推荐玩法">{["multiple", ...(game === "p5" ? [] : ["dantuo"])].map((m) => <button key={m} aria-pressed={mode === m} className={mode === m ? "active" : ""} onClick={() => { setMode(m); setMessage(""); }}>{PLAY_NAMES[m as "multiple" | "dantuo"]}</button>)}</div><label>号码来源 <select aria-label="玩法号码来源" value={source} onChange={(e) => setSource(e.target.value)}><option value="system">系统候选</option><option value="personal" disabled={!personal.length}>我的偏好{!personal.length ? "（需先录入）" : ""}</option></select></label></div>
      <p className="muted record-hint">{source === "personal" ? "按您的选号偏好搭配，仍保留不同选择。" : "从当期系统候选中组织号码池。"}{game === "p5" ? "每个位置分别选数字，展开为不同的 5 位单注，保留数字 0 和位置。" : mode === "dantuo" ? "# 前是每注都保留的胆码，后是组合选取的拖码。胆码只是固定选择，不表示更有把握。" : "号码池中的组合全部展开为单注，注数与金额随号码池大小增加。"}</p>
      <div className="play-grid" data-testid="play-recommendations">{cards.map((entry) => {
        const tickets = parsePlay(game, entry);
        const parts = entry.text.split(" + ");
        const title = recommendedPlayName(game, entry);
        return <article className="play-card" key={entry.text}><div className="section-heading"><h3>{title}</h3><span className="quiet-badge">{tickets.length} 注</span></div>
          {game === "p5" ? <div className="play-digit-pools">{entry.text.split(" | ").map((pool, p) => <div key={p}><span>第 {p + 1} 位</span><strong>{pool}</strong></div>)}</div> : <div className="play-pools"><div><span>{game === "dlt" ? "前区" : "红球"}</span><strong>{parts[0]}</strong></div><div><span>{game === "dlt" ? "后区" : "蓝球"}</span><strong>{parts[1]}</strong></div></div>}
          <p className="play-cost">基础金额 <strong>{tickets.length * 2} 元</strong><span>2 元 / 注 · 不含追加与倍数</span></p>
          <div className="button-row"><CopyButton text={entry.text} label="复制号码池" /><button className="text-button" disabled={!ready || waiting} onClick={() => { if (save(entry)) setMessage("玩法已收藏到我的号码，可按展开单注核对；收藏不参与偏好学习。"); }}>收藏玩法</button></div>
        </article>;
      })}</div>
      {!cards.length && <p className="muted record-hint">当前候选不足以组成此玩法，请查看单注推荐或录入自己的号码池。</p>}
      {message && <p className="form-message" role="status">{message}</p>}
      <div className="reason-box play-note"><strong>玩法不同，单注概率相同</strong><p>复式和胆拖是多注号码的组织方式，不是预测。固定胆码会让各注集中在相同号码上；这些玩法示例没有经过覆盖优化验证。请按展开注数比较成本，量力而行。</p><a href={ruleUrl} target="_blank" rel="noreferrer">查看官方玩法说明 ↗</a></div>
    </section>
    <aside className="workspace-sidebar"><section className="surface side-action"><span className="side-icon">＋</span><h3>自己的号码，一起录入</h3><p>单式、复式{game !== "p5" ? "和胆拖" : ""}可以逐行混合粘贴，自动识别并预览总注数。录入后可查看偏好分析和开奖结果。</p><button className="btn-primary" onClick={records}>混合录入号码 →</button></section><PreferencePanel notebook={notebook} game={game} /></aside>
  </div>;
}
