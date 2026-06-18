// 验证视觉实现的关键路径（不调真实模型，验证纯逻辑）
// 运行：node tmp/test-vision-impl.mjs

import { extractLastUserQuery } from "../dist/main/main/orchestrator/tool-context.js";

let pass = 0;
let fail = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (ok) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + " — 期望 " + JSON.stringify(expected) + "，实际 " + JSON.stringify(actual)); }
}

console.log("=== 1. extractLastUserQuery 正常取最后一条 user ===");
const msgs1 = [
  { role: "system", content: "sys" },
  { role: "user", content: "看看 D:/cat.png" },
  { role: "assistant", content: "好的" },
  { role: "user", content: "里面有几只猫" },
];
check("取到最后一条 user", extractLastUserQuery(msgs1), "里面有几只猫");

console.log("=== 2. extractLastUserQuery 空列表 ===");
check("空列表返回空串", extractLastUserQuery([]), "");

console.log("=== 3. extractLastUserQuery 只有 assistant ===");
const msgs2 = [{ role: "assistant", content: "你好" }];
check("无 user 返回空串", extractLastUserQuery(msgs2), "");

console.log("=== 4. extractLastUserQuery 只有 system + user ===");
const msgs3 = [
  { role: "system", content: "sys" },
  { role: "user", content: "看看图" },
];
check("取到唯一 user", extractLastUserQuery(msgs3), "看看图");

console.log("=== 5. extractLastUserQuery user 在中间（assistant 在后）===");
const msgs4 = [
  { role: "user", content: "第一个问题" },
  { role: "assistant", content: "回答" },
  { role: "user", content: "第二个问题" },
  { role: "assistant", content: "回答2" },
];
check("取到最后一条 user（跳过末尾 assistant）", extractLastUserQuery(msgs4), "第二个问题");

console.log("=== 6. extractLastUserQuery user content 为 undefined ===");
const msgs5 = [
  { role: "user" },  // content undefined
  { role: "user", content: "有内容" },
];
check("跳过 undefined content 取到有内容的", extractLastUserQuery(msgs5), "有内容");

console.log("");
console.log("=== 汇总: " + pass + " 通过 / " + fail + " 失败 ===");
process.exit(fail === 0 ? 0 : 1);
