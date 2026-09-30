"use client";

import { useEffect, useRef, useState } from "react";

// 中文为据所列出处翻译的短句；出处随作者展示，便于核对原文。
const QUOTES = [
  {
    text: "概率论，本质上不过是把常识化为计算。",
    author: "拉普拉斯",
    source: "《概率的哲学论》",
    url: "https://www.gutenberg.org/cache/epub/58881/pg58881-images.html",
  },
  {
    text: "明智的人，会让信念的强度与证据相称。",
    author: "大卫·休谟",
    source: "《人类理解研究》",
    url: "https://www.gutenberg.org/files/9662/9662-h/9662-h",
  },
  {
    text: "人的全部尊严在于思想。",
    author: "帕斯卡",
    source: "《思想录》",
    url: "https://www.gutenberg.org/files/46921/46921-h/46921-h.htm",
  },
  {
    text: "我们凭借逻辑证明，凭借直觉创造。",
    author: "庞加莱",
    source: "《科学与方法》",
    url: "https://www.gutenberg.org/cache/epub/39713/pg39713-images.html",
  },
  {
    text: "数学是科学的女王，数论是数学的女王。",
    author: "高斯",
    source: "圣安德鲁斯大学数学史档案",
    url: "https://mathshistory.st-andrews.ac.uk/Biographies/Gauss/quotations/",
  },
] as const;

const LAST_QUOTE_KEY = "lottery-header-quote-v1";

export default function RefreshQuote() {
  // 首次渲染保持确定性，随机选择只在挂载后进行，避免静态页面水合不一致。
  const [index, setIndex] = useState(0);
  const selected = useRef(false);

  useEffect(() => {
    if (selected.current) return;
    selected.current = true;
    let previous = -1;
    try {
      const stored = sessionStorage.getItem(LAST_QUOTE_KEY);
      const value = stored === null ? -1 : Number(stored);
      if (Number.isInteger(value) && value >= 0 && value < QUOTES.length) previous = value;
    } catch {
      // 浏览器禁用存储时仍可展示名言，只是不保留上一句。
    }
    const choices = QUOTES.map((_, i) => i).filter((i) => i !== previous);
    const next = choices[Math.floor(Math.random() * choices.length)];
    setIndex(next);
    try { sessionStorage.setItem(LAST_QUOTE_KEY, String(next)); } catch { /* 不影响号码簿保存。 */ }
  }, []);

  const quote = QUOTES[index];
  return <div className="workspace-quote">
    <h1 className="sr-only">当期号码推荐</h1>
    <blockquote cite={quote.url} data-testid="header-quote">
      <p className="quote-text">“{quote.text}”</p>
      <footer className="quote-author">— <a href={quote.url} target="_blank" rel="noreferrer" title="查看出处，中文为译文">{quote.author}</a><span> · {quote.source}</span></footer>
    </blockquote>
  </div>;
}
