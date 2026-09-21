import type { Metadata } from "next";
import DigitGeneratorView from "@/components/DigitGeneratorView";
import GameSwitch from "@/components/GameSwitch";
import { P5_CONFIG, positionFreq } from "@/lib/digit";
import { loadDigitGame } from "@/lib/digit-data";

export const metadata: Metadata = {
  title: "排列五号码生成器",
  description:
    "排列五机选号码生成：5 位数字、每位 0-9，可均匀随机或按历史频率加权，生成的多注保证互不重复（本玩法唯一真实优化）。开奖为随机事件，仅供娱乐。",
};

export default function P5GeneratorPage() {
  const data = loadDigitGame("p5");
  // 生成器只需要「每位 0-9 的历史出现次数」（5×10 共 50 个计数），
  // 在构建期算好直接传，不再把 7728 期开奖序列化进页面
  const posFreq = Array.from({ length: P5_CONFIG.positions }, (_, p) =>
    positionFreq(data.draws, p, P5_CONFIG.digitMax)
  );
  return (
    <div className="flex flex-col gap-5">
      <GameSwitch section="generator" active="p5" />
      <DigitGeneratorView posFreq={posFreq} />
    </div>
  );
}
