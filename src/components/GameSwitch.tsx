import Link from "next/link";

/**
 * 彩种切换（链接式，不带共享状态）。
 * 组合型（大乐透/双色球）的切换按钮在各自的 GeneratorView/PredictView 内部，
 * 这里用链接把它们与数字型（排列五）的独立页面串起来，避免为了共享状态去重构已验证的组件。
 */
export type SwitchSection = "home" | "generator" | "predict";

const ITEMS: { key: string; label: string; href: Record<SwitchSection, string> }[] = [
  { key: "dlt", label: "超级大乐透", href: { home: "/dlt", generator: "/generator", predict: "/predict" } },
  { key: "ssq", label: "双色球", href: { home: "/ssq", generator: "/generator", predict: "/predict" } },
  { key: "p5", label: "排列五", href: { home: "/p5", generator: "/p5/generator", predict: "/p5/predict" } },
];

export default function GameSwitch({ section, active }: { section: SwitchSection; active: string }) {
  return (
    <div className="flex justify-center gap-2">
      {ITEMS.map((it) => {
        const on = it.key === active;
        return (
          <Link
            key={it.key}
            href={it.href[section]}
            className={`rounded-xl px-5 py-2 text-sm font-medium transition-colors ${
              on ? "bg-violet-600 text-white shadow" : "bg-slate-900 text-slate-400 hover:text-white"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
