"use client";

import { useMemo } from "react";
import { bigSmallRatio, oddEvenRatio, sumOf } from "@/lib/stats";
import type { Draw, GameConfig } from "@/lib/games";
import { pad2 } from "@/lib/games";

const CELL = 26; // 号码单元格边长
const HEAD_W = 88; // 左侧期号列宽
const TAIL_W = 52; // 右侧每列宽度（和值/奇偶/大小）
const HEAD_H = 30; // 表头行高

interface Row {
  code: string;
  red: number[];
  blue: number[];
  sum: number;
  oddEven: string;
  bigSmall: string;
}

/** 遗漏矩阵：miss[i][n] = 第 i 行（时间序）号码 n 连续未开的期数（含当期），开出为 0 */
function buildMiss(rows: Row[], max: number, zone: "red" | "blue") {
  const miss: number[][] = [];
  const counter = new Array<number>(max + 1).fill(0);
  for (const r of rows) {
    const hit = new Set(zone === "red" ? r.red : r.blue);
    const row = new Array<number>(max + 1);
    for (let n = 1; n <= max; n++) {
      counter[n] = hit.has(n) ? 0 : counter[n] + 1;
      row[n] = counter[n];
    }
    miss.push(row);
  }
  return miss;
}

function TrendGrid({
  rows,
  max,
  zone,
  showTail,
}: {
  rows: Row[]; // 时间升序
  max: number;
  zone: "red" | "blue";
  showTail: boolean;
}) {
  const miss = useMemo(() => buildMiss(rows, max, zone), [rows, max, zone]);

  const tailCols = showTail ? 3 : 0;
  const gridCols =
    `${HEAD_W}px repeat(${max}, ${CELL}px)` + (showTail ? ` repeat(3, ${TAIL_W}px)` : "");
  const rowCount = rows.length;
  const gridW = HEAD_W + max * CELL + tailCols * TAIL_W;
  const gridH = HEAD_H + rowCount * CELL;

  // SVG 连线：同一号码各次开出之间连线（行序倒置：最新在顶部）
  const lines = useMemo(() => {
    const pts: [number, number][][] = [];
    for (let n = 1; n <= max; n++) {
      const p: [number, number][] = [];
      for (let i = 0; i < rowCount; i++) {
        if (miss[i][n] === 0) {
          const y = HEAD_H + (rowCount - 1 - i) * CELL + CELL / 2;
          p.push([HEAD_W + (n - 1) * CELL + CELL / 2, y]);
        }
      }
      if (p.length > 1) pts.push(p);
    }
    return pts;
  }, [miss, max, rowCount]);

  const hitCls = zone === "red" ? "bg-red-100" : "bg-blue-600";

  return (
    <div className="overflow-x-auto pb-1">
      <div className="relative" style={{ width: gridW, height: gridH }}>
        <svg
          className="pointer-events-none absolute left-0 top-0"
          width={gridW}
          height={gridH}
        >
          {lines.map((p, k) => (
            <polyline
              key={k}
              points={p.map(([x, y]) => `${x},${y}`).join(" ")}
              fill="none"
              stroke={zone === "red" ? "rgba(248,113,113,0.35)" : "rgba(96,165,250,0.35)"}
              strokeWidth="1.5"
            />
          ))}
        </svg>

        {/* 表头（期号列固定在左侧，横向滚动时保留上下文） */}
        <div
          className="absolute left-0 top-0 grid items-center"
          style={{ gridTemplateColumns: gridCols, height: HEAD_H, width: gridW }}
        >
          <div className="sticky left-0 z-20 flex h-full items-center justify-center bg-white/95 text-center text-[11px] text-slate-500 backdrop-blur-sm">
            期号
          </div>
          {Array.from({ length: max }, (_, i) => (
            <div
              key={`h${i}`}
              className="text-center text-[11px] tabular-nums text-slate-500"
            >
              {pad2(i + 1)}
            </div>
          ))}
          {showTail && (
            <>
              <div className="text-center text-[11px] text-slate-500">和值</div>
              <div className="text-center text-[11px] text-slate-500">奇偶</div>
              <div className="text-center text-[11px] text-slate-500">大小</div>
            </>
          )}
        </div>

        {/* 数据行（最新在顶部） */}
        <div
          className="absolute left-0 grid"
          style={{
            top: HEAD_H,
            gridTemplateColumns: gridCols,
            gridAutoRows: `${CELL}px`,
            width: gridW,
          }}
        >
          {rows
            .slice()
            .reverse()
            .map((r, ri) => {
              const ci = rowCount - 1 - ri; // 该行在时间序中的索引
              return (
                <RowCells
                  key={r.code}
                  row={r}
                  missRow={miss[ci]}
                  max={max}
                  zone={zone}
                  showTail={showTail}
                  hitCls={hitCls}
                />
              );
            })}
        </div>
      </div>
    </div>
  );
}

