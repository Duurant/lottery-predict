"use client";

import { useMemo, useState } from "react";
import Ball from "@/components/Ball";
import Disclaimer from "@/components/Disclaimer";
import { generateCombos, type GenCombo, type GenOptions } from "@/lib/generate";
import { GAMES, type GameKey } from "@/lib/games";

const COUNTS = [1, 2, 3, 5, 8, 10];

function comboText(c: GenCombo): string {
  return (
    c.red.map((n) => String(n).padStart(2, "0")).join(" ") +
    " + " +
    c.blue.map((n) => String(n).padStart(2, "0")).join(" ")
  );
}

export default function GeneratorView({
  historyKeysOf,
}: {
  historyKeysOf: Record<GameKey, string[]>;
}) {
  const [game, setGame] = useState<GameKey>("dlt");
  const [count, setCount] = useState(5);
  const [opts, setOpts] = useState<GenOptions>({
    count: 5,
    oddEven: "any",
    bigSmall: "any",
    sumMin: 0,
    sumMax: 999,
    maxConsec: 99,
    excludeHistory: true,
  });
  const [combos, setCombos] = useState<GenCombo[]>([]);
  const [relaxed, setRelaxed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const cfg = GAMES[game];
  const historySet = useMemo(
    () => new Set(historyKeysOf[game]),
    [game, historyKeysOf]
  );

  function update(patch: Partial<GenOptions>) {
    setOpts((o) => ({ ...o, ...patch }));
  }

  function generate() {
    const res = generateCombos(cfg, { ...opts, count }, historySet);
    setCombos(res.combos);
    setRelaxed(res.relaxed);
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* 剪贴板不可用时静默失败 */
    }
  }

  const label = "mb-1 block text-xs text-slate-400";
  const input =
    "w-full rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-1.5 text-sm text-slate-200 focus:border-red-500 focus:outline-none";

  return (
    <div className="flex flex-col gap-5">
      <section className="pt-2 text-center">
        <h1 className="text-2xl font-bold text-white">号码生成器</h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-400">
          均匀随机机选，可按奇偶比、大小比、和值范围、连号数等条件过滤，自动避开历史上开出过的完全相同组合。
        </p>
      </section>

      <Disclaimer />

      <div className="flex justify-center gap-2">
        {(["dlt", "ssq"] as GameKey[]).map((g) => (
          <button
            key={g}
            onClick={() => {
              setGame(g);
              setCombos([]);
            }}
            className={`rounded-xl px-5 py-2 text-sm font-medium transition-colors ${
              game === g
                ? "bg-red-600 text-white shadow"
                : "bg-slate-900 text-slate-400 hover:text-white"
            }`}
          >
            {GAMES[g].name}
          </button>
        ))}
      </div>

      {/* 条件面板 */}
      <section className="card">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={label}>注数</label>
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className={input}
            >
              {COUNTS.map((c) => (
                <option key={c} value={c}>
                  {c} 注
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>奇偶比（{cfg.redName}）</label>
            <select
              value={opts.oddEven}
              onChange={(e) => update({ oddEven: e.target.value as GenOptions["oddEven"] })}
              className={input}
            >
              <option value="any">不限</option>
              <option value="balanced">均衡（相差 ≤ 1）</option>
              <option value="odd">偏奇</option>
              <option value="even">偏偶</option>
            </select>
          </div>
          <div>
            <label className={label}>大小比（{cfg.redName}）</label>
            <select
              value={opts.bigSmall}
              onChange={(e) => update({ bigSmall: e.target.value as GenOptions["bigSmall"] })}
              className={input}
            >
              <option value="any">不限</option>
              <option value="balanced">均衡（相差 ≤ 1）</option>
              <option value="big">偏大</option>
              <option value="small">偏小</option>
            </select>
          </div>
          <div>
            <label className={label}>连号限制</label>
            <select
              value={opts.maxConsec}
              onChange={(e) => update({ maxConsec: Number(e.target.value) })}
              className={input}
            >
              <option value={99}>不限</option>
              <option value={3}>最多 3 连号</option>
              <option value={2}>最多 2 连号</option>
            </select>
          </div>
          <div>
            <label className={label}>和值下限（{cfg.redName}）</label>
            <input
              type="number"
              value={opts.sumMin === 0 ? "" : opts.sumMin}
              placeholder="不限"
              onChange={(e) => update({ sumMin: Number(e.target.value) || 0 })}
              className={input}
            />
          </div>
          <div>
            <label className={label}>和值上限（{cfg.redName}）</label>
            <input
              type="number"
              value={opts.sumMax === 999 ? "" : opts.sumMax}
              placeholder="不限"
              onChange={(e) => update({ sumMax: e.target.value ? Number(e.target.value) : 999 })}
              className={input}
            />
          </div>
          <div className="flex items-end">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={opts.excludeHistory}
                onChange={(e) => update({ excludeHistory: e.target.checked })}
                className="h-4 w-4 accent-red-600"
              />
              排除历史重复组合
            </label>
          </div>
          <div className="flex items-end">
            <button
              onClick={generate}
              className="w-full rounded-lg bg-red-600 py-2 text-sm font-semibold text-white shadow transition-colors hover:bg-red-500"
            >
              🎲 生成号码
            </button>
          </div>
        </div>
      </section>

      {/* 结果 */}
      {(combos.length > 0 || relaxed) && (
        <section className="card">
          {combos.length > 0 ? (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-white">
                  生成结果（{cfg.name} {combos.length} 注）
                </h2>
                <button
                  onClick={() => copy(combos.map(comboText).join("\n"), "__all__")}
                  className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
                >
                  {copied === "__all__" ? "已复制 ✔" : "复制全部"}
                </button>
              </div>
              <div className="flex flex-col gap-3">
                {combos.map((c, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-800/70 bg-slate-900/40 px-4 py-3"
                  >
                    <span className="w-10 text-xs text-slate-500">第 {i + 1} 注</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {c.red.map((n) => (
                        <Ball key={`r${n}`} n={n} zone="red" />
                      ))}
                      <span className="mx-1 text-slate-600">+</span>
                      {c.blue.map((n) => (
                        <Ball key={`b${n}`} n={n} zone="blue" />
                      ))}
                    </div>
                    <span className="text-xs tabular-nums text-slate-500">
                      和值 <span className="text-amber-300/90">{c.sum}</span> · 奇偶 {c.oddEven} · 大小{" "}
                      {c.bigSmall}
                    </span>
                    <button
                      onClick={() => copy(comboText(c), String(i))}
                      className="ml-auto rounded-lg bg-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700"
                    >
                      {copied === String(i) ? "已复制 ✔" : "复制"}
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <h2 className="mb-3 text-base font-bold text-white">生成结果（{cfg.name}）</h2>
          )}
          {relaxed && (
            <p className={`text-xs leading-relaxed text-amber-400/90 ${combos.length > 0 ? "mt-3" : ""}`}>
              ⚠️ 当前条件组合过紧，{combos.length > 0 ? `仅生成 ${combos.length} 注，未凑满 ${count} 注` : "未能生成符合条件的号码"}。
              请适当放宽和值、奇偶、大小或连号限制后重试。
            </p>
          )}
          <p className="mt-3 text-[11px] text-slate-600">
            生成结果为均匀随机抽样，与任何开奖结果均无关联，仅供娱乐。
          </p>
        </section>
      )}
    </div>
  );
}
