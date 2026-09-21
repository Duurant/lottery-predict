"use client";

import { useState } from "react";

/**
 * 复制按钮（整批或单注号码）。
 * 剪贴板 API 只在 https / localhost 可用；失败时给出可见提示，
 * 而不是静默失败——用户按了没反应最难排查。
 */
export default function CopyButton({
  text,
  label = "复制",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("ok");
    } catch {
      setState("fail");
    }
    setTimeout(() => setState("idle"), 1800);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-live="polite"
      className={`rounded-lg bg-slate-800 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-700 ${className}`}
    >
      {state === "ok" ? "已复制 ✔" : state === "fail" ? "复制失败，请手动选择" : label}
    </button>
  );
}
