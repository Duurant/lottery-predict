/**
 * 排列五数据读取（服务端 / 构建期专用）
 *
 * 与 digit.ts 分开的原因：digit.ts 被客户端组件 import，一旦其中出现 node:fs，
 * 打包器会把 node 内置模块打进客户端 chunk 并直接报错
 * （Turbopack: "the chunking context does not support external modules (request: node:fs)"）。
 * 这与组合型把 games.ts（纯配置）与 data.ts（读文件）分开是同一个原因。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { P5_CONFIG, type DigitDraw, type DigitGameKey } from "./digit";

const DATA_DIR = join(process.cwd(), "data");

export interface DigitGameData {
  game: string;
  name: string;
  updatedAt: string;
  draws: DigitDraw[];
}

/**
 * 读取本地排列五数据（构建时执行，页面静态化后不再访问文件系统）。
 * 文件缺失时返回空数据集（数据由 scripts/fetch-data.mjs 生成）。
 */
export function loadDigitGame(key: DigitGameKey = "p5"): DigitGameData {
  const file = join(DATA_DIR, `${key}.json`);
  if (!existsSync(file)) return { game: key, name: P5_CONFIG.name, updatedAt: "", draws: [] };
  return JSON.parse(readFileSync(file, "utf8")) as DigitGameData;
}
