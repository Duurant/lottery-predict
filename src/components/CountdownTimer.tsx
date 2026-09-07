"use client";

import { useEffect, useState } from "react";

const SH_OFFSET = 8 * 3600 * 1000; // 北京时间 UTC+8

/** 计算下一次开奖的北京时间（开奖当天需在开奖时刻前） */
function nextDrawAt(drawDays: number[], drawTime: string): number | null {
  const [hh, mm] = drawTime.split(":").map(Number);
  const now = Date.now();
  const sh = new Date(now + SH_OFFSET); // 用 UTC 读取即为北京墙上时间
  const base = Date.UTC(
    sh.getUTCFullYear(),
    sh.getUTCMonth(),
    sh.getUTCDate(),
    hh,
    mm,
    0
  );

  for (let d = 0; d < 8; d++) {
    const cand = base + d * 86400_000;
    const day = new Date(cand).getUTCDay();
    if (drawDays.includes(day) && cand > now) return cand - SH_OFFSET;
  }
  return null;
}

function fmt(ms: number): { d: number; h: string; m: string; s: string } {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return {
    d,
    h: String(h).padStart(2, "0"),
    m: String(m).padStart(2, "0"),
    s: String(s).padStart(2, "0"),
  };
}

const CELL =
  "flex h-11 w-11 flex-col items-center justify-center rounded-lg bg-slate-800/80 tabular-nums";
const NUM = "text-lg font-bold leading-none text-white";
const LABEL = "mt-0.5 text-[10px] text-slate-500";

export default function CountdownTimer({
  drawDays,
  drawTime,
  compact = false,
}: {
  drawDays: number[];
  drawTime: string;
  compact?: boolean;
}) {
  const [target, setTarget] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    setTarget(nextDrawAt(drawDays, drawTime));
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [drawDays, drawTime]);

  if (target == null) return null;
  const t = fmt(target - now);

  if (compact) {
    return (
      <span className="text-sm text-slate-400">
        距下期开奖{" "}
        <span className="font-semibold tabular-nums text-red-400">
          {t.d > 0 ? `${t.d}天` : ""}
          {t.h}:{t.m}:{t.s}
        </span>
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {t.d > 0 && (
        <>
          <div className={CELL}>
            <span className={NUM}>{t.d}</span>
            <span className={LABEL}>天</span>
          </div>
          <span className="text-slate-600">:</span>
        </>
      )}
      <div className={CELL}>
        <span className={NUM}>{t.h}</span>
        <span className={LABEL}>时</span>
      </div>
      <span className="text-slate-600">:</span>
      <div className={CELL}>
        <span className={NUM}>{t.m}</span>
        <span className={LABEL}>分</span>
      </div>
      <span className="text-slate-600">:</span>
      <div className={CELL}>
        <span className={NUM}>{t.s}</span>
        <span className={LABEL}>秒</span>
      </div>
    </div>
  );
}
