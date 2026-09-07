# 彩票数据实验室（大乐透 · 双色球）

一个开源的彩票历史数据统计与娱乐工具网站：自动同步官方开奖公告，提供走势图、统计分析、历史查询、号码生成器与多方案趣味「预测」。

> ⚠️ 免责声明：彩票开奖为独立随机事件，任何算法与统计方法都无法预测或提高中奖概率。本站所有数据分析与号码推荐仅供娱乐参考，不构成任何投注依据。理性购彩，量力而行；未满 18 周岁禁止购彩。

## 功能

| 模块 | 说明 |
| --- | --- |
| 走势图 | 期号 × 号码网格，遗漏标注、同号轨迹连线，30 / 50 / 100 期切换 |
| 统计分析 | 号码频率图、冷热榜、当前遗漏排行、奇偶比分布、和值走势（可缩放） |
| 历史查询 | 按期号或日期检索开奖公告，分页浏览 |
| 号码生成器 | 均匀随机机选 + 形态条件过滤（奇偶比 / 大小比 / 和值范围 / 连号限制），自动避开历史重复组合 |
| 智能预测 | 热号追踪 / 冷号回补 / 冷热结合 / 遗漏回归 / 纯机选 五种方案，附 100 期历史回测对比与随机期望参考线 |

数据覆盖：

- **超级大乐透**：自 2007 年首期起（中国体彩网公开接口）
- **双色球**：自 2013 年起（中国福利彩票官网公开查询接口的数据窗口所限）

## 本地开发

环境要求：Node.js ≥ 20.9（建议 22+）、npm。

```bash
# 1. 安装依赖
npm install

# 2. 抓取开奖数据（写入 data/dlt.json、data/ssq.json）
npm run fetch

# 3. 本地开发（http://localhost:3000）
npm run dev
```

生产构建与预览：

```bash
npm run build
npm run start        # http://localhost:3000
```

数据抓取脚本其它用法见 `scripts/fetch-data.mjs` 顶部注释：

```bash
npm run fetch              # 增量抓取（默认，与本地数据重叠即停）
npm run fetch -- --full    # 全量重抓
npm run fetch -- --only dlt|ssq   # 只抓指定彩种
```

## 数据来源

- **大乐透**：中国体彩网 webapi.sporttery.cn（官方公开接口，需带浏览器 UA 与 Referer）
- **双色球**：中国福利彩票官网 www.cwl.gov.cn（官方公开接口，需浏览器 UA + Referer）

数据由 `.github/workflows/update-data.yml` 每日 22:05（北京时间）自动抓取一次；`data/*.json` 有变化时自动提交并推送，触发 Vercel 重新部署。抓取脚本对每条记录做号码数量、范围与重复校验，保证入库数据可用。

## 技术栈

- [Next.js](https://nextjs.org/)（App Router，全静态化输出）+ React + TypeScript
- Tailwind CSS 4 样式
- ECharts 6 图表
- 纯 Node.js 抓取脚本（无额外依赖）

## 部署

站点为纯静态输出，可在任意托管平台部署；以 Vercel 为例：

1. 将本仓库推送到 GitHub（建议先设为私有仓库）
2. 在 [Vercel](https://vercel.com) 中 **Add New → Project** 导入该仓库，框架选择 Next.js，其余保持默认，点击 Deploy（零配置）
3. 部署完成后在 Vercel 项目 Settings 中：
   - 绑定自定义域名（可选）
   - 添加环境变量 `SITE_URL=https://你的域名`（影响 `/sitemap.xml` 与 `/robots.txt`；不配则回退到默认占位域名）
4. GitHub Actions 每日自动同步数据；也可在仓库 **Actions → 每日开奖数据更新 → Run workflow** 手动触发一次验证

## 目录结构

```
├── data/                  # 抓取得到的开奖数据（dlt.json / ssq.json）
├── scripts/
│   └── fetch-data.mjs     # 官方数据抓取脚本（增量/全量）
├── src/
│   ├── app/               # 路由页面（/ /dlt /ssq /generator /predict /about）
│   │   ├── icon.svg       # 站点图标
│   │   ├── sitemap.ts     # 站点地图（域名取自 SITE_URL）
│   │   └── robots.ts      # 爬虫规则
│   ├── components/        # 页面组件（走势图/统计/查询/生成器/预测）
│   └── lib/               # 游戏配置、数据读取、统计、生成与预测算法
├── .github/workflows/     # 每日数据更新流水线
└── package.json
```

## 许可

本项目仅作学习与技术演示用途，代码采用 MIT License 发布（见 LICENSE 文件，若未包含则以本仓库为准）。与国家体彩、福彩机构无任何关联，不代购、不销售彩票，不提供任何付费服务或投注渠道。
