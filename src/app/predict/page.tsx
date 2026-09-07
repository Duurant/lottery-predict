import type { Metadata } from "next";
import PredictView from "@/components/PredictView";
import { loadGame } from "@/lib/data";
import type { Draw, GameKey } from "@/lib/games";

export const metadata: Metadata = {
  title: "多方案智能预测",
  description:
    "大乐透、双色球多方案号码推荐：热号追踪、冷号回补、冷热结合、遗漏回归、纯机选五种方案各出推荐号码并附历史回测对比。开奖为随机事件，内容仅供娱乐。",
};

export default function PredictPage() {
  const drawsOf: Record<GameKey, Draw[]> = {
    dlt: loadGame("dlt").draws,
    ssq: loadGame("ssq").draws,
  };
  return <PredictView drawsOf={drawsOf} />;
}
