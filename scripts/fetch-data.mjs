#!/usr/bin/env node
/**
 * 开奖数据抓取脚本
 *
 * 数据源（官方）：
 *  - 大乐透：中国体彩网 webapi.sporttery.cn（分页 JSON 接口）
 *  - 双色球：中国福利彩票官网 www.cwl.gov.cn（JSON 接口，需浏览器 UA + Referer）
 *
 * 用法：
 *  - npm run fetch            增量抓取（默认）：已有数据则只抓到与本地重叠为止
 *  - npm run fetch -- --full  全量抓取
 *  - npm run fetch -- --only dlt   只抓大乐透
 *  - npm run fetch -- --only ssq   只抓双色球
 *
 * 输出：data/dlt.json / data/ssq.json（按开奖日期升序，紧凑 JSON）
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "data");

const args = process.argv.slice(2);
const FULL = args.includes("--full");
const ONLY = (() => {
  const i = args.indexOf("--only");
  return i >= 0 ? args[i + 1] : null;
})();

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const GAMES = {
  dlt: {
    name: "超级大乐透",
    file: "dlt.json",
    drawDays: [1, 3, 6], // 周一、三、六（北京时间）
    drawTime: "21:25",
    validate: (d) => {
      assertSet(d.red, 5, 1, 35, "前区");
      assertSet(d.blue, 2, 1, 12, "后区");
    },
    fetchAll: fetchDlt,
  },
  ssq: {
    name: "双色球",
    file: "ssq.json",
    drawDays: [2, 4, 0], // 周二、四、日（北京时间）
    drawTime: "21:15",
    validate: (d) => {
      assertSet(d.red, 6, 1, 33, "红球");
      assertSet(d.blue, 1, 1, 16, "蓝球");
    },
    fetchAll: fetchSsq,
  },
};

function assertSet(nums, count, min, max, label) {
  if (!Array.isArray(nums) || nums.length !== count)
    throw new Error(`${label}应为 ${count} 个号码，实际 ${nums?.length}`);
  for (const n of nums) {
    if (!Number.isInteger(n) || n < min || n > max)
      throw new Error(`${label}号码 ${n} 超出范围 ${min}-${max}`);
  }
  if (new Set(nums).size !== count) throw new Error(`${label}存在重复号码`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, headers, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(20000),
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      const wait = 1000 * Math.pow(2.5, i);
      console.log(`    请求失败（${e.message}），${(wait / 1000).toFixed(1)}s 后重试 ${i + 1}/${tries}`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

/* ---------------- 大乐透（体彩） ---------------- */

async function fetchDlt(existingCodes) {
  const headers = {
    "User-Agent": UA,
    Accept: "application/json, text/plain, */*",
    Referer: "https://static.sporttery.cn/",
  };
  const draws = [];
  const seen = new Set();
  const pageSize = 100;
  let pageNo = 1;
  let pages = Infinity;
  let overlap = false;

  while (pageNo <= Math.min(pages, 400) && !overlap) {
    const url = `https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=85&provinceId=0&pageSize=${pageSize}&isVerify=1&pageNo=${pageNo}`;
    const json = await getJson(url, headers);
    if (json?.success !== true || json?.errorCode !== "0") {
      throw new Error(`体彩接口返回错误：${json?.errorCode ?? "?"} ${json?.errorMessage ?? ""}`.trim());
    }
    const v = json?.value;
    if (!v || !Array.isArray(v.list)) throw new Error("体彩接口返回结构异常：" + JSON.stringify(json).slice(0, 200));
    if (v.list.length === 0 && pageNo === 1) {
      throw new Error("体彩接口第 1 页返回空列表（可能被限流），请稍后重试");
    }
    pages = Number(v.pages) || 1;

    for (const it of v.list) {
      const code = String(it.lotteryDrawNum ?? "").trim();
      const date = String(it.lotteryDrawTime ?? "").slice(0, 10);
      // 体彩接口号码为空格分隔（旧版本为逗号），两种都兼容
      const parts = String(it.lotteryDrawResult ?? "")
        .split(/[,，\s]+/)
        .filter(Boolean)
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isInteger(n));
      if (!code || !/^\d{4}-\d{2}-\d{2}/.test(date) || parts.length !== 7) continue;
      if (seen.has(code)) continue;
      seen.add(code);
      if (existingCodes.has(code) && !FULL) {
        overlap = true; // 与本地数据重叠，本页抓完即可停止
        continue;
      }
      draws.push({ code, date, red: parts.slice(0, 5), blue: parts.slice(5, 7) });
    }
    process.stdout.write(`    大乐透 第 ${pageNo}/${pages} 页（累计 ${draws.length} 期新数据）\r`);
    pageNo++;
    await sleep(300);
  }
  console.log("");
  return draws;
}

/* ---------------- 双色球（福彩） ---------------- */

