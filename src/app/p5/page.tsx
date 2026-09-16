import type { Metadata } from "next";
import DigitBall from "@/components/DigitBall";
import CountdownTimer from "@/components/CountdownTimer";
import DigitGameView from "@/components/DigitGameView";
import Disclaimer from "@/components/Disclaimer";
import GameSwitch from "@/components/GameSwitch";
import { P5_CONFIG } from "@/lib/digit";
import { loadDigitGame } from "@/lib/digit-data";

export const metadata: Metadata = {
  title: "排列五走势图与统计分析",
  description:
    "排列五开奖结果、五位走势图、各位数字频率与遗漏、和值跨度重号统计、历史查询，数据同步中国体彩官网。开奖为随机事件，仅供娱乐参考。",
};

export default function P5Page() {
  const cfg = P5_CONFIG;
  const data = loadDigitGame("p5");
  const latest = data.draws.at(-1);

  return (
    <div className="flex flex-col gap-5">
      <GameSwitch section="home" active="p5" />

      {/* 页头：最新开奖 */}
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white">{cfg.name}</h1>
            {latest ? (
              <p className="mt-1 text-sm text-slate-400">
                第 <span className="font-semibold text-slate-200">{latest.code}</span> 期
                <span className="ml-2 tabular-nums">{latest.date}</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-500">暂无数据，请先运行 npm run fetch -- --only p5</p>
            )}
          </div>
          {latest && (
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-1.5">
                {latest.digits.map((n, p) => (
                  <DigitBall key={p} n={n} size="lg" title={`第 ${p + 1} 位`} />
                ))}
              </div>
              <CountdownTimer drawDays={cfg.drawDays} drawTime={cfg.drawTime} compact />
            </div>
          )}
        </div>
        {latest && (
          <p className="mt-3 text-xs text-slate-500">
            排列五每日开奖（{cfg.drawTime}），5 位数字按位对奖、只有一个奖级；数字可重复、可有前导 0。
          </p>
        )}
      </section>

      <DigitGameView draws={data.draws} />

      <Disclaimer compact />
    </div>
  );
}
