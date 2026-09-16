"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const LINKS = [
  { href: "/", label: "首页" },
  { href: "/dlt", label: "大乐透" },
  { href: "/ssq", label: "双色球" },
  { href: "/p5", label: "排列五" },
  { href: "/generator", label: "号码生成" },
  { href: "/predict", label: "智能预测" },
  { href: "/about", label: "关于" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/85 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-white">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-red-500 to-red-700 text-sm shadow">
            🎱
          </span>
          <span className="text-base">
            彩票数据<span className="text-red-400">实验室</span>
          </span>
        </Link>

        {/* 桌面导航 */}
        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                isActive(l.href)
                  ? "bg-slate-800 font-medium text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* 移动端菜单按钮 */}
        <button
          className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="切换菜单"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </nav>

      {/* 移动端菜单 */}
      {open && (
        <div className="border-t border-slate-800 px-4 pb-3 md:hidden">
          <div className="grid grid-cols-3 gap-2 pt-3">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={`rounded-lg px-3 py-2 text-center text-sm ${
                  isActive(l.href)
                    ? "bg-slate-800 font-medium text-white"
                    : "bg-slate-900 text-slate-400"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
