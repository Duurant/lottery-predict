/** 全站免责声明（简版横幅，完整版见关于页） */
export default function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800/90 ${
        compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm"
      }`}
    >
      ⚠️ 免责声明：彩票开奖为独立随机事件，任何算法与统计方法都无法预测或提高中奖概率。
      本站所有数据分析与号码推荐仅供娱乐参考，不构成任何投注依据。理性购彩，量力而行；未满
      18 周岁禁止购彩。
    </div>
  );
}
