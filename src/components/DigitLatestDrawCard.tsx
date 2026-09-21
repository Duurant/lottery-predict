import Link from "next/link";
import CountdownTimer from "@/components/CountdownTimer";
import DigitBall from "@/components/DigitBall";
import { P5_CONFIG, digitText } from "@/lib/digit";
import type { DigitGameData } from "@/lib/digit-data";

/**
 * 首页的排列五最新开奖卡片（数字型：5 位有序数字，不补零、不排序）。
 * 结构与 LatestDrawCard 对齐：h3 标题 + 明确的「走势分析 →」链接，
 * 而不是整卡可点——三张卡并排时标题层级、可点区域与悬停反馈保持一致。
 */
export default function DigitLatestDrawCard({ data }: { data: DigitGameData }) {
  const cfg = P5_CONFIG;
  const latest = data.draws.at(-1);
  const sum = latest ? latest.digits.reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="card flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">{cfg.name}</h3>
        <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-400">
          每日 {cfg.drawTime}
        </span>
      </div>

      {latest ? (
        <>
          <p className="text-sm text-slate-400">
            第 <span className="font-semibold text-slate-200">{latest.code}</span> 期
            <span className="ml-2 tabular-nums">{latest.date}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {latest.digits.map((n, p) => (
              <DigitBall key={p} n={n} size="lg" title={`第 ${p + 1} 位`} />
            ))}
          </div>
          <p className="text-xs tabular-nums text-slate-500">
            号码 <span className="text-violet-300">{digitText(latest.digits)}</span> · 和值 {sum}
          </p>
          <div className="flex items-center justify-between">
            <CountdownTimer drawDays={cfg.drawDays} drawTime={cfg.drawTime} accent="text-violet-400" />
            <Link href="/p5" className="text-sm text-violet-400 hover:text-violet-300">
              走势分析 →
            </Link>
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-500">数据暂时不可用，请稍后再来。</p>
      )}
    </div>
  );
}
