import type { Metadata } from "next";
import Disclaimer from "@/components/Disclaimer";

export const metadata: Metadata = {
  title: "关于与免责声明",
  description: "本站定位、数据来源说明与完整免责声明。",
};

export default function AboutPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 pt-2">
      <section className="card">
        <h1 className="mb-3 text-xl font-bold text-white">关于本站</h1>
        <div className="flex flex-col gap-3 text-sm leading-relaxed text-slate-300">
          <p>
            这是一份开源免费的彩票数据娱乐工具，覆盖<strong className="text-white">超级大乐透</strong>与
            <strong className="text-white">双色球</strong>两个彩种，提供：
          </p>
          <ul className="list-inside list-disc space-y-1 text-slate-400">
            <li>经典走势图：期号 × 号码网格、遗漏标注、同号轨迹连线</li>
            <li>统计分析：号码频率、冷热榜、当前遗漏、和值走势、奇偶比分布</li>
            <li>历史查询：按期号或日期检索开奖公告</li>
            <li>号码生成器：均匀随机机选 + 形态条件过滤</li>
            <li>
              多方案智能预测：热号追踪 / 冷号回补 / 冷热结合 / 遗漏回归 / 纯机选五种方案，附历史回测对比
            </li>
          </ul>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-bold text-white">数据说明</h2>
        <div className="flex flex-col gap-2 text-sm leading-relaxed text-slate-300">
          <p>
            开奖数据分别同步自
            <strong className="text-white">中国体彩网</strong>（大乐透）与
            <strong className="text-white">中国福利彩票官网</strong>
            （双色球）的公开开奖公告接口，由抓取脚本每日自动更新、逐期校验后入库。
          </p>
          <p className="text-slate-400">
            大乐透收录自 2007 年首期；双色球收录自 2013 年（福彩公开查询接口的数据窗口所限）。
            如发现数据与官方公告不一致，以官方公告为准。
          </p>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-bold text-white">「预测」是什么？</h2>
        <div className="flex flex-col gap-2 text-sm leading-relaxed text-slate-300">
          <p>
            本站的「智能预测」是把常见选号思路（追热、搏冷、冷热结合、遗漏回归）做成可交互的统计玩具，
            并用<strong className="text-white">历史回测</strong>展示每种方案的真实表现。
          </p>
          <p>
            回测结论很直白：所有方案的平均命中都与随机选号的期望处于同一水平。
            因为每一期开奖都是<strong className="text-white">独立随机事件</strong>，
            历史号码不会影响未来结果——任何声称能提高中奖概率的算法（尤其是收费的）都是虚假宣传。
          </p>
          <p>
            我们把这一点做成产品的一部分：方案对比表里那条「随机期望」参考线，
            就是给所有花哨统计的一面镜子。
          </p>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-bold text-white">免责声明</h2>
        <Disclaimer />
        <ul className="mt-3 list-inside list-disc space-y-1 text-xs leading-relaxed text-slate-500">
          <li>本站与国家体彩、福彩机构无任何关联，不代购、不销售彩票，不提供任何付费服务。</li>
          <li>所有数据、图表、推荐仅供个人学习与娱乐，不构成任何投注建议或依据。</li>
          <li>购彩有风险，请理性投注、量力而行；未满 18 周岁人员禁止购彩兑奖。</li>
          <li>因使用本站内容而产生的任何直接或间接损失，本站不承担责任。</li>
        </ul>
      </section>
    </div>
  );
}
