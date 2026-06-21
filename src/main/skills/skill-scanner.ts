// Skill 扫描器 —— frontmatter 解析 + 目录扫描。
// 纯函数模块：parseSkillFrontmatter 不依赖 electron，便于单测。
// electron 相关（app.getPath）由调用方 initSkills 注入路径。

import matter from "gray-matter";
import type { ParsedSkill } from "./types";

/** gray-matter 解析结果的最小结构（不依赖其类型导出，规避 export = 的类型访问问题）。 */
interface MatterResult {
  data: Record<string, unknown>;
  content: string;
}

/**
 * 解析 SKILL.md 文本：frontmatter（name/description/tools?/version?）+ 正文。
 * 纯函数，不碰 fs/electron。
 * 返回 null 表示不合规（缺 name/description、tools 非 array、或无 frontmatter）。
 */
export function parseSkillFrontmatter(content: string): ParsedSkill | null {
  let parsed: MatterResult;
  try {
    parsed = matter(content) as unknown as MatterResult;
  } catch {
    return null;
  }
  const d = parsed.data ?? {};
  if (typeof d.name !== "string" || !d.name) return null;
  if (typeof d.description !== "string" || !d.description) return null;
  if (d.tools !== undefined && !Array.isArray(d.tools)) return null;
  return {
    name: d.name,
    description: d.description,
    tools: Array.isArray(d.tools) ? d.tools.map(String) : undefined,
    version: d.version !== undefined ? String(d.version) : undefined,
    body: parsed.content.trim(),
  };
}
