import type { Metadata } from "next";
import DigitGeneratorView from "@/components/DigitGeneratorView";
import GameSwitch from "@/components/GameSwitch";
import { loadDigitGame } from "@/lib/digit-data";

export const metadata: Metadata = {
  title: "排列五号码生成器",
  description:
    "排列五机选号码生成：5 位数字、每位 0-9，可均匀随机或按历史频率加权，生成的多注保证互不重复（本玩法唯一真实优化）。开奖为随机事件，仅供娱乐。",
};

export default function P5GeneratorPage() {
  const data = loadDigitGame("p5");
  return (
    <div className="flex flex-col gap-5">
      <GameSwitch section="generator" active="p5" />
      <DigitGeneratorView draws={data.draws} />
    </div>
  );
}