function RowCells({
  row,
  missRow,
  max,
  zone,
  showTail,
  hitCls,
}: {
  row: Row;
  missRow: number[];
  max: number;
  zone: "red" | "blue";
  showTail: boolean;
  hitCls: string;
}) {
  return (
    <>
      <div className="sticky left-0 z-10 flex h-full items-center justify-center bg-white/95 text-[11px] tabular-nums text-slate-500 backdrop-blur-sm">
        {row.code}
      </div>
      {Array.from({ length: max }, (_, i) => {
        const n = i + 1;
        const m = missRow[n];
        const isHit = m === 0;
        return (
          <div key={n} className="flex items-center justify-center">
            {isHit ? (
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-slate-900 ${hitCls}`}
                title={`${pad2(n)} 本期开出`}
              >
                {pad2(n)}
              </span>
            ) : (
              <span
                className={`text-[11px] tabular-nums ${
                  m >= 15 ? "text-slate-600" : "text-slate-500"
                }`}
                title={`${pad2(n)} 已遗漏 ${m} 期`}
              >
                {m}
              </span>
            )}
          </div>
        );
      })}
      {showTail && zone === "red" && (
        <>
          <div className="text-center text-[11px] tabular-nums text-amber-700/80">
            {row.sum}
          </div>
          <div className="text-center text-[11px] tabular-nums text-slate-500">
            {row.oddEven}
          </div>
          <div className="text-center text-[11px] tabular-nums text-slate-500">
            {row.bigSmall}
          </div>
        </>
      )}
      {showTail && zone === "blue" && (
        <>
          <div className="text-center text-[11px] text-transparent">-</div>
          <div className="text-center text-[11px] text-transparent">-</div>
          <div className="text-center text-[11px] text-transparent">-</div>
        </>
      )}
    </>
  );
}

export default function TrendChart({
  draws,
  cfg,
}: {
  draws: Draw[];
  cfg: GameConfig;
}) {
  const rows: Row[] = useMemo(
    () =>
      draws.map((d) => ({
        code: d.code,
        red: d.red,
        blue: d.blue,
        sum: sumOf(d),
        oddEven: oddEvenRatio(d.red).join(":"),
        bigSmall: bigSmallRatio(d.red, cfg.redMax).join(":"),
      })),
    [draws, cfg.redMax]
  );

  return (
    <div className="flex flex-col gap-4">
      <section className="card">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">
          {cfg.redName}走势（1-{cfg.redMax}）
          <span className="ml-2 text-xs font-normal text-slate-500">
            数字为连续遗漏期数，圆点为开出号码，连线为同号开出轨迹
          </span>
        </h3>
        <TrendGrid rows={rows} max={cfg.redMax} zone="red" showTail />
      </section>

      <section className="card">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">
          {cfg.blueName}走势（1-{cfg.blueMax}）
        </h3>
        <TrendGrid rows={rows} max={cfg.blueMax} zone="blue" showTail={false} />
      </section>
    </div>
  );
}
