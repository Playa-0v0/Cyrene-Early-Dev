// Skill meta-tool —— 把 skill 系统暴露给 LLM 的两个工具。
// 不把每个 skill 注册成业务 tool（skill 是指令层），而是用两个 meta-tool：
//   invoke_skill：加载某 skill 的 SKILL.md 正文 + references 清单
//   read_skill_reference：按需读 references 附件（带路径穿越防护）
// 注册进现有 toolRegistry，两处 LLM 路径都从 registry 取，自动生效。

import { toolRegistry } from "../orchestrator/tool-registry";
import { skillRegistry } from "./skill-registry";

const LOG_PREFIX = "[SkillTools]";

/**
 * 注册 skill 系统的两个 meta-tool 进 toolRegistry。
 * 标 risk:"safe"（只读本地 skill 文件），免权限打扰。
 * initSkills 启动时调一次。
 */
export function registerSkillTools(): void {
  toolRegistry.register({
    id: "invoke_skill",
    name: "调用 Skill",
    description:
      "加载某个 skill 的详细执行指令。当你判断当前任务适用某 skill 时（见系统提示里的「可用 Skill」清单），调用此工具获取该 skill 的完整指令，再按指令用其他工具执行。\n\n" +
      "何时用：系统提示的「可用 Skill」清单里某条 description 适用于当前任务。\n\n" +
      "不要用于：清单里没有的 skill id。\n\n" +
      "参数：skill_id（必填，skill 的 id，见清单里的标识）。\n\n" +
      "返回：该 skill 的指令正文 + 可用的 references 文件清单。若正文引用了 references/xxx，需要详情时再用 read_skill_reference 读取。",
    enabled: true,
    risk: "safe",
    inputSchema: {
      type: "object",
      properties: {
        skill_id: { type: "string", description: "skill 的 id（见「可用 Skill」清单）" },
      },
      required: ["skill_id"],
    },
    execute: async (args) => {
      const id = String(args.skill_id || "");
      const skill = skillRegistry.getById(id);
      if (!skill || !skill.enabled) {
        const available = skillRegistry.getEnabled().map(s => s.id).join(", ") || "(无)";
        return `[invoke_skill] skill not found: ${id}。可用 skill: ${available}`;
      }
      const body = skillRegistry.getBody(id);
      if (body === null) {
        return `[invoke_skill] 读取 skill 正文失败: ${id}`;
      }
      const refList = skill.references.length > 0
        ? `\n\n可用 references（需要详情时调 read_skill_reference 读取）：\n${skill.references.map(r => "- " + r).join("\n")}`
        : "";
      console.log(LOG_PREFIX, "invoke_skill:", id);
      return `[已加载 skill: ${id}]\n${body}${refList}`;
    },
  });

  toolRegistry.register({
    id: "read_skill_reference",
    name: "读取 Skill 附件",
    description:
      "读取某 skill 的 references 附件内容。当 invoke_skill 返回的正文引用了 references/xxx 且你需要详情时调用。\n\n" +
      "何时用：invoke_skill 返回的正文提到 references/xxx 且需要该附件的详细内容。\n\n" +
      "不要用于：不在 invoke_skill 返回清单里的 ref。\n\n" +
      "参数：skill_id（必填），ref（必填，references 文件名，必须是 invoke_skill 返回清单里的）。",
    enabled: true,
    risk: "safe",
    inputSchema: {
      type: "object",
      properties: {
        skill_id: { type: "string", description: "skill 的 id" },
        ref:      { type: "string", description: "references 文件名（必须命中 invoke_skill 返回的清单）" },
      },
      required: ["skill_id", "ref"],
    },
    execute: async (args) => {
      const id = String(args.skill_id || "");
      const ref = String(args.ref || "");
      const skill = skillRegistry.getById(id);
      if (!skill || !skill.enabled) {
        return `[read_skill_reference] skill not found: ${id}`;
      }
      const content = skillRegistry.getReference(id, ref);
      if (content === null) {
        return `[read_skill_reference] 读取失败（ref 不在清单或文件不存在）: ${ref}。可用: ${skill.references.join(", ") || "(无)"}`;
      }
      console.log(LOG_PREFIX, "read_skill_reference:", id, ref);
      return content;
    },
  });

  console.log(LOG_PREFIX, "已注册：invoke_skill / read_skill_reference");
}
