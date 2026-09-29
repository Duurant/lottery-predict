"use client";

import { useMemo, useState } from "react";
import DigitBall from "@/components/DigitBall";
import { digitSum, type DigitDraw, type DigitGameConfig } from "@/lib/digit";

const PAGE = 20;

/**
 * 排列五历史查询。
 * 单独实现而不是复用组合型的 HistoryQuery：后者按「红区 + 蓝区」渲染号码行，
 * 数字型是 5 位有序数字、还要显示和值，行渲染完全不同（分页与检索逻辑很简单，不值得为它做泛型化）。
 */
export default function DigitHistoryQuery({ draws, cfg }: { draws: DigitDraw[]; cfg: DigitGameConfig }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const key = q.trim();
    const list = key ? draws.filter((d) => d.code.includes(key) || d.date.startsWith(key)) : draws;
    return [...list].reverse(); // 新的在前
  }, [draws, q]);

  const pages = Math.max(Math.ceil(filtered.length / PAGE), 1);
  const cur = Math.min(page, pages - 1);
  const rows = filtered.slice(cur * PAGE, cur * PAGE + PAGE);

  return (
    <section className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          placeholder="输入期号（如 26248）或日期（如 2026-09）搜索"
          aria-label="按期号或日期搜索开奖记录"
          className="w-full max-w-xs rounded-lg border border-slate-300 bg-slate-100 px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-500 sm:w-64"
        />
        <span className="text-xs text-slate-500">
          {cfg.name}共收录 {draws.length} 期开奖数据
          {q.trim() && ` · 匹配 ${filtered.length} 期`}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">没有匹配的开奖记录，试试其它期号或日期。</p>
      ) : (
        <div className="flex flex-col divide-y divide-slate-800/60">
          {rows.map((d) => (
            <div key={d.code} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
              <span className="w-20 text-xs tabular-nums text-slate-500">{d.code}</span>
              <span className="w-24 text-xs tabular-nums text-slate-500">{d.date}</span>
              <div className="flex items-center gap-1.5">
                {d.digits.map((n, p) => (
                  <DigitBall key={p} n={n} size="sm" title={`第 ${p + 1} 位`} />
                ))}
              </div>
              <span className="ml-auto text-xs tabular-nums text-slate-500">
                和值 <span className="text-amber-700/90">{digitSum(d)}</span> · 不同数字{" "}
                {new Set(d.digits).size} 个
              </span>
            </div>
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2 text-xs">
          <button
            onClick={() => setPage(Math.max(cur - 1, 0))}
            disabled={cur === 0}
            className="rounded-lg bg-slate-100 px-3 py-1 text-slate-600 disabled:opacity-40"
          >
            上一页
          </button>
          <span className="tabular-nums text-slate-500">
            {cur + 1} / {pages}
          </span>
          <button
            onClick={() => setPage(Math.min(cur + 1, pages - 1))}
            disabled={cur >= pages - 1}
            className="rounded-lg bg-slate-100 px-3 py-1 text-slate-600 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}
    </section>
  );
}
