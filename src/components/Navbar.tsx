"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const path = usePathname();
  return <header className="site-header"><nav className="site-nav" aria-label="主导航">
    <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">彩</span><span>号码手记<small>让选号简单一点</small></span></Link>
    <div className="nav-links"><a className={path === "/" ? "selected" : ""} href="/">当期推荐</a><Link className={["/dlt", "/ssq", "/p5"].includes(path) ? "selected" : ""} href="/dlt">研究历史</Link><a href="/?view=records">我的号码</a><Link className={path === "/about" ? "selected" : ""} href="/about">关于</Link></div>
    <span className="nav-note">免费 · 仅供娱乐</span>
  </nav></header>;
}
