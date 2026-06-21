// refs-store —— 参考图存储。userData/game-bot/refs/<recipe>/<ref>.png。
// 唯一碰 electron 的模块（app.getPath）；读写纯 fs。
// 红框标记编辑器裁出的小图存这里，运行时 vlm_click 按 ref 名读取。

import * as fs from "fs";
import * as path from "path";
import { app } from "electron";

/** 某 recipe 的参考图目录绝对路径。 */
export function refsDirPath(recipeId: string): string {
  return path.join(app.getPath("userData"), "game-bot", "refs", recipeId);
}

/** 列出某 recipe 下所有参考图名（不含 .png 后缀）。 */
export function listRefs(recipeId: string): string[] {
  const dir = refsDirPath(recipeId);
  try {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => f.toLowerCase().endsWith(".png"))
      .map(f => f.slice(0, -4));
  } catch {
    return [];
  }
}

/** 读取参考图。返回 {base64, mime}；不存在返回 null。 */
export function readRef(recipeId: string, refName: string): { base64: string; mime: string } | null {
  const file = path.join(refsDirPath(recipeId), refName + ".png");
  try {
    if (!fs.existsSync(file)) return null;
    const buf = fs.readFileSync(file);
    return { base64: buf.toString("base64"), mime: "image/png" };
  } catch {
    return null;
  }
}

// 说明：参考图由用户自行把裁好的小图（按 ref 命名 .png）放进 refsDirPath(recipeId) 目录。
// 不提供前端写入入口——后端只读。
