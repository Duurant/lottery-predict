import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "号码手记 | 大乐透 · 双色球 · 排列五 号码推荐与记录",
    template: "%s | 号码手记",
  },
  description:
    "大乐透、双色球、排列五当期推荐、偏好搭配、本地记录与开奖核对：号码频率、冷热号、遗漏值、走势图、历史查询、号码生成器与多方案趣味推荐。数据自动同步官方开奖公告，仅供娱乐，理性购彩。",
  keywords: ["大乐透", "双色球", "走势图", "遗漏值", "冷热号", "号码生成器", "彩票统计"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen flex-col">
        <Navbar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
          <p className="mb-1">
            本站为开源统计娱乐工具，与国家体彩、福彩机构无任何关联，不提供任何付费服务或投注渠道。
          </p>
          <p>
            数据来源：
            <Link
              href="https://www.lottery.gov.cn/"
              target="_blank"
              className="mx-0.5 text-slate-500 underline decoration-dotted hover:text-slate-700"
            >
              中国体彩网
            </Link>
            、
            <Link
              href="https://www.cwl.gov.cn/"
              target="_blank"
              className="mx-0.5 text-slate-500 underline decoration-dotted hover:text-slate-700"
            >
              中国福利彩票官网
            </Link>
            公开开奖公告 · 仅供娱乐，理性购彩，未满 18 周岁禁止购彩
          </p>
        </footer>
      </body>
    </html>
  );
}
