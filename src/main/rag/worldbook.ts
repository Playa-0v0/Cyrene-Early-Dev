import * as fs from "fs";
import * as path from "path";

// ── Worldbook entry ──
export interface WorldbookEntry {
  id: string;
  keywords: string[];
  content: string;
  priority: number;
  permanent: boolean;   // 常驻：始终注入 Prompt
  enabled: boolean;
}

// ── Worldbook Manager ──
export class WorldbookManager {
  private entries: WorldbookEntry[] = [];
  private worldbookDir: string;

  constructor(worldbookDir: string) {
    this.worldbookDir = worldbookDir;
  }

  // Load all .md files from the worldbook directory
  async loadFromDirectory(): Promise<void> {
    if (!fs.existsSync(this.worldbookDir)) {
      console.warn("[Worldbook] directory not found:", this.worldbookDir);
      return;
    }

    const files = fs.readdirSync(this.worldbookDir).filter((f) => f.endsWith(".md"));
    if (files.length === 0) {
      console.warn("[Worldbook] no .md files found in:", this.worldbookDir);
      return;
    }

    const allEntries: WorldbookEntry[] = [];

    for (const file of files) {
      const filePath = path.join(this.worldbookDir, file);
      const content = fs.readFileSync(filePath, "utf8");
      const entries = this.parseMarkdown(content, file);
      allEntries.push(...entries);
    }

    this.entries = allEntries;
    console.log(`[Worldbook] loaded ${allEntries.length} entries from ${files.length} files`);
  }

  // Parse markdown format:
  // ## 条目名
  // - 触发词: 词1, 词2, 词3
  // - 常驻: 是
  // - 优先级: 200
  //
  // 内容段落...
  // ---
  private parseMarkdown(content: string, fileName: string): WorldbookEntry[] {
    const entries: WorldbookEntry[] = [];

    // Split by ## headings
    const lines = content.split("\n");
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();

      // Find next ## heading
      if (!line.startsWith("## ")) {
        i++;
        continue;
      }

      const title = line.replace(/^## /, "").trim();
      i++;

      // Parse metadata lines (lines starting with -)
      let keywords: string[] = [];
      let priority = 5;
      let permanent = false;
      let contentStart = i;

      while (i < lines.length) {
        const metaLine = lines[i].trim();

        if (metaLine.startsWith("- 触发词:") || metaLine.startsWith("- 触发词：")) {
          const val = metaLine.replace(/^-\s*触发词[：:]/, "").trim();
          keywords = val.split(/[,，、]/).map((k) => k.trim()).filter(Boolean);
          i++;
        } else if (metaLine.startsWith("- 常驻:")) {
          const val = metaLine.replace(/^-\s*常驻:/, "").trim();
          permanent = val === "是" || val === "yes" || val === "true";
          i++;
        } else if (metaLine.startsWith("- 优先级:")) {
          const val = metaLine.replace(/^-\s*优先级:/, "").trim();
          priority = parseInt(val) || 5;
          i++;
        } else if (metaLine.startsWith("---")) {
          // Separator line — stop metadata parsing
          i++;
          break;
        } else if (metaLine === "" || metaLine.startsWith("# ")) {
          // Empty line or top-level heading — stop
          break;
        } else if (metaLine.startsWith("- ")) {
          // Unknown metadata field — skip
          i++;
        } else {
          // Content line — stop metadata parsing
          break;
        }
      }

      // Collect content until next ## or ---
      const contentLines: string[] = [];
      while (i < lines.length) {
        const cl = lines[i];
        if (cl.trim().startsWith("## ") || cl.trim() === "---") {
          break;
        }
        contentLines.push(cl);
        i++;
      }

      const entryContent = contentLines.join("\n").trim();
      if (entryContent) {
        entries.push({
          id: `wb_${fileName.replace(/\.md$/, "")}_${title.replace(/\s+/g, "_")}`,
          keywords,
          content: entryContent,
          priority,
          permanent,
          enabled: true,
        });
      }
    }

    return entries;
  }

  // Keyword-based retrieval (pure BM25, no vector)
  async retrieveByKeywords(userInput: string): Promise<string[]> {
    const matched = this.entries.filter((entry) => {
      if (!entry.enabled) return false;
      if (entry.keywords.length === 0) return false;
      return entry.keywords.some((kw) => userInput.includes(kw));
    });

    if (matched.length === 0) return [];

    // Sort by priority (higher first), then take top 3
    matched.sort((a, b) => b.priority - a.priority);
    return matched.slice(0, 3).map((e) => e.content);
  }

  // Get permanent entries (常驻) — always included
  getPermanentEntries(): string[] {
    return this.entries
      .filter((e) => e.enabled && e.permanent)
      .sort((a, b) => b.priority - a.priority)
      .map((e) => e.content);
  }


  // Get all registered trigger words (for AI output scanning)
  getAllTriggerWords(): string[] {
    const words = new Set<string>();
    for (const entry of this.entries) {
      for (const kw of entry.keywords) {
        words.add(kw);
      }
    }
    return [...words];
  }

  get entriesCount(): number {
    return this.entries.length;
  }
}
