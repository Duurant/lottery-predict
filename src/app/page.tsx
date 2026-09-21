import Link from "next/link";
import Disclaimer from "@/components/Disclaimer";
import DigitLatestDrawCard from "@/components/DigitLatestDrawCard";
import LatestDrawCard from "@/components/LatestDrawCard";
import { loadGame } from "@/lib/data";
import { loadDigitGame } from "@/lib/digit-data";

const FEATURES = [
  {
    href: "/dlt",
    emoji: "📈",
    title: "走势图",
    desc: "大乐透 / 双色球经典期号×号码网格，红球高亮、遗漏标注，30/50/100 期切换；排列五按位独立走势。",
  },
  {
    href: "/ssq",
    emoji: "🧮",
    title: "统计分析",
    desc: "号码频率、冷热排行、当前遗漏、和值趋势、奇偶大小分布一应俱全，三个彩种各有面板。",
  },
  {
    href: "/generator",
    emoji: "🎲",
    title: "号码生成器",
    desc: "机选 + 条件过滤：奇偶比、大小比、和值范围、连号限制，一键多注、可复制。",
  },
  {
    href: "/predict",
    emoji: "🔮",
    title: "多方案智能预测",
    desc: "最优 / 次优 / 纯机选三种方案，同价位覆盖更多号码，附全量回测与配对检验。",
  },
  {
    href: "/p5",
    emoji: "🎯",
    title: "排列五专区",
    desc: "5 位数字按位分析：各位频率与遗漏、和值跨度、重号统计，以及去重铺开方案。",
  },
];

export default function Home() {
  const dlt = loadGame("dlt");
  const ssq = loadGame("ssq");
  const p5 = loadDigitGame("p5");

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section className="pt-4 text-center">
        <h1 className="text-3xl font-bold text-white md:text-4xl">
          大乐透 · 双色球 · 排列五
          <span className="bg-gradient-to-r from-red-400 via-blue-400 to-violet-400 bg-clip-text text-transparent">
            {" "}
            数据实验室
          </span>
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400 md:text-base">
          历史开奖数据自动同步官方公告，提供走势图、统计分析、号码生成与多方案趣味推荐。
          开奖是独立随机事件，本站内容仅供娱乐，请理性购彩。
        </p>
      </section>

      {/* 最新开奖 */}
      <section className="grid gap-4 md:grid-cols-3">
        <LatestDrawCard game="dlt" data={dlt} />
        <LatestDrawCard game="ssq" data={ssq} />
        <DigitLatestDrawCard data={p5} />
      </section>

      <Disclaimer />

      {/* 功能入口 */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {FEATURES.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className="card group transition-colors hover:border-slate-600 hover:bg-slate-900"
          >
            <div className="mb-2 text-2xl">{f.emoji}</div>
            <div className="mb-1 font-semibold text-white group-hover:text-red-400">
              {f.title}
            </div>
            <p className="text-xs leading-relaxed text-slate-400">{f.desc}</p>
          </Link>
        ))}
      </section>

      {/* 数据概况 */}
      <section className="card text-center text-xs text-slate-500">
        数据覆盖：大乐透 {dlt.draws.length} 期（{dlt.draws[0]?.date} 起） · 双色球{" "}
        {ssq.draws.length} 期（{ssq.draws[0]?.date} 起，福彩公开接口数据窗口自 2013 年起） · 排列五{" "}
        {p5.draws.length} 期（{p5.draws[0]?.date} 起，每日开奖）
        {dlt.updatedAt && ` · 最近同步：${dlt.updatedAt.slice(0, 10)}`}
      </section>
    </div>
  );
}
