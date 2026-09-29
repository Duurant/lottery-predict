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

export default function CountdownTimer({
  drawDays,
  drawTime,
  accent = "text-red-600",
}: {
  drawDays: number[];
  drawTime: string;
  /** 倒计时数字的颜色类（各彩种主题色） */
  accent?: string;
}) {
  const [target, setTarget] = useState<number | null>(null);
  const [now, setNow] = useState<number>(0);

  useEffect(() => {
    // 自愈：页面长时间开着时，跨过开奖时刻后自动切到下一期目标，
    // 而不是一直停在 00:00:00
    const sync = () => {
      setNow(Date.now());
      setTarget((prev) => (prev != null && prev > Date.now() ? prev : nextDrawAt(drawDays, drawTime)));
    };
    sync();
    const timer = setInterval(sync, 1000);
    return () => clearInterval(timer);
  }, [drawDays, drawTime]);

  // 首帧占位（服务端与客户端首帧一致，避免水合跳变）
  const t = target == null ? null : fmt(Math.max(target - now, 0));

  return (
    <span className="text-sm text-slate-500">
      距下期开奖{" "}
      <span className={`font-semibold tabular-nums ${accent}`}>
        {t ? `${t.d > 0 ? `${t.d}天` : ""}${t.h}:${t.m}:${t.s}` : "--:--:--"}
      </span>
    </span>
  );
}
