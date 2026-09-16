import Link from "next/link";
import CountdownTimer from "@/components/CountdownTimer";
import DigitBall from "@/components/DigitBall";
import { P5_CONFIG, digitText } from "@/lib/digit";
import type { DigitGameData } from "@/lib/digit-data";

/** 首页的排列五最新开奖卡片（数字型：5 位有序数字，不补零、不排序） */
export default function DigitLatestDrawCard({ data }: { data: DigitGameData }) {
  const cfg = P5_CONFIG;
  const latest = data.draws.at(-1);
  const sum = latest ? latest.digits.reduce((a, b) => a + b, 0) : 0;

  return (
    <Link
      href="/p5"
      className="card transition-colors hover:border-violet-500/50 hover:bg-slate-900"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="font-semibold text-white">{cfg.name}</span>
        <span className="text-xs text-slate-500">{latest ? `第 ${latest.code} 期` : "暂无数据"}</span>
      </div>
      {latest ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {latest.digits.map((n, p) => (
              <DigitBall key={p} n={n} size="lg" title={`第 ${p + 1} 位`} />
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span className="tabular-nums">{latest.date}</span>
            <span className="tabular-nums">
              号码 <span className="text-violet-300">{digitText(latest.digits)}</span> · 和值 {sum}
            </span>
          </div>
          <div className="mt-2 flex justify-end">
            <CountdownTimer drawDays={cfg.drawDays} drawTime={cfg.drawTime} compact />
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-500">请先运行 npm run fetch -- --only p5</p>
      )}
    </Link>
  );
}
