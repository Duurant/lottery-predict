"use client";

import { useMemo, useState } from "react";
import TicketNumbers from "@/components/TicketNumbers";
import { checkTicket, gameName, KIND_NAMES, parseTickets, resolveDraw, ticketKey, ticketText, type LotteryKey, type Notebook, type SavedRecord } from "@/lib/notebook";
import type { DrawsByGame } from "@/lib/recommendation";
import { detectPlayMode, parsePlay, playExample, PLAY_NAMES, type PlayMode } from "@/lib/plays";
import PreferencePanel from "@/components/PreferencePanel";

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
  const [mode, setMode] = useState<PlayMode>("mixed");
  const [expandedRecords, setExpandedRecords] = useState<string[]>([]);
  const preview = useMemo(() => {
    if (!text.trim()) return null;
    try {
      const tickets = mode === "single" ? parseTickets(text, game) : parsePlay(game, { mode, text });
      const counts = { single: 0, multiple: 0, dantuo: 0 };
      for (const line of text.trim().split(/\r?\n/).filter((s) => s.trim())) counts[mode === "mixed" ? detectPlayMode(game, line) : mode]++;
      return { tickets, counts, duplicates: tickets.length - new Set(tickets.map(ticketKey)).size, error: "" };
    } catch (error) { return { tickets: [], counts: null, duplicates: 0, error: error instanceof Error ? error.message : "号码格式不正确" }; }
  }, [text, mode, game]);
  const records = notebook.records.filter((r) => r.game === game && (filter === "all" || r.kind === filter)).sort((a, b) => b.createdAt - a.createdAt);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const tickets = mode === "single" ? parseTickets(text, game) : parsePlay(game, { mode, text });
      if (code && !data[game].some((d) => d.code === code.trim())) throw new Error("没有找到这个期号，请核对期号或等待开奖数据更新。");
      if (!period && !code) throw new Error("暂无开奖数据，请先等待数据更新。");
      const now = Date.now();
      const old = notebook.records.find((r) => r.id === editing);
      const record: SavedRecord = {
        id: editing ?? `purchase:${crypto.randomUUID()}`, game, kind: "purchase", period: code ? `code:${code.trim()}` : old?.period ?? period,
        tickets, ...(mode !== "single" ? { entry: { mode, text: text.trim() } } : {}), reason: `用户录入的实际购买号码 · ${PLAY_NAMES[mode]} · 基础金额 ${tickets.length * 2} 元（不含追加与倍数）`, createdAt: old?.createdAt ?? now, updatedAt: now,
      };
      if (change((n) => ({ ...n, records: [...n.records.filter((r) => r.id !== record.id), record] }))) {
        setMessage(editing ? "已更新号码，喜好分析也会同步调整。" : `已保存 ${tickets.length} 注，可在下方查看核对结果。`);
        setText(""); setEditing(null); setCode("");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "录入失败，请检查号码。"); }
  };
  const edit = (r: SavedRecord) => {
    setEditing(r.id); setMode(r.entry?.mode ?? "single"); setText(r.entry?.text ?? r.tickets.map(ticketText).join("\n")); setCode(r.period.startsWith("code:") ? r.period.slice(5) : "");
    setMessage("正在修改这条购买记录；不会改变它原来绑定的开奖周期。");
    document.getElementById("purchase-input")?.focus();
  };
  return <div className="records-layout">
    <section className="surface input-panel">
      <span className="eyebrow">自己的号码，也值得好好记录</span>
      <h2>{editing ? "修改已购号码" : "录入已购号码"}</h2>
      <p className="muted">{gameName(game)} · 每行一组，支持单式与复式混合录入。保存后会用于喜好分析。</p>
      <form onSubmit={submit}>
        <label htmlFor="purchase-mode">录入玩法</label>
        <select id="purchase-mode" value={mode} onChange={(e) => { setMode(e.target.value as PlayMode); setMessage(""); }}>
          {Object.entries(PLAY_NAMES).filter(([key]) => game !== "p5" || key !== "dantuo").map(([key, label]) => <option key={key} value={key}>{label}{key === "mixed" ? "（自动识别）" : ""}</option>)}
        </select>
        <label htmlFor="purchase-input">购买号码</label>
        <textarea id="purchase-input" rows={6} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={playExample(game, mode)} required aria-describedby="input-format" />
        <p id="input-format" className="muted">{game === "p5" ? "单式填 05198；按位复式用 | 分隔五个位置，例如 05 | 1 | 9 | 0 | 48。不同位置允许重复，保留前导 0。" : "用 + 分隔两区；多选号码自动识别为复式；胆码 # 拖码 表示胆拖，如上方示例。区内号码用空格或逗号分隔。"}</p>
        <button className="text-button" type="button" onClick={() => { setText(playExample(game, mode)); setMessage(""); }}>填入格式示例</button>
        {preview && <div className={preview.error ? "form-message input-error" : "form-message"} role="status" data-testid="input-preview">{preview.error || <><strong>共 {preview.tickets.length} 注 · 基础金额 {preview.tickets.length * 2} 元</strong><p>{preview.counts && Object.entries(preview.counts).filter(([, n]) => n > 0).map(([key, n]) => `${PLAY_NAMES[key as PlayMode]} ${n} 行`).join(" · ")}（不含追加与倍数）</p>{preview.duplicates > 0 && <p>展开后有 {preview.duplicates} 注与其他行重复，金额按重复注计入，偏好分析会去重。</p>}</>}</div>}
        <label htmlFor="purchase-code">历史期号 <span className="muted">（可选）</span></label>
        <input id="purchase-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="留空绑定本轮；核对往期可填写官方期号" list="draw-codes" inputMode="numeric" />
        <datalist id="draw-codes">{data[game].slice(-100).reverse().map((d) => <option key={d.code} value={d.code}>{d.date}</option>)}</datalist>
        <div className="button-row"><button className="btn-primary" disabled={!ready || !!preview?.error} type="submit">{editing ? "保存修改" : "保存并核对"}</button>
          {editing && <button className="btn-secondary" type="button" onClick={() => { setEditing(null); setText(""); setCode(""); setMessage(""); }}>取消修改</button>}</div>
        {message && <p role="status" className="form-message">{message}</p>}
      </form>
      <p className="fine-print">记录仅存于当前浏览器。清理浏览器数据后可能丢失，换设备不会自动同步。</p>
    </section>
    <section className="records-list">
      <PreferencePanel notebook={notebook} game={game} />
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
          {r.entry && <div className="record-play"><strong>{PLAY_NAMES[r.entry.mode]} · {r.tickets.length} 注 · 基础金额 {r.tickets.length * 2} 元</strong><pre>{r.entry.text}</pre><span>不含追加与倍数；下方逐注核对展开结果。</span></div>}
          {drawn && r.entry && <p className="muted">核对汇总：{Object.entries(r.tickets.reduce<Record<string, number>>((counts, t) => { const label = checkTicket(t, drawn).label; counts[label] = (counts[label] ?? 0) + 1; return counts; }, {})).map(([label, n]) => `${label} ${n} 注`).join(" · ")}</p>}
          {r.tickets.slice(0, expandedRecords.includes(r.id) ? undefined : 10).map((t, i) => {
            const check = drawn ? checkTicket(t, drawn) : null;
            return <div className="saved-ticket" key={i}><TicketNumbers ticket={t} drawn={drawn} small />{check && <div className="check-result"><strong>{check.label}</strong><span>{check.detail}</span></div>}</div>;
          })}
          {r.tickets.length > 10 && <button className="text-button" onClick={() => setExpandedRecords((ids) => ids.includes(r.id) ? ids.filter((id) => id !== r.id) : [...ids, r.id])}>{expandedRecords.includes(r.id) ? "收起展开单注" : `查看全部 ${r.tickets.length} 注`}</button>}
          <details className="record-details"><summary>保存时的推荐依据与时间</summary><p>{r.reason}</p><p>{new Date(r.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}（北京时间）</p></details>
        </article>;
      })}
      {records.length > limit && <button className="btn-secondary" onClick={() => setLimit((n) => n + 20)}>显示更多记录</button>}
    </section>
  </div>;
}
