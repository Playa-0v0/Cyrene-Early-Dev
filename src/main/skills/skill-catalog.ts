// Skill 清单生成 —— 把 enabled skill 拼成注入 system prompt 的清单段。
// 纯函数，不碰 electron/registry。

import type { SkillEntry } from "./types";

/**
 * 生成注入 system prompt 的 skill 清单段（拼在人格层之后）。
 * 只含 enabled skill。返回空串表示无可用 skill（调用方据此跳过拼接）。
 */
export function buildSkillCatalog(skills: SkillEntry[]): string {
  const enabled = skills.filter(s => s.enabled);
  if (enabled.length === 0) return "";
  const lines = enabled.map(s => {
    const toolsTag = s.tools && s.tools.length > 0 ? ` [tools: ${s.tools.join(", ")}]` : "";
    return `- ${s.id}: ${s.description}${toolsTag}`;
  });
  return [
    "## 可用 Skill",
    "当某 skill 适用于当前任务时，先调用 invoke_skill(skill_id) 取详细指令，再按指令用工具执行。",
    "",
    ...lines,
  ].join("\n");
}
