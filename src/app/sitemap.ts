import type { MetadataRoute } from "next";

// 站点根域名：部署后请在环境变量中配置 SITE_URL（如 https://your-domain.com），
// 未配置时回退到默认占位域名。
const BASE_URL = process.env.SITE_URL ?? "https://lottery-lab.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/dlt", "/ssq", "/generator", "/predict", "/about"];
  return routes.map((r) => ({
    url: `${BASE_URL}${r}`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: r === "" ? 1 : 0.7,
  }));
}
