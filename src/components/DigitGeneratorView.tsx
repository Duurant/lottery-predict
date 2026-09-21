"use client";

import { useMemo, useState } from "react";
import DigitBall from "@/components/DigitBall";
import Disclaimer from "@/components/Disclaimer";
import { P5_CONFIG, digitText } from "@/lib/digit";
import { hashSeed } from "@/lib/coverage";
import { mulberry32 } from "@/lib/stats";

const COUNT_OPTIONS = [1, 5, 10];

/** 生成 N 注：支持「均匀随机」与「按各位历史频率加权」两种风格；两者都保证互不重复 */
function generate(
  posFreq: number[][],
  count: number,
  weighted: boolean,
  seed: number
): number[][] {
  const cfg = P5_CONFIG;
  const rand = mulberry32(hashSeed("p5", "gen", seed));
  const weights = weighted
    ? posFreq.map((c) => {
        const total = c.reduce((a, b) => a + b, 0) + c.length;
        return c.map((x) => (x + 1) / total);
      })
    : null;

  const out: number[][] = [];
  const seen = new Set<string>();
  for (let t = 0; t < count; t++) {
    for (let tries = 0; tries < count * 40; tries++) {
      const ticket = Array.from({ length: cfg.positions }, (_, p) => {
        if (!weights) return Math.floor(rand() * (cfg.digitMax + 1));
        const w = weights[p];
        const r = rand();
        let acc = 0;
        for (let n = 0; n < w.length; n++) {
          acc += w[n];
          if (r <= acc) return n;
        }
        return cfg.digitMax;
      });
      const key = ticket.join("");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ticket);
      break;
    }
  }
  return out;
}

/** posFreq：每位 0-9 的历史出现次数（构建期由服务端算好传入，索引 0..digitMax） */
export default function DigitGeneratorView({ posFreq }: { posFreq: number[][] }) {
  const [count, setCount] = useState(5);
  const [weighted, setWeighted] = useState(false);
  const [seed, setSeed] = useState(1);

  const tickets = useMemo(
    () => (posFreq.length ? generate(posFreq, count, weighted, seed) : []),
    [posFreq, count, weighted, seed]
  );

  return (
    <div className="flex flex-col gap-5">
      <section className="pt-2 text-center">
        <h1 className="text-2xl font-bold text-white">号码生成器 · 排列五</h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-400">
          5 位数字、每位 0-9、允许重复与前导 0。生成的多注之间保证互不重复——
          这是本玩法唯一能真实省钱的地方（避免买到重复注）。
        </p>
      </section>

      <Disclaimer />

      {posFreq.length === 0 ? (
        <p className="card text-center text-sm text-slate-500">数据暂时不可用，请稍后再来。</p>
      ) : (
        <>
          <section className="card">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-400">注数</span>
                {COUNT_OPTIONS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCount(c)}
                    className={`rounded-lg px-3 py-1 text-xs transition-colors ${
                      count === c ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {c} 注
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-400">选号风格</span>
                <button
                  onClick={() => setWeighted(false)}
                  className={`rounded-lg px-3 py-1 text-xs transition-colors ${
                    !weighted ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  均匀随机
                </button>
                <button
                  onClick={() => setWeighted(true)}
                  className={`rounded-lg px-3 py-1 text-xs transition-colors ${
                    weighted ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  按历史频率加权
                </button>
              </div>
              <button
                onClick={() => setSeed(Math.floor(Math.random() * 2 ** 31))}
                className="ml-auto rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500"
              >
                ⟳ 换一批
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              两种风格的中奖概率<strong className="text-slate-400">完全相同</strong>（每位独立均匀，
              历史频率不改变未来）；区别只是号码看起来更「随机」还是更「贴合历史」。
            </p>
          </section>

          <section className="card">
            <h3 className="mb-3 text-sm font-semibold text-white">
              生成结果
              <span className="ml-2 text-xs font-normal text-slate-500">
                {tickets.length} 注 · 互不重复
              </span>
            </h3>
            <div className="flex flex-col gap-2">
              {tickets.map((t, i) => (
                <div
                  key={t.join("")}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-800/70 bg-slate-900/40 px-4 py-2.5"
                >
                  <span className="w-10 text-xs text-slate-500">第 {i + 1} 注</span>
                  <div className="flex items-center gap-1.5">
                    {t.map((n, p) => (
                      <DigitBall key={p} n={n} size="md" title={`第 ${p + 1} 位`} />
                    ))}
                  </div>
                  <span className="ml-auto text-xs tabular-nums text-slate-500">
                    号码 <span className="text-violet-300">{digitText(t)}</span> · 和值{" "}
                    <span className="text-amber-300/90">{t.reduce((a, b) => a + b, 0)}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
