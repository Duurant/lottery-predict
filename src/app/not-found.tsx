import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 pt-10 text-center">
      <div className="text-5xl">🎯</div>
      <h1 className="text-2xl font-bold text-slate-900">没有这个页面</h1>
      <p className="text-sm leading-relaxed text-slate-500">
        地址可能输错了，或者这个页面已经调整过。可以回到首页，或直接进入三个彩种的走势与分析：
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Link href="/" className="rounded-xl bg-red-100 px-5 py-2 text-sm font-medium text-slate-900 hover:bg-red-500">
          回到首页
        </Link>
        <Link href="/dlt" className="rounded-xl bg-white px-5 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">
          超级大乐透
        </Link>
        <Link href="/ssq" className="rounded-xl bg-white px-5 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">
          双色球
        </Link>
        <Link href="/p5" className="rounded-xl bg-white px-5 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">
          排列五
        </Link>
      </div>
    </div>
  );
}
