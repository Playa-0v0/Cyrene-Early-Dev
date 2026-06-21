// settings-store —— game-bot 配置存取。userData/game-bot-settings.json。
// 照 index.ts 的 GeneralSettings 模式：load / save / normalize 三件套。
// 唯一碰 electron（app.getPath）。

import * as fs from "fs";
import * as path from "path";
import { app } from "electron";

export interface GameBotSettings {
  enabled: boolean;
  exePath: string;
  activeRecipe: string;   // 脚本文件名（去 .yaml）
  vlm: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
}

const DEFAULTS: GameBotSettings = {
  enabled: false,
  exePath: "",
  activeRecipe: "star-rail-daily",
  vlm: { baseUrl: "", apiKey: "", model: "" },
};

function filePath(): string {
  return path.join(app.getPath("userData"), "game-bot-settings.json");
}

function normalize(input: Partial<GameBotSettings> | null | undefined): GameBotSettings {
  const v = input?.vlm ?? {};
  return {
    enabled: Boolean(input?.enabled),
    exePath: typeof input?.exePath === "string" ? input.exePath : "",
    activeRecipe: typeof input?.activeRecipe === "string" && input.activeRecipe
      ? input.activeRecipe : DEFAULTS.activeRecipe,
    vlm: {
      baseUrl: typeof v.baseUrl === "string" ? v.baseUrl.trim() : "",
      apiKey: typeof v.apiKey === "string" ? v.apiKey.trim() : "",
      model: typeof v.model === "string" ? v.model.trim() : "",
    },
  };
}

export function loadGameBotSettings(): GameBotSettings {
  try {
    const p = filePath();
    if (!fs.existsSync(p)) return { ...DEFAULTS };
    return normalize(JSON.parse(fs.readFileSync(p, "utf8")) as Partial<GameBotSettings>);
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveGameBotSettings(patch: Partial<GameBotSettings>): GameBotSettings {
  const existing = loadGameBotSettings();
  const merged: Partial<GameBotSettings> = { ...existing, ...patch };
  if (patch.vlm) merged.vlm = { ...existing.vlm, ...patch.vlm };
  const final = normalize(merged);
  fs.mkdirSync(path.dirname(filePath()), { recursive: true });
  fs.writeFileSync(filePath(), JSON.stringify(final, null, 2), "utf8");
  return final;
}
