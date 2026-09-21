import type { Metadata } from "next";
import DigitPredictView, { type DigitPredictInitial } from "@/components/DigitPredictView";
import GameSwitch from "@/components/GameSwitch";
import { P5_CONFIG } from "@/lib/digit";
import { loadDigitGame } from "@/lib/digit-data";
import { encodeDigits } from "@/lib/compact";
import { compareDigit, runDigitStrategy } from "@/lib/digit-predict";

export const metadata: Metadata = {
  title: "排列五号码方案",
  description:
    "排列五号码方案：去重铺开 / 位置频率偏好 / 纯机选对照。排列五只有一个奖级、每位独立均匀，任何选号概率都相同，页面用解析概率与实测数字如实说明。仅供娱乐。",
};

export default function P5PredictPage() {
  const data = loadDigitGame("p5");
  const compact = encodeDigits(data.draws, P5_CONFIG.positions);
  // 初始参数（best / 5 注 / seed 1）在构建期算好，水合时不再跑全量对比
  const initial: DigitPredictInitial | null = data.draws.length
    ? {
        result: runDigitStrategy(P5_CONFIG, data.draws, "best", 5, 1),
        report: compareDigit(P5_CONFIG, data.draws, 5),
      }
    : null;
  return (
    <div className="flex flex-col gap-5">
      <GameSwitch section="predict" active="p5" />
      <DigitPredictView compact={compact} initial={initial} />
    </div>
  );
}
