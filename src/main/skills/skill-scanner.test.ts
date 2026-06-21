import { describe, it, expect } from "vitest";
import { parseSkillFrontmatter } from "./skill-scanner";

describe("parseSkillFrontmatter", () => {
  it("解析合规 SKILL.md", () => {
    const md = `---
name: write-expense-report
description: 生成支出报告
tools: [query_expense, write_excel]
version: 1.0.0
---

# 写支出报告

调用 query_expense 取数据。`;
    const r = parseSkillFrontmatter(md);
    expect(r).not.toBeNull();
    expect(r!.name).toBe("write-expense-report");
    expect(r!.description).toBe("生成支出报告");
    expect(r!.tools).toEqual(["query_expense", "write_excel"]);
    expect(r!.version).toBe("1.0.0");
    expect(r!.body).toContain("# 写支出报告");
    expect(r!.body).not.toContain("description:");
  });

  it("无 tools/version 也能解析", () => {
    const md = `---
name: plain
description: 纯指令
---
正文`;
    const r = parseSkillFrontmatter(md);
    expect(r).not.toBeNull();
    expect(r!.name).toBe("plain");
    expect(r!.description).toBe("纯指令");
    expect(r!.tools).toBeUndefined();
    expect(r!.version).toBeUndefined();
    expect(r!.body).toBe("正文");
  });

  it("缺 name 返回 null", () => {
    const md = `---
description: 没 name
---
正文`;
    expect(parseSkillFrontmatter(md)).toBeNull();
  });

  it("缺 description 返回 null", () => {
    const md = `---
name: x
---
正文`;
    expect(parseSkillFrontmatter(md)).toBeNull();
  });

  it("无 frontmatter 返回 null", () => {
    expect(parseSkillFrontmatter("纯正文无 frontmatter")).toBeNull();
  });
});
