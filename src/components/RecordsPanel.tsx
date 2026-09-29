"use client";

import { useState } from "react";
import TicketNumbers from "@/components/TicketNumbers";
import { checkTicket, gameName, KIND_NAMES, parseTickets, resolveDraw, ticketText, type LotteryKey, type Notebook, type SavedRecord } from "@/lib/notebook";
import type { DrawsByGame } from "@/lib/recommendation";

export default function RecordsPanel({ notebook, data, game, period, ready, change }: {
  notebook: Notebook; data: DrawsByGame; game: LotteryKey; period: string; ready: boolean;
  change: (update: (n: Notebook) => Notebook) => boolean;
}) {
  const [text, setText] = useState("");
  const [code, setCode] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const [limit, setLimit] = useState(20);
  const records = notebook.records.filter((r) => r.game === game && (filter === "all" || r.kind === filter)).sort((a, b) => b.createdAt - a.createdAt);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const tickets = parseTickets(text, game);
      if (code && !data[game].some((d) => d.code === code.trim())) throw new Error("没有找到这个期号，请核对期号或等待开奖数据更新。");
      if (!period && !code) throw new Error("暂无开奖数据，请先等待数据更新。");
      const now = Date.now();
      const old = notebook.records.find((r) => r.id === editing);
      const record: SavedRecord = {
        id: editing ?? `purchase:${crypto.randomUUID()}`, game, kind: "purchase", period: code ? `code:${code.trim()}` : old?.period ?? period,
        tickets, reason: "用户录入的实际购买号码", createdAt: old?.createdAt ?? now, updatedAt: now,
      };
      if (change((n) => ({ ...n, records: [...n.records.filter((r) => r.id !== record.id), record] }))) {
        setMessage(editing ? "已更新号码，喜好分析也会同步调整。" : `已保存 ${tickets.length} 注，可在下方查看核对结果。`);
        setText(""); setEditing(null); setCode("");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "录入失败，请检查号码。"); }
  };
  const edit = (r: SavedRecord) => {
    setEditing(r.id); setText(r.tickets.map(ticketText).join("\n")); setCode(r.period.startsWith("code:") ? r.period.slice(5) : "");
    setMessage("正在修改这条购买记录；不会改变它原来绑定的开奖周期。");
    document.getElementById("purchase-input")?.focus();
  };
  return <div className="records-layout">
    <section className="surface input-panel">
      <span className="eyebrow">自己的号码，也值得好好记录</span>
      <h2>{editing ? "修改已购号码" : "录入已购号码"}</h2>
      <p className="muted">{gameName(game)} · 普通单式，每行一注。保存后会用于喜好分析。</p>
      <form onSubmit={submit}>
        <label htmlFor="purchase-input">购买号码</label>
        <textarea id="purchase-input" rows={6} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={game === "p5" ? "05198\n00904" : game === "dlt" ? "01 08 16 24 32 + 03 09" : "01 06 12 18 25 32 + 09"} required />
        <label htmlFor="purchase-code">历史期号 <span className="muted">（可选）</span></label>
        <input id="purchase-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="留空绑定本轮；核对往期可填写官方期号" list="draw-codes" inputMode="numeric" />
        <datalist id="draw-codes">{data[game].slice(-100).reverse().map((d) => <option key={d.code} value={d.code}>{d.date}</option>)}</datalist>
        <div className="button-row"><button className="btn-primary" disabled={!ready} type="submit">{editing ? "保存修改" : "保存并核对"}</button>
          {editing && <button className="btn-secondary" type="button" onClick={() => { setEditing(null); setText(""); setCode(""); setMessage(""); }}>取消修改</button>}</div>
        {message && <p role="status" className="form-message">{message}</p>}
      </form>
      <p className="fine-print">记录仅存于当前浏览器。清理浏览器数据后可能丢失，换设备不会自动同步。</p>
    </section>
    <section className="records-list">
      <div className="section-heading"><div><span className="eyebrow">本地号码簿</span><h2>我的记录 <span className="count-label">{records.length}</span></h2></div>
        <select aria-label="筛选记录来源" value={filter} onChange={(e) => { setFilter(e.target.value); setLimit(20); }}><option value="all">全部来源</option>{Object.entries(KIND_NAMES).map(([k, v]) => <option value={k} key={k}>{v}</option>)}</select>
      </div>
      <p className="muted record-hint">勾选标记表示命中。推荐和收藏不代表实际购买；没有开奖结果时不会判定未中奖。</p>
      {game === "ssq" && <p className="muted record-hint">基础数据不含福运奖启停信息。2026014 期起命中 3 红 0 蓝时，请<a className="text-button" href="https://www.cwl.gov.cn/" target="_blank" rel="noreferrer">核对官方当期公告</a>，本站会标记为待核实。</p>}
      {!records.length && <div className="surface empty-state"><h3>还没有这类记录</h3><p>录入自己的号码，或到当期推荐中收藏一注备选。</p></div>}
      {records.slice(0, limit).map((r) => {
        const drawn = resolveDraw(r.period, data[game] as (DrawsByGame["dlt"][number] | DrawsByGame["p5"][number])[]);
        return <article className="surface saved-record" key={r.id}>
          <div className="section-heading"><div><span className={`source-tag ${r.kind === "purchase" ? "source-purchase" : ""}`}>{KIND_NAMES[r.kind]}</span>
            <span className="record-period">{drawn ? `第 ${drawn.code} 期 · ${drawn.date}` : r.period.startsWith("code:") ? `第 ${r.period.slice(5)} 期` : `接续第 ${r.period.slice(6)} 期`}</span></div>
            {r.kind === "purchase" && <div className="button-row"><button className="text-button" onClick={() => edit(r)}>修改</button><button className="text-button danger" onClick={() => {
              if (window.confirm("删除这条已购记录？对应的购买偏好也会移除。")) change((n) => ({ ...n, records: n.records.filter((x) => x.id !== r.id) }));
            }}>删除</button></div>}
          </div>
          {!drawn && <p className="pending-state">等待开奖 / 官方结果更新</p>}
          {r.tickets.map((t, i) => {
            const check = drawn ? checkTicket(t, drawn) : null;
            return <div className="saved-ticket" key={i}><TicketNumbers ticket={t} drawn={drawn} small />{check && <div className="check-result"><strong>{check.label}</strong><span>{check.detail}</span></div>}</div>;
          })}
          <details className="record-details"><summary>保存时的推荐依据与时间</summary><p>{r.reason}</p><p>{new Date(r.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}（北京时间）</p></details>
        </article>;
      })}
      {records.length > limit && <button className="btn-secondary" onClick={() => setLimit((n) => n + 20)}>显示更多记录</button>}
    </section>
  </div>;
}
