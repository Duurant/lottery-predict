#!/usr/bin/env node
/**
 * 数据新鲜度校验
 *
 * 供 GitHub Actions 在每日抓取后调用：若「距开奖已超过 GRACE_HOURS 小时」的开奖日
 * 仍未出现在本地数据中，则退出码 1，让 workflow 运行失败以便发现静默漏抓。
 *
 * 注意：CI 内抓取本身是抓不到数据的（官方接口屏蔽机房 IP），真正的抓取由本地
 * Windows 计划任务 LotteryDataSync 完成；本脚本在 CI 里的作用是「看门狗」——
 * 发现数据不新鲜就报错。已知局限：法定休市（如春节）期间会连续误报，忽略即可。
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "data");

// 各彩种开奖规律（与 src/lib/games.ts、src/lib/digit.ts 保持一致）
const GAMES = [
  { key: "dlt", name: "超级大乐透", file: "dlt.json", drawDays: [1, 3, 6], drawTime: "21:25" },
  { key: "ssq", name: "双色球", file: "ssq.json", drawDays: [2, 4, 0], drawTime: "21:15" },
  { key: "p5", name: "排列五", file: "p5.json", drawDays: [0, 1, 2, 3, 4, 5, 6], drawTime: "20:30" },
];

const GRACE_HOURS = 18; // 官方接口录入延迟可达半天以上；开奖 18 小时后仍缺当期才告警，
                        // 避免官方上午才录入数据时 09:35/12:35 时段天天误报

function pad2(n) {
  return String(n).padStart(2, "0");
}

// 北京时间 = UTC+8，统一用 getUTC* 读取墙上时间，避免依赖运行环境时区
function beijingNow() {
  return new Date(Date.now() + 8 * 3600 * 1000);
}

/** 北京时间的开奖时刻 → 当天对应的 UTC 时刻（不再硬编码 21:30，各彩种开奖时间不同） */
function drawEpochUtc(y, m, d, drawTime) {
  const [hh, mm] = drawTime.split(":").map(Number);
  return Date.UTC(y, m, d, hh - 8, mm);
}

// 往前找最近一个「开奖时刻距今已超过 GRACE_HOURS」的开奖日，返回 YYYY-MM-DD 或 null
function latestStaleDrawDay(drawDays, drawTime, nowBeijing) {
  for (let back = 0; back <= 7; back++) {
    const t = new Date(nowBeijing.getTime() - back * 86400 * 1000);
    const y = t.getUTCFullYear();
    const m = t.getUTCMonth();
    const d = t.getUTCDate();
    const weekday = new Date(Date.UTC(y, m, d, 12)).getUTCDay();
    if (!drawDays.includes(weekday)) continue;
    const drawEpoch = drawEpochUtc(y, m, d, drawTime);
    const hoursSince = (Date.now() - drawEpoch) / 3600 / 1000;
    if (hoursSince < GRACE_HOURS) continue;
    return `${y}-${pad2(m + 1)}-${pad2(d)}`;
  }
  return null;
}

let failed = false;
const nowBeijing = beijingNow();

for (const g of GAMES) {
  const expect = latestStaleDrawDay(g.drawDays, g.drawTime, nowBeijing);
  const file = join(DATA_DIR, g.file);
  if (!existsSync(file)) {
    console.error(`  ✗ ${g.name}：${g.file} 不存在`);
    failed = true;
    continue;
  }
  let latest;
  try {
    const json = JSON.parse(readFileSync(file, "utf8"));
    latest = json.draws?.at(-1);
  } catch (e) {
    console.error(`  ✗ ${g.name}：${g.file} 解析失败（${e.message}）`);
    failed = true;
    continue;
  }
  if (!latest?.date) {
    console.error(`  ✗ ${g.name}：数据为空`);
    failed = true;
    continue;
  }
  if (expect && latest.date < expect) {
    console.error(
      `  ✗ ${g.name}：${expect} 应已开奖超过 ${GRACE_HOURS} 小时，但数据最新一期为 ${latest.date} [${latest.code}]，疑似漏抓`
    );
    failed = true;
  } else {
    console.log(`  ✓ ${g.name}：最新一期 ${latest.date} [${latest.code}]`);
  }
}

if (failed) {
  console.error("\n数据新鲜度校验未通过，请检查抓取日志或手动触发更新。");
  process.exit(1);
}
console.log("\n数据新鲜度校验通过 ✔");
