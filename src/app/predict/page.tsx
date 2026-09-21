import type { Metadata } from "next";
import PredictView, { type PredictInitial } from "@/components/PredictView";
import { loadGame } from "@/lib/data";
import { GAMES, type GameKey } from "@/lib/games";
import { encodeDraws } from "@/lib/compact";
import { backtestAll, compareCoverage, runStrategy } from "@/lib/predict";

export const metadata: Metadata = {
  title: "多方案智能预测",
  description:
    "大乐透、双色球号码方案：最优/次优（覆盖优化，同价位覆盖更多号码）与纯机选对照，附全量回测、覆盖率配对检验与置信区间。开奖为随机事件，任何方案都无法提高单注中奖概率，内容仅供娱乐。",
};

export default function PredictPage() {
  const drawsOf: Record<GameKey, ReturnType<typeof loadGame>["draws"]> = {
    dlt: loadGame("dlt").draws,
    ssq: loadGame("ssq").draws,
  };
  const compactOf = {
    dlt: encodeDraws(drawsOf.dlt, GAMES.dlt.redCount, GAMES.dlt.blueCount),
    ssq: encodeDraws(drawsOf.ssq, GAMES.ssq.redCount, GAMES.ssq.blueCount),
  };
  // 初始状态在构建期算好（与客户端同一套函数、同一口径），水合时不再全量回测；
  // 用户切换方案/注数/换一批时才在客户端重算
  const initial: PredictInitial | null = drawsOf.dlt.length
    ? {
        result: runStrategy(GAMES.dlt, drawsOf.dlt, "best", 5, 1),
        comparison: backtestAll(GAMES.dlt, drawsOf.dlt, 5),
        coverage: compareCoverage(GAMES.dlt, drawsOf.dlt, 5),
      }
    : null;
  return <PredictView compactOf={compactOf} initial={initial} />;
}
