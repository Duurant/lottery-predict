export type GameKey = "dlt" | "ssq";

/** 单期开奖记录（两个彩种统一为「红区 + 蓝区」结构） */
export interface Draw {
  /** 期号，如 2026103（双色球）/ 26101（大乐透，官方原始格式） */
  code: string;
  /** 开奖日期 yyyy-MM-dd */
  date: string;
  /** 红区号码（大乐透前区 5 个 / 双色球红球 6 个），升序 */
  red: number[];
  /** 蓝区号码（大乐透后区 2 个 / 双色球蓝球 1 个），升序 */
  blue: number[];
}

export interface GameData {
  game: GameKey;
  name: string;
  updatedAt: string;
  draws: Draw[];
}

export interface GameConfig {
  key: GameKey;
  name: string;
  redName: string;
  blueName: string;
  redCount: number;
  redMax: number;
  blueCount: number;
  blueMax: number;
  /** 开奖星期（0=周日 … 6=周六） */
  drawDays: number[];
  /** 开奖时刻 HH:mm */
  drawTime: string;
  /** 页面主题色（tailwind class 前缀色值） */
  accent: string;
  /**
   * 「统计范围 = 全部历史」时的已知数据特征提示。
   * 只在经实测确认、且能与官方源逐条核对的情况下填写，避免把历史分期的分布差异
   * 误读成当前规律（例：大乐透 2007–2013 年前区高位号显著偏多）。
   */
  historyNote?: string;
}

export const GAMES: Record<GameKey, GameConfig> = {
  dlt: {
    key: "dlt",
    name: "超级大乐透",
    redName: "前区",
    blueName: "后区",
    redCount: 5,
    redMax: 35,
    blueCount: 2,
    blueMax: 12,
    drawDays: [1, 3, 6], // 周一、三、六
    drawTime: "21:25",
    accent: "#f59e0b",
    historyNote:
      "全部历史包含 2007–2013 年：该段前区 29–35 号的出现次数比理论期望高约 30%~55%（2014 年起恢复正常）。已与体彩官网接口逐条核对，官方历史记录本身如此、并非本站抓取问题；但「全部历史」的频率与冷热统计会受这一段影响，看当前规律建议用近 100 期。",
  },
  ssq: {
    key: "ssq",
    name: "双色球",
    redName: "红球",
    blueName: "蓝球",
    redCount: 6,
    redMax: 33,
    blueCount: 1,
    blueMax: 16,
    drawDays: [2, 4, 0], // 周二、四、日
    drawTime: "21:15",
    accent: "#ef4444",
  },
};

export const GAME_KEYS: GameKey[] = ["dlt", "ssq"];

/** 组合的稳定键（用于去重/查历史） */
export function comboKey(red: number[], blue: number[]): string {
  return red.join(",") + "|" + blue.join(",");
}

/** 号码显示补零（两位） */
export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