async function fetchSsq(existingCodes) {
  const headers = {
    "User-Agent": UA,
    Accept: "application/json, text/javascript, */*; q=0.01",
    Referer: "https://www.cwl.gov.cn/ygkj/wqkjgg/ssq/",
  };
  const draws = [];
  const seen = new Set();
  const pageSize = 100;
  let pageNo = 1;
  let overlap = false;

  while (pageNo <= 400 && !overlap) {
    const url = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=ssq&systemType=PC&pageSize=${pageSize}&pageNo=${pageNo}`;
    let json;
    try {
      json = await getJson(url, headers);
    } catch (e) {
      // 分页参数不被支持时，退回 issueCount 模式抓最近 500 期
      console.log(`    分页接口不可用（${e.message}），改用 issueCount 模式`);
      json = await getJson(
        `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=ssq&issueCount=500`,
        headers
      );
      pageNo = 1e9; // 一次性数据，直接走完
    }
    const list = json?.result;
    if (!Array.isArray(list)) throw new Error("福彩接口返回结构异常：" + JSON.stringify(json).slice(0, 200));
    if (list.length === 0) break;

    for (const it of list) {
      const code = String(it.code ?? "").trim();
      const date = String(it.date ?? "").trim().slice(0, 10);
      if (!code || !/^\d{4}-\d{2}-\d{2}/.test(date)) continue;
      if (seen.has(code)) continue;
      seen.add(code);
      if (existingCodes.has(code) && !FULL) {
        overlap = true;
        continue;
      }
      const red = String(it.red ?? "")
        .split(",")
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isInteger(n));
      const blue = String(it.blue ?? "")
        .split(",")
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isInteger(n));
      if (red.length !== 6 || blue.length !== 1) continue;
      draws.push({ code, date, red, blue });
    }
    if (pageNo >= 1e9) break;
    process.stdout.write(`    双色球 第 ${pageNo} 页（累计 ${draws.length} 期新数据）\r`);
    pageNo++;
    await sleep(500);
  }
  console.log("");
  return draws;
}

/* ---------------- 主流程 ---------------- */

function loadLocal(gameKey, game) {
  const file = join(DATA_DIR, game.file);
  if (!existsSync(file)) return { draws: [], codes: new Set() };
  try {
    const json = JSON.parse(readFileSync(file, "utf8"));
    const draws = Array.isArray(json.draws) ? json.draws : [];
    return { draws, codes: new Set(draws.map((d) => d.code)) };
  } catch (e) {
    console.log(`  本地 ${game.file} 解析失败，将重新全量抓取（${e.message}）`);
    return { draws: [], codes: new Set() };
  }
}

async function runGame(key) {
  const game = GAMES[key];
  console.log(`\n== ${game.name}（${key}） ==`);
  const local = loadLocal(key, game);
  if (local.draws.length && !FULL) {
    console.log(`  本地已有 ${local.draws.length} 期，增量抓取中…（--full 可全量重抓）`);
  } else {
    console.log("  全量抓取中…");
  }

  const fresh = await game.fetchAll(local.codes);
  for (const d of fresh) game.validate(d);

  const byCode = new Map(local.draws.map((d) => [d.code, d]));
  let added = 0;
  for (const d of fresh) {
    if (!byCode.has(d.code)) added++;
    byCode.set(d.code, d); // 新数据覆盖同期号旧数据
  }
  const merged = [...byCode.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code)
  );

  // 无新增时保留原文件：避免每次抓取都因重写 updatedAt 产生空提交、空部署
  // （官方对已开期号的更正极罕见，需要时可 --full 全量重抓）
  if (added === 0 && !FULL) {
    const prev = local.draws.at(-1);
    console.log(`  无新增，保留原文件（最新 ${prev?.code} ${prev?.date}）`);
    return true;
  }

  mkdirSync(DATA_DIR, { recursive: true });
  const out = {
    game: key,
    name: game.name,
    updatedAt: new Date().toISOString(),
    draws: merged,
  };
  writeFileSync(join(DATA_DIR, game.file), JSON.stringify(out));

  const latest = merged.at(-1);
  console.log(
    `  完成：共 ${merged.length} 期（新增 ${added}），范围 ${merged[0]?.code}（${merged[0]?.date}）→ ${latest?.code}（${latest?.date}）`
  );
  console.log(
    `  最新开奖：${latest.date} [${latest.code}] 红区 ${latest.red.join(" ")} / 蓝区 ${latest.blue.join(" ")}`
  );
  return true;
}

(async () => {
  const keys = Object.keys(GAMES).filter((k) => !ONLY || k === ONLY);
  const results = [];
  for (const k of keys) {
    try {
      results.push(await runGame(k));
    } catch (e) {
      console.error(`\n  ✗ ${GAMES[k].name} 抓取失败：${e.message}`);
      results.push(false);
    }
  }
  if (results.some((ok) => !ok)) {
    console.error("\n部分彩种抓取失败，请检查上方日志。");
    process.exit(1);
  }
  console.log("\n全部抓取完成 ✔");
})();
