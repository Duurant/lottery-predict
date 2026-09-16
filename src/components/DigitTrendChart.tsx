"use client";

import { useMemo } from "react";
import type { DigitDraw, DigitGameConfig } from "@/lib/digit";

const CELL = "h-5 w-5 text-[10px]";

/** 某位在某一期的遗漏值（自该数字上次在该位出现以来过了多少期） */
function buildOmission(draws: DigitDraw[], position: number, digitMax: number): number[][] {
  const lastSeen = new Array<number>(digitMax + 1).fill(-1);
  return draws.map((d, i) => {
    const row = new Array<number>(digitMax + 1).fill(0);
    for (let n = 0; n <= digitMax; n++) {
      row[n] = lastSeen[n] < 0 ? i : i - 1 - lastSeen[n];
    }
    lastSeen[d.digits[position]] = i;
    return row;
  });
}

/**
 * 排列五走势图：每个位置一张 0-9 × 期 的网格。
 * 与组合型的 TrendChart 结构相同，但行是 0-9 十个数字（**含 0**），
 * 且不显示和值/奇偶等红区专属尾列（那些指标在 DigitStatsPanel 里单独给）。
 */
export default function DigitTrendChart({ draws, cfg }: { draws: DigitDraw[]; cfg: DigitGameConfig }) {
  const grids = useMemo(
    () =>
      Array.from({ length: cfg.positions }, (_, p) => ({
        position: p,
        omission: buildOmission(draws, p, cfg.digitMax),
      })),
    [draws, cfg]
  );

  return (
    <div className="flex flex-col gap-4">
      {grids.map(({ position, omission }) => (
        <section key={position} className="card">
          <h3 className="mb-3 text-sm font-semibold text-white">
            {cfg.positionNames[position]}走势
            <span className="ml-2 text-xs font-normal text-slate-500">
              （0-{cfg.digitMax} · 共 {draws.length} 期）
            </span>
          </h3>
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-y-0.5 text-center text-[10px] tabular-nums">
              <thead>
                <tr className="text-slate-500">
                  <th className="sticky left-0 z-10 bg-slate-900 px-2 text-left font-normal">期号</th>
                  {Array.from({ length: cfg.digitMax + 1 }, (_, n) => (
                    <th key={n} className="px-1 font-normal text-slate-400">
                      {n}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {draws.map((d, i) => (
                  <tr key={d.code} className="text-slate-400">
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-slate-900 px-2 text-left text-slate-500">
                      {d.code}
                    </td>
                    {Array.from({ length: cfg.digitMax + 1 }, (_, n) => {
                      const hit = d.digits[position] === n;
                      return (
                        <td key={n} className="px-0.5">
                          {hit ? (
                            <span className={`ball ball-digit ${CELL} inline-flex`}>{n}</span>
                          ) : (
                            <span className="inline-flex h-5 w-5 items-center justify-center text-slate-600">
                              {omission[i][n]}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <p className="text-xs leading-relaxed text-slate-500">
        网格中高亮数字为该位当期开出的数字，其余格内数字是「该数字在此位上已连续多少期未出现」（遗漏值）。
        遗漏只是历史统计，与下一期无关。
      </p>
    </div>
  );
}
