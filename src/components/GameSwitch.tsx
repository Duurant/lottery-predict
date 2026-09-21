"use client";

import Link from "next/link";

/**
 * 彩种切换（三彩种统一样式与顺序：大乐透 → 双色球 → 排列五）。
 *
 * 两种用法：
 *  - 纯跳转（各彩种主页、排列五的生成/预测页）：三个都是链接；
 *  - 页内切换（/generator、/predict 内部同时支持大乐透与双色球）：
 *    传 onSelect，此时组合型两项渲染为按钮、由调用方切换状态，排列五仍是链接。
 *
 * 组合型的生成/预测页是同一个页面内的客户端状态，跳转链接会带上 ?g= 参数，
 * 从排列五页面切回来时能直接打开对应彩种。
 */
export type SwitchSection = "home" | "generator" | "predict";
export type ComboKey = "dlt" | "ssq";

const ITEMS: { key: ComboKey | "p5"; label: string; href: Record<SwitchSection, string> }[] = [
  {
    key: "dlt",
    label: "超级大乐透",
    href: { home: "/dlt", generator: "/generator?g=dlt", predict: "/predict?g=dlt" },
  },
  {
    key: "ssq",
    label: "双色球",
    href: { home: "/ssq", generator: "/generator?g=ssq", predict: "/predict?g=ssq" },
  },
  {
    key: "p5",
    label: "排列五",
    href: { home: "/p5", generator: "/p5/generator", predict: "/p5/predict" },
  },
];

export default function GameSwitch({
  section,
  active,
  onSelect,
}: {
  section: SwitchSection;
  active: string;
  /** 页内切换组合型彩种（/generator、/predict）：传了则 dlt/ssq 渲染为按钮 */
  onSelect?: (key: ComboKey) => void;
}) {
  const cls = (on: boolean) =>
    `rounded-xl px-5 py-2 text-sm font-medium transition-colors ${
      on ? "bg-violet-600 text-white shadow" : "bg-slate-900 text-slate-400 hover:text-white"
    }`;

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {ITEMS.map((it) => {
        const on = it.key === active;
        if (onSelect && it.key !== "p5") {
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => onSelect(it.key as ComboKey)}
              aria-pressed={on}
              className={cls(on)}
            >
              {it.label}
            </button>
          );
        }
        return (
          <Link key={it.key} href={it.href[section]} aria-current={on ? "page" : undefined} className={cls(on)}>
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
