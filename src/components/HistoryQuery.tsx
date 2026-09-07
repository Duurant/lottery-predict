"use client";

import { useMemo, useState } from "react";
import Ball from "@/components/Ball";
import type { Draw, GameConfig } from "@/lib/games";

const PAGE_SIZE = 20;

export default function HistoryQuery({ draws, cfg }: { draws: Draw[]; cfg: GameConfig }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim();
    const desc = [...draws].reverse(); // 最新在前
    if (!q) return desc;
    return desc.filter(
      (d) => d.code.includes(q) || d.date.includes(q)
    );
  }, [draws, query]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const slice = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder="输入期号（如 2026103）或日期（如 2026-09）搜索"
          className="w-72 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-red-500 focus:outline-none"
        />
        <span className="text-xs text-slate-500">
          共匹配 {filtered.length} 期
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {slice.map((d) => (
          <div
            key={d.code}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-slate-800/70 bg-slate-900/40 px-4 py-2.5"
          >
            <div className="w-32 text-sm">
              <span className="font-semibold tabular-nums text-slate-200">{d.code}</span>
              <span className="ml-2 text-xs tabular-nums text-slate-500">{d.date}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {d.red.map((n) => (
                <Ball key={`r${n}`} n={n} zone="red" size="sm" />
              ))}
              <span className="mx-0.5 text-xs text-slate-600">+</span>
              {d.blue.map((n) => (
                <Ball key={`b${n}`} n={n} zone="blue" size="sm" />
              ))}
            </div>
          </div>
        ))}
        {slice.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">没有匹配的开奖记录</p>
        )}
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-slate-300 disabled:opacity-40 enabled:hover:bg-slate-700"
          >
            上一页
          </button>
          <span className="tabular-nums text-slate-500">
            {safePage + 1} / {pages}
          </span>
          <button
            disabled={safePage >= pages - 1}
            onClick={() => setPage(safePage + 1)}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-slate-300 disabled:opacity-40 enabled:hover:bg-slate-700"
          >
            下一页
          </button>
        </div>
      )}

      <p className="mt-3 text-center text-xs text-slate-600">
        {cfg.name}共收录 {draws.length} 期开奖数据
      </p>
    </div>
  );
}
