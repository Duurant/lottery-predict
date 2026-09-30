"use client";

import { useEffect, useRef, useState } from "react";
import { GAMES, type Draw } from "@/lib/games";
import { P5_CONFIG, type DigitDraw } from "@/lib/digit";
import { gameName, type LotteryKey } from "@/lib/notebook";
import type { DrawsByGame } from "@/lib/recommendation";
import TicketNumbers from "@/components/TicketNumbers";

const GAME_KEYS: LotteryKey[] = ["dlt", "ssq", "p5"];

/** 仅播放已公布的结果，不生成号码，也不写入号码簿或偏好记录。 */
export default function DrawReplay({ initialGame, data, onClose }: {
  initialGame: LotteryKey; data: DrawsByGame; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [game, setGame] = useState(initialGame);

  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  return <dialog ref={dialog} className="draw-replay-dialog" aria-labelledby="replay-title"
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="draw-replay-shell">
      <header className="replay-header">
        <div><span className="eyebrow">让历史号码，逐个亮相</span><h2 id="replay-title">开奖回放 <span className="source-tag">已公布结果</span></h2></div>
        <button className="replay-close" onClick={onClose} aria-label="关闭开奖回放" autoFocus>×</button>
      </header>
      <div className="replay-game-tabs" aria-label="回放彩种">{GAME_KEYS.map((key) =>
        <button key={key} aria-pressed={game === key} onClick={() => setGame(key)}>{gameName(key)}</button>
      )}</div>
      <ReplayHistory key={game} game={game} draws={data[game]} />
    </div>
  </dialog>;
}

function ReplayHistory({ game, draws }: { game: LotteryKey; draws: (Draw | DigitDraw)[] }) {
  const [index, setIndex] = useState(draws.length - 1);
  const [code, setCode] = useState(draws.at(-1)?.code ?? "");
  const [error, setError] = useState("");
  const drawn = draws[index];
  const select = (next: number) => {
    setIndex(next); setCode(draws[next].code); setError("");
  };
  if (!drawn) return <p className="empty-state">暂无可回放的开奖数据。</p>;

  return <>
    <form className="replay-history" onSubmit={(event) => {
      event.preventDefault();
      const next = draws.findIndex((draw) => draw.code === code.trim());
      if (next < 0) { setError("未找到该期，请输入已收录的官方期号。"); return; }
      select(next);
    }}>
      <label htmlFor="replay-code">选择期号</label>
      <div className="replay-period-input"><input id="replay-code" value={code} onChange={(event) => setCode(event.target.value)}
        inputMode="numeric" list="replay-recent-issues" autoComplete="off" aria-invalid={!!error} aria-describedby={error ? "replay-error" : undefined} />
        <button className="text-button" type="submit">查看</button></div>
      <datalist id="replay-recent-issues">{draws.slice(-100).reverse().map((draw) => <option key={draw.code} value={draw.code}>{draw.date}</option>)}</datalist>
      <div className="replay-history-actions"><button type="button" disabled={index === 0} onClick={() => select(index - 1)}>← 上一期</button>
        <button type="button" disabled={index === draws.length - 1} onClick={() => select(index + 1)}>下一期 →</button>
        <button type="button" disabled={index === draws.length - 1} onClick={() => select(draws.length - 1)}>最新</button></div>
    </form>
    {error && <p id="replay-error" className="replay-error" role="alert">{error}</p>}
    <ReplayPlayer key={drawn.code} game={game} drawn={drawn} />
  </>;
}

function ReplayPlayer({ game, drawn }: { game: LotteryKey; drawn: Draw | DigitDraw }) {
  const [revealed, setRevealed] = useState(0);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const digit = game === "p5";
  const cfg = game === "p5" ? null : GAMES[game];
  const makeSlots = (shuffle = false) => {
    // 只打乱同一区内的真实开奖号码，既不改结果，也不打乱排列五的位置。
    const order = (numbers: number[]) => {
      const copy = [...numbers];
      if (shuffle) for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    };
    return "digits" in drawn
    ? drawn.digits.map((number, i) => ({ number, label: P5_CONFIG.positionNames[i], color: "purple" }))
    : [...order(drawn.red).map((number, i) => ({ number, label: `${cfg?.redName}第 ${i + 1} 个`, color: "red" })),
      ...order(drawn.blue).map((number, i) => ({ number, label: `${cfg?.blueName}第 ${i + 1} 个`, color: "blue" }))];
  };
  const [slots, setSlots] = useState(() => makeSlots());
  const done = revealed === slots.length;
  const playing = running && !done;
  const last = revealed > 0 ? slots[revealed - 1] : null;
  const active = slots[Math.min(revealed, slots.length - 1)];
  const format = (number: number) => digit ? String(number) : String(number).padStart(2, "0");

  useEffect(() => {
    if (!running || revealed >= slots.length) return;
    const timer = window.setTimeout(() => setRevealed((value) => value + 1), 1400 / speed);
    return () => window.clearTimeout(timer);
  }, [running, revealed, slots.length, speed]);

  useEffect(() => {
    const pauseWhenHidden = () => { if (document.hidden) setRunning(false); };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => document.removeEventListener("visibilitychange", pauseWhenHidden);
  }, []);

  const status = done ? "全部号码已揭晓" : playing ? `正在揭晓${slots[revealed].label}` : revealed > 0 ? "回放已暂停" : "准备就绪，点击开始回放";
  return <section className={`replay-player ${playing ? "is-running" : ""} ${digit ? "is-digit" : ""}`} aria-label={`${gameName(game)}第 ${drawn.code} 期开奖回放`}>
    <div className="replay-draw-heading"><div><strong>第 {drawn.code} 期</strong><span>{drawn.date}</span></div><span className="replay-mode">历史回放 · 非直播</span></div>
    <div className="replay-stage">
      {digit ? <div className="replay-digit-machines" aria-hidden="true">{slots.map((slot, position) => {
        const hasDrawn = position < revealed;
        return <div className={`replay-digit-machine machine-purple ${playing && position === revealed ? "is-active" : ""} ${hasDrawn ? "has-drawn" : ""}`} key={position}>
          <span className="replay-position-label">{["万位", "千位", "百位", "十位", "个位"][position]}</span>
          <BallDrum pool={Array.from({ length: 10 }, (_, i) => i).filter((n) => !hasDrawn || n !== slot.number)} digit />
          <span className="replay-digit-chute" />
          <div className={`replay-digit-output ${hasDrawn ? "has-number" : ""}`}>{hasDrawn ? slot.number : "—"}</div>
          <span className="replay-position-range">0–9</span>
        </div>;
      })}</div> : <div className="replay-combo-machines" aria-hidden="true">{(["red", "blue"] as const).map((color) => {
        const max = color === "red" ? cfg!.redMax : cfg!.blueMax;
        const count = color === "red" ? cfg!.redCount : cfg!.blueCount;
        const drawnZone = slots.slice(0, revealed).filter((slot) => slot.color === color);
        const pool = Array.from({ length: max }, (_, i) => i + 1).filter((n) => !drawnZone.some((slot) => slot.number === n));
        const output = drawnZone.at(-1);
        return <div className="replay-zone" key={color}>
          <div className="replay-zone-label"><strong>{color === "red" ? cfg!.redName : cfg!.blueName}</strong><span>01–{max} · 出 {count} 个球</span></div>
          <div className={`replay-machine machine-${color} ${playing && active.color === color ? "is-active" : ""}`}>
            <BallDrum pool={pool} />
            <span className="replay-pipe" />
            <div key={drawnZone.length} className={`replay-spotlight ${output ? `spotlight-${color} has-number` : ""}`}>{output ? format(output.number) : <span>待出球</span>}</div>
            <span className="replay-machine-base" />
          </div>
          <span className="replay-zone-count">已出 {drawnZone.length} / {count} · 池内 {pool.length} 个</span>
        </div>;
      })}</div>}
      <p className="replay-stage-caption">{done ? "本期摇奖回放结束" : digit ? `${active.label} · 独立的 0–9 号球池` : `先${cfg!.redName}，再${cfg!.blueName} · 区内不重复`}{last && <span>已出球：{last.label} · {format(last.number)}</span>}</p>
    </div>
    <p className="replay-result-title">{digit ? "按位开奖结果" : "模拟出球顺序"}</p>
    <div className="replay-result" aria-label="已揭晓的开奖号码" data-testid="replay-result">
      {slots.map((slot, i) => <div className="replay-result-item" key={i}>
        {!digit && i === cfg?.redCount && <span className="replay-result-plus" aria-hidden="true">+</span>}
        <span className={`replay-result-ball ${i < revealed ? `revealed result-${slot.color}` : ""} ${playing && i === revealed ? "is-next" : ""}`}
          aria-label={`${slot.label}：${i < revealed ? format(slot.number) : "待揭晓"}`}>{i < revealed ? format(slot.number) : "—"}</span>
      </div>)}
    </div>
    {done && !digit && "red" in drawn && <div className="replay-official"><span>本期开奖公告</span><TicketNumbers ticket={{ game, red: drawn.red, blue: drawn.blue }} small /></div>}
    <div className="replay-progress" role="progressbar" aria-label="揭晓进度" aria-valuemin={0} aria-valuemax={slots.length} aria-valuenow={revealed}><span style={{ width: `${revealed / slots.length * 100}%` }} /></div>
    <div className="replay-status"><p role="status">{status}{last && !playing && !done ? ` · 已揭晓 ${revealed} 个` : ""}</p><span>{revealed} / {slots.length}</span></div>
    <div className="replay-controls">
      <div className="button-row"><button className="btn-primary" onClick={() => {
        if (done || (!running && revealed === 0)) { setSlots(makeSlots(true)); setRevealed(0); setRunning(true); } else setRunning((value) => !value);
      }}>{done ? "再看一次" : playing ? "暂停回放" : revealed ? "继续回放" : "开始回放"}</button>
        {!done && <button className="btn-secondary" onClick={() => { setRunning(false); setRevealed(slots.length); }}>直接看结果</button>}</div>
      <label className="replay-speed">播放速度<select aria-label="播放速度" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value={1}>1×</option><option value={2}>2×</option></select></label>
    </div>
    <p className="replay-note">{digit ? "按第 1 至第 5 位分别模拟摇出 0–9 号球，保留重复数字与前导 0。" : "各分区内的出球顺序随机模拟，与现场顺序无关。"}最终号码来自该期真实开奖公告，动画非现场录像。</p>
  </section>;
}

function BallDrum({ pool, digit = false }: { pool: number[]; digit?: boolean }) {
  return <div className="replay-drum"><div className="replay-orbit">{pool.map((number, i) => {
    const angle = i * 2.39996;
    const radius = 8 + Math.sqrt(i / Math.max(pool.length, 1)) * 29;
    return <span className="replay-particle" key={number}
      style={{ left: `${50 + Math.cos(angle) * radius}%`, top: `${50 + Math.sin(angle) * radius}%`, animationDelay: `${-i * 0.19}s`, animationDuration: `${0.9 + i % 5 * 0.17}s` }}>{digit ? number : String(number).padStart(2, "0")}</span>;
  })}</div><div className="replay-glass-shine" /></div>;
}
