"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import CopyButton from "@/components/CopyButton";
import Disclaimer from "@/components/Disclaimer";
import TicketNumbers from "@/components/TicketNumbers";
import RecordsPanel from "@/components/RecordsPanel";
import { decodeDraws, decodeDigits, type CompactDraws, type CompactDigits } from "@/lib/compact";
import { emptyNotebook, gameName, personalizedTickets, preferenceTickets, readNotebook, STORAGE_KEY, ticketKey, ticketText, type LotteryKey, type Notebook, type SavedRecord, type Ticket } from "@/lib/notebook";
import { expectedDrawTime, systemReason, systemTickets } from "@/lib/recommendation";
import { hashSeed } from "@/lib/coverage";
import { ticketShape } from "@/lib/stats";

const GAMES: LotteryKey[] = ["dlt", "ssq", "p5"];

export default function LotteryWorkspace({ compact, initial }: {
  compact: { dlt: CompactDraws; ssq: CompactDraws; p5: CompactDigits };
  initial: Record<LotteryKey, Ticket[]>;
}) {
  const data = useMemo(() => ({ dlt: decodeDraws(compact.dlt), ssq: decodeDraws(compact.ssq), p5: decodeDigits(compact.p5) }), [compact]);
  const [game, setGame] = useState<LotteryKey>("dlt");
  const [view, setView] = useState("recommend");
  const [book, setBook] = useState<Notebook>(emptyNotebook);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [now, setNow] = useState(0);
  const [backups, setBackups] = useState<Ticket[]>([]);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const query = () => { const q = new URLSearchParams(location.search); const g = q.get("g"); setGame(GAMES.includes(g as LotteryKey) ? g as LotteryKey : "dlt"); setBackups([]); setNotice(""); setView(q.get("view") === "records" ? "records" : "recommend"); };
    query(); window.addEventListener("popstate", query);
    const load = () => { try { setBook(readNotebook(localStorage.getItem(STORAGE_KEY))); setReady(true); setStorageError(""); } catch (e) { setStorageError(e instanceof Error ? e.message : "浏览器存储不可用，自动保存已暂停。"); setReady(false); } };
    load(); const storage = (e: StorageEvent) => { if (e.key === STORAGE_KEY || e.key === null) load(); };
    window.addEventListener("storage", storage);
    setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => { clearInterval(timer); window.removeEventListener("storage", storage); window.removeEventListener("popstate", query); };
  }, []);

  const change = useCallback((update: (n: Notebook) => Notebook) => {
    try {
      const current = readNotebook(localStorage.getItem(STORAGE_KEY));
      const next = update(current);
      if (next !== current) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setBook(next); setStorageError(""); return true;
    } catch (e) { setStorageError(`保存失败，未覆盖已有记录。${e instanceof Error ? e.message : "请检查浏览器存储空间。"}`); return false; }
  }, []);

  const latest = data[game].at(-1);
  const period = latest ? `after:${latest.code}` : "";
  const deadline = latest ? expectedDrawTime(game, latest.date) : 0;
  const waiting = now > 0 && deadline > 0 && now >= deadline;
  const mainId = `main:${game}:${period}`;
  const savedMain = book.records.find((r) => r.id === mainId);
  const main = savedMain?.tickets ?? initial[game];
  const reason = savedMain?.reason ?? systemReason(main);
  const signals = useMemo(() => preferenceTickets(book, game), [book, game]);
  const bought = useMemo(() => book.records.filter((r) => r.game === game && r.period === period && r.kind === "purchase").flatMap((r) => r.tickets), [book, game, period]);
  const personal = useMemo(() => personalizedTickets(game, signals, bought, period), [game, signals, bought, period]);
  const personalReason = signals.length === 1 ? "目前仅参考您提供的 1 注号码，轻度匹配号码、奇偶、连号和和值偏好，同时保留不同选择。" : `参考您主动喜欢或购买的 ${signals.length} 条号码记录，适度匹配常选号码与组合形态。自动保存的推荐不参与学习。`;
  const personalId = `personal:${game}:${period}:${hashSeed(...personal.map(ticketKey), personalReason)}`;

  useEffect(() => {
    if (!ready || !now || waiting || !period || !main.length) return;
    const additions: SavedRecord[] = [];
    if (!book.records.some((r) => r.id === mainId)) additions.push({ id: mainId, game, kind: "main", period, tickets: main, reason, createdAt: Date.now() });
    if (personal.length && !book.records.some((r) => r.id === personalId)) additions.push({ id: personalId, game, kind: "personal", period, tickets: personal, reason: personalReason, createdAt: Date.now() });
    if (additions.length) change((n) => ({ ...n, records: [...n.records, ...additions.filter((r) => !n.records.some((old) => old.id === r.id))] }));
  }, [ready, now, waiting, period, main, mainId, game, reason, personal, personalId, personalReason, book.records, change]);

  const navigate = (g: LotteryKey, v: string) => {
    setGame(g); setView(v); setBackups([]); setNotice("");
    history.pushState(null, "", `/?g=${g}${v === "records" ? "&view=records" : ""}`);
  };
  const toggleLike = (t: Ticket) => {
    const id = `${period}:${ticketKey(t)}`;
    change((n) => ({ ...n, likes: n.likes.some((l) => l.id === id) ? n.likes.filter((l) => l.id !== id) : [...n.likes, { id, period, ticket: t, createdAt: Date.now() }] }));
  };
  const saveBackup = (t: Ticket) => {
    const id = `backup:${period}:${ticketKey(t)}`;
    if (change((n) => n.records.some((r) => r.id === id) ? n : ({ ...n, records: [...n.records, { id, game, kind: "backup", period, tickets: [t], reason: "用户手动收藏的备选号码；收藏本身不参与偏好学习。", createdAt: Date.now() }] }))) setNotice("已收藏到我的号码。");
  };
  const ticketRows = (tickets: Ticket[], interactive = false) => tickets.map((t, i) => {
    const shape = ticketShape(t.game === "p5" ? t.digits : t.red);
    const liked = book.likes.some((l) => l.id === `${period}:${ticketKey(t)}`);
    const saved = book.records.some((r) => r.id === `backup:${period}:${ticketKey(t)}`);
    return <div className="ticket-row" key={`${ticketKey(t)}:${i}`}><span className="ticket-index">{String(i + 1).padStart(2, "0")}</span>
      <div className="ticket-content"><TicketNumbers ticket={t} /><span className="ticket-shape">{t.game === "p5" ? "全 5 位" : "前区 / 红球"} · 奇偶 {shape.odd}:{(t.game === "p5" ? 5 : t.red.length) - shape.odd} · 和值 {shape.sum} · {shape.consecutive} 对连号{t.game === "p5" ? "（按数字大小统计）" : ""}</span></div>
      {interactive && <div className="ticket-actions"><button className={`like-button ${liked ? "is-liked" : ""}`} aria-pressed={liked} aria-label={`${liked ? "取消喜欢" : "喜欢"}备选第 ${i + 1} 注`} disabled={!ready || waiting} onClick={() => toggleLike(t)}>{liked ? "♥ 已喜欢" : "♡ 喜欢"}</button><button className="text-button" disabled={!ready || waiting || saved} onClick={() => saveBackup(t)}>{saved ? "已收藏" : "收藏"}</button></div>}
    </div>;
  });

  return <div className="lottery-workspace">
    <div className="workspace-heading"><div><span className="eyebrow">历史有迹可循，开奖保持随机</span><h1>{view === "records" ? "每一注，都有记录。" : "选一组号码，简单一点。"}</h1><p>看清推荐依据，留下自己的选择。</p></div><span className="local-badge"><span /> 无需登录 · 记录留在本机</span></div>
    <div className="workspace-toolbar"><div className="game-tabs" aria-label="选择彩种">{GAMES.map((g) => <button key={g} aria-pressed={game === g} className={game === g ? "active" : ""} onClick={() => navigate(g, view)}>{gameName(g)}</button>)}</div><div className="view-tabs"><button aria-pressed={view === "recommend"} className={view === "recommend" ? "active" : ""} onClick={() => navigate(game, "recommend")}>当期推荐</button><button aria-pressed={view === "records"} className={view === "records" ? "active" : ""} onClick={() => navigate(game, "records")}>我的号码</button></div></div>
    {storageError && <p className="alert" role="alert">{storageError} <button className="text-button" onClick={() => location.reload()}>重试读取</button></p>}
    {!latest ? <div className="surface empty-state">开奖数据暂时不可用，请稍后再来。</div> : view === "records" ? <RecordsPanel key={game} notebook={book} data={data} game={game} period={period} ready={ready} change={change} /> : <>
      {waiting && <p className="alert">预计开奖时间已过，正在等待官方结果更新。本轮号码仅供查看，自动保存和新备选已暂停；数据更新后再提供下一轮推荐。</p>}
      <div className="recommend-layout"><div className="recommend-primary"><section className="surface main-recommendation">
        <div className="section-heading"><div><span className="eyebrow">为整组号码做好搭配</span><h2>当期主推荐 <span className="source-tag">系统推荐</span></h2></div><span className="quiet-badge">固定 5 注</span></div>
        <p className="period-label">接续第 {latest.code} 期的下一期开奖 <span>· {savedMain ? "已自动保存" : waiting ? "等待数据更新" : ready ? "自动保存中" : "正在读取本地记录"}</span></p>
        <div data-testid="main-tickets">{ticketRows(main)}</div>
        <div className="recommend-footer"><div className="reason-box"><strong>为什么这样选？</strong><p>{reason}</p></div><CopyButton text={main.map(ticketText).join("\n")} label="复制这 5 注" /></div>
        <details className="method-details"><summary>了解推荐方法与验证边界</summary><p>系统优先减少同批号码重叠。奇偶、连号、和值用于组合说明和个性化偏好；本次软形态候选未通过覆盖验证，因此没有用于系统默认选号。历史频率是否加权由训练、验证结果决定；未证实有效时不增加权重。这些方法不能预测下一期，也不提高单注中奖概率。</p><Link href={game === "p5" ? "/p5/predict" : `/predict?g=${game}`}>查看完整方法与回测 →</Link></details>
      </section>
      <section className="surface personal-panel"><div className="section-heading"><div><span className="eyebrow">由您的选择，慢慢了解您</span><h2>猜您喜欢 <span className="source-tag personal-tag">喜好匹配</span></h2></div>{personal.length > 0 && <CopyButton text={personal.map(ticketText).join("\n")} label="复制这组" />}</div>
        {!personal.length ? <div className="personal-empty"><span className="personal-symbol">♡</span><h3>从一注喜欢的号码开始</h3><p>给下方备选点一个「喜欢」，或录入已购号码。<br />我们会参考您的选择，搭配一组不同的号码。</p><button className="btn-secondary" onClick={() => navigate(game, "records")}>录入我的号码 →</button></div> : <><p className="personal-explanation">{personalReason}这是喜好匹配，不代表更容易中奖。</p><div data-testid="personal-tickets">{ticketRows(personal)}</div><p className="fine-print">{waiting ? "当前为偏好预览，等待数据更新后自动保存。" : "生成后自动保存；已排除与当期已购号码整注相同的组合。"}</p></>}
        {(signals.length > 0 || book.likes.some((l) => l.ticket.game === game)) && <details className="method-details"><summary>管理我的选号偏好</summary><p>实际购买与主动喜欢参与分析；系统推荐、自动保存和收藏不参与。</p>{book.likes.filter((l) => l.ticket.game === game).map((l) => <div className="preference-row" key={l.id}><span>{ticketText(l.ticket)}</span><button className="text-button" onClick={() => change((n) => ({ ...n, likes: n.likes.filter((x) => x.id !== l.id) }))}>撤销喜欢</button></div>)}<button className="text-button danger" onClick={() => {
          if (window.confirm("清空所有彩种的喜好记录？已保存号码仍可核对，但已有购买记录不再参与偏好学习。")) change((n) => ({ ...n, likes: [], preferenceSince: Date.now() }));
        }}>清空喜好学习记录</button></details>}
      </section></div>
      <aside className="workspace-sidebar"><section className="surface latest-panel"><span className="eyebrow">最近一次开奖</span><div className="section-heading"><h2>第 {latest.code} 期</h2><span className="status-dot">已开奖</span></div><p className="muted">{latest.date} · 官方历史数据</p><TicketNumbers ticket={game === "p5" && "digits" in latest ? { game, digits: latest.digits } : "red" in latest ? { game: game === "p5" ? "dlt" : game, red: latest.red, blue: latest.blue } : initial[game][0]} small /><Link className="sidebar-link" href={`/${game}`}>查看历史开奖与走势 <span>↗</span></Link></section>
      <section className="surface side-action"><span className="side-icon">↗</span><h3>自己的号码，放在这里</h3><p>粘贴购买号码，开奖后核对命中情况。也让推荐更懂您的喜好。</p><button className="btn-primary" onClick={() => navigate(game, "records")}>录入并核对号码</button></section>
      <section className="research-note"><span className="eyebrow">读懂历史，不必先懂统计</span><h3>热号、遗漏，是什么意思？</h3><p>热号是在所选期数里出现较多的号码；遗漏是距上次出现经过了多少期。它们描述过去，不表示下一期更容易开出。</p><Link href={`/${game}`}>去研究历史 →</Link></section></aside></div>
      <section className="surface backup-panel"><div className="section-heading"><div><span className="eyebrow">还有一些不同的搭配</span><h2>其他备选</h2></div><button className="btn-secondary" disabled={waiting} onClick={() => { setBackups(systemTickets(game, data, Math.floor(Math.random() * 2147483646) + 1)); setNotice(""); }}>{backups.length ? "换一组备选" : "看看其他备选"} ↻</button></div><p className="muted">喜欢是一种偏好，收藏是一份记录。备选不替换上方固定的主推荐。</p>{backups.length > 0 ? <div className="backup-grid">{ticketRows(backups, true)}</div> : <p className="backup-placeholder">主推荐已经准备好；需要其他选择时，再展开备选。</p>}{notice && <p role="status" className="form-message">{notice}</p>}</section>
    </>}
    <Disclaimer compact />
  </div>;
}
