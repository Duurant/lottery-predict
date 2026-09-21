import type { Metadata } from "next";
import GeneratorView from "@/components/GeneratorView";
import { loadGame } from "@/lib/data";
import { comboKey, type GameKey } from "@/lib/games";

export const metadata: Metadata = {
  title: "号码生成器",
  description:
    "大乐透、双色球机选号码生成器：支持奇偶比、大小比、和值范围、连号限制等条件过滤，自动排除历史重复组合。",
};

export default function GeneratorPage() {
  // 历史组合键合并为单个空格分隔字符串传输（comboKey 不含空格，安全），客户端再 split
  const historyKeysOf: Record<GameKey, string> = {
    dlt: loadGame("dlt").draws.map((d) => comboKey(d.red, d.blue)).join(" "),
    ssq: loadGame("ssq").draws.map((d) => comboKey(d.red, d.blue)).join(" "),
  };
  return <GeneratorView historyKeysOf={historyKeysOf} />;
}
