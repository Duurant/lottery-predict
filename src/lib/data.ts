import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GameData, GameKey } from "./games";

const DATA_DIR = join(process.cwd(), "data");

const cache = new Map<GameKey, GameData>();

/**
 * 读取本地开奖数据 JSON（构建时执行，页面静态化后不再访问文件系统）。
 * 文件缺失时返回空数据集（数据由 scripts/fetch-data.mjs 生成）。
 */
export function loadGame(key: GameKey): GameData {
  const hit = cache.get(key);
  if (hit) return hit;

  const file = join(DATA_DIR, `${key}.json`);
  if (!existsSync(file)) {
    const empty: GameData = { game: key, name: key, updatedAt: "", draws: [] };
    cache.set(key, empty);
    return empty;
  }
  const parsed = JSON.parse(readFileSync(file, "utf8")) as GameData;
  cache.set(key, parsed);
  return parsed;
}
