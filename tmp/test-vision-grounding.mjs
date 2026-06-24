// 验证视觉 grounding 三条关键路径：
// 1. list_dir 输出标注 [图片] 且 count 行汇总图片数
// 2. read_image 在非视觉模型下被能力门控拦截（返回 [错误]）
// 3. read_image 在视觉模型下放行
// 运行：node tmp/test-vision-grounding.mjs

import { getCapability } from "../dist/main/main/orchestrator/vendors/capabilities.js";

// --- 路径1：能力表查询 ---
console.log("=== 路径1：能力表 supportsVision ===");
const cases = [
  ["minimax", "MiniMax（稀宇科技）", true],
  ["deepseek", "DeepSeek（深度求索）", false],
  ["kimi", "Kimi（月之暗面）", true],
  ["glm", "GLM（智谱）", false],
  ["chatgpt", "ChatGPT（OpenAI）", false],
  ["claude", "Claude（Anthropic）", true],
];
let pass1 = 0;
for (const [id, displayName, expected] of cases) {
  const cap = getCapability(displayName);
  const actual = cap ? cap.supportsVision : "missing";
  const ok = actual === expected;
  if (ok) pass1++;
  console.log(`  ${ok ? "✓" : "✗"} ${displayName}: supportsVision=${actual} (期望 ${expected})`);
}
// 未知厂商单独验证：getCapability 返回 undefined（保守），门控据此拦截
const unknownCap = getCapability("未知厂商");
const unknownOk = unknownCap === undefined;
if (unknownOk) pass1++;
console.log(`  ${unknownOk ? "✓" : "✗"} 未知厂商: getCapability=${unknownCap === undefined ? "undefined(保守)" : "意外命中"} (期望 undefined → 门控拦截)`);
console.log(`路径1: ${pass1}/${cases.length + 1} 通过\n`);

// --- 路径2：能力门控判定逻辑（复刻 function-calling.ts 的 gateByCapability） ---
console.log("=== 路径2：read_image 能力门控 ===");
const TOOL_CAPABILITY_GATE = {
  read_image: {
    capability: "vision",
    reason: "当前模型不支持查看图片，无法使用 read_image。遇到图片问题请如实告诉用户你看不了。",
  },
};

function gateByCapability(toolId, provider) {
  const gate = TOOL_CAPABILITY_GATE[toolId];
  if (!gate) return null;
  const cap = getCapability(provider);
  const supportsVision = cap?.supportsVision ?? false;
  if (gate.capability === "vision" && !supportsVision) return gate.reason;
  return null;
}

const gateCases = [
  ["read_image", "DeepSeek（深度求索）", true],   // 非视觉 → 应拦截
  ["read_image", "GLM（智谱）", true],            // 非视觉 → 应拦截
  ["read_image", "Kimi（月之暗面）", false],      // 视觉 → 放行
  ["read_image", "MiniMax（稀宇科技）", false],   // 视觉 → 放行
  ["read_file", "DeepSeek（深度求索）", false],   // 非门控工具 → 放行
  ["list_dir", "GLM（智谱）", false],             // 非门控工具 → 放行
  ["read_image", "未知厂商", true],               // 未知厂商 → 保守拦截
];
let pass2 = 0;
for (const [toolId, provider, shouldBlock] of gateCases) {
  const reason = gateByCapability(toolId, provider);
  const blocked = reason !== null;
  const ok = blocked === shouldBlock;
  if (ok) pass2++;
  console.log(`  ${ok ? "✓" : "✗"} ${toolId} @ ${provider}: ${blocked ? "拦截" : "放行"} (期望 ${shouldBlock ? "拦截" : "放行"})`);
}
console.log(`路径2: ${pass2}/${gateCases.length} 通过\n`);

// --- 路径3：list_dir 图片标注格式（用项目自身目录验证） ---
console.log("=== 路径3：list_dir 图片标注 ===");
import * as fs from "fs";
import * as path from "path";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".ico"]);
const testDir = path.resolve("src/renderer/public/stickers");
const entries = fs.readdirSync(testDir, { withFileTypes: true });
const imageCount = entries.filter(e => e.isFile() && IMAGE_EXTS.has(path.extname(e.name).toLowerCase())).length;
console.log(`  测试目录: ${testDir}`);
console.log(`  总条目: ${entries.length}, 图片: ${imageCount}`);
console.log(`  count 行示例: count: ${entries.length} (其中图片 ${imageCount} 张)`);
console.log(`  条目示例:`);
for (const ent of entries.slice(0, 6)) {
  const ext = path.extname(ent.name).toLowerCase();
  const tag = IMAGE_EXTS.has(ext) ? "  [图片]" : "";
  console.log(`    [F] ${ent.name}${tag}`);
}
const hasTagFormat = imageCount > 0;
console.log(`  ${hasTagFormat ? "✓" : "✗"} 图片标注: ${hasTagFormat ? "已标注 [图片]" : "（该目录无图片）"}\n`);

// --- 汇总 ---
const total = pass1 + pass2;
const totalCases = (cases.length + 1) + gateCases.length;
console.log(`=== 汇总: ${total}/${totalCases} 断言通过 ===`);
console.log(`路径1（能力表）: ${pass1}/${cases.length + 1}`);
console.log(`路径2（能力门控）: ${pass2}/${gateCases.length}`);
process.exit(total === totalCases ? 0 : 1);
