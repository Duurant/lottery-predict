import type { Metadata } from "next";
import DigitPredictView from "@/components/DigitPredictView";
import GameSwitch from "@/components/GameSwitch";
import { loadDigitGame } from "@/lib/digit-data";

export const metadata: Metadata = {
  title: "排列五号码方案",
  description:
    "排列五号码方案：去重铺开 / 位置频率偏好 / 纯机选对照。排列五只有一个奖级、每位独立均匀，任何选号概率都相同，页面用解析概率与实测数字如实说明。仅供娱乐。",
};

export default function P5PredictPage() {
  const data = loadDigitGame("p5");
  return (
    <div className="flex flex-col gap-5">
      <GameSwitch section="predict" active="p5" />
      <DigitPredictView draws={data.draws} />
    </div>
  );
}
