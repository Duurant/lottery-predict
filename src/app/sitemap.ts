import type { MetadataRoute } from "next";

// 站点根域名：部署后可在环境变量中配置 SITE_URL（如 https://lottery-predict.com），
// 未配置时回退到下面的默认域名。
const BASE_URL = process.env.SITE_URL ?? "https://lottery-predict.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "",
    "/dlt",
    "/ssq",
    "/p5",
    "/generator",
    "/p5/generator",
    "/predict",
    "/p5/predict",
    "/about",
  ];
  return routes.map((r) => ({
    url: `${BASE_URL}${r}`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: r === "" ? 1 : 0.7,
  }));
}
