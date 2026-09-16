import type { Metadata } from "next";
import PredictView from "@/components/PredictView";
import { loadGame } from "@/lib/data";
import type { Draw, GameKey } from "@/lib/games";

export const metadata: Metadata = {
  title: "多方案智能预测",
  description:
    "大乐透、双色球号码方案：最优/次优（覆盖优化，同价位覆盖更多号码）与纯机选对照，附全量回测、覆盖率配对检验与置信区间。开奖为随机事件，任何方案都无法提高单注中奖概率，内容仅供娱乐。",
};

export default function PredictPage() {
  const drawsOf: Record<GameKey, Draw[]> = {
    dlt: loadGame("dlt").draws,
    ssq: loadGame("ssq").draws,
  };
  return <PredictView drawsOf={drawsOf} />;
}
