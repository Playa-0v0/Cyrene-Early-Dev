// 文档生成工具 —— 让昔涟能产出可交付物（Excel/Word/PDF/Markdown）。
//
// 设计要点：
// - 所有文档默认存到桌面（app.getPath("desktop")），用户最容易找到
// - 文件名由模型给，强制校验扩展名（防 .exe 等危险后缀）
// - 返回完整路径给模型，模型可以转述给用户
// - PDF 中文字体走系统微软雅黑（Windows），找不到就降级

import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { toolRegistry } from "./tool-registry";

const LOG_PREFIX = "[DocTools]";

/** 校验文件名：必须有合法扩展名，不能有路径分隔符（防目录穿越）。 */
function validateFilename(filename: string, ext: string): string | null {
  if (!filename || typeof filename !== "string") return null;
  // 防目录穿越
  const base = path.basename(filename);
  if (base !== filename) return null;
  if (!base.toLowerCase().endsWith(ext)) return null;
  // 防危险字符
  if (/[<>:"|?*]/.test(base)) return null;
  return base;
}

/** 桌面路径。 */
function desktopPath(filename: string): string {
  return path.join(app.getPath("desktop"), filename);
}

export function registerDocumentTools(): void {
  // ── write_excel ──────────────────────────────────────
  toolRegistry.register({
    id: "write_excel",
    name: "写 Excel",
    description:
      "生成一个 Excel 文件（.xlsx）保存到桌面。\n\n" +
      "何时用：\n" +
      "- 用户要把数据整理成表格\n" +
      "- 用户要「做一张表」「导出 Excel」「整理成 Excel」\n" +
      "- 需要结构化数据展示（多行多列）\n\n" +
      "不要用于：\n" +
      "- 纯文字总结（用 write_markdown 或直接回复）\n" +
      "- 正式文档（用 write_word / write_pdf）\n\n" +
      "参数：filename（文件名，.xlsx 结尾），sheets（工作表数组，每项含 name/headers/rows）。",
    enabled: true,
    risk: "fs-write",
    inputSchema: {
      type: "object",
      properties: {
        filename: { type: "string", description: "文件名（不含路径，.xlsx 结尾）" },
        sheets: {
          type: "array",
          description: "工作表数组",
          items: {
            type: "object",
            properties: {
              name:    { type: "string", description: "工作表名" },
              headers: { type: "array", description: "表头字符串数组", items: { type: "string" } },
              rows:    { type: "array", description: "数据行，每行是一个数组", items: { type: "string" } },
            },
          },
        },
      },
      required: ["filename", "sheets"],
    },
    execute: async (args) => {
      const filename = validateFilename(String(args.filename || ""), ".xlsx");
      if (!filename) return "[错误] filename 必须是 .xlsx 结尾的纯文件名";
      const sheets = args.sheets as Array<{
        name: string; headers: string[]; rows: unknown[][];
      }>;
      if (!Array.isArray(sheets) || sheets.length === 0) {
        return "[错误] sheets 不能为空";
      }

      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      for (const s of sheets) {
        const ws = workbook.addWorksheet(s.name || "Sheet1");
        if (Array.isArray(s.headers)) ws.addRow(s.headers);
        for (const row of (s.rows || [])) ws.addRow(row);
        ws.getRow(1).font = { bold: true };
        // 粗略自动列宽
        ws.columns.forEach(col => {
          const maxLen = Math.max(
            12,
            ...(s.headers || []).map(h => String(h).length + 2),
          );
          col.width = maxLen;
        });
      }

      const outputPath = desktopPath(filename);
      await workbook.xlsx.writeFile(outputPath);
      console.log(LOG_PREFIX, "Excel 已生成:", outputPath);
      return `[write_excel] 已生成：${outputPath}`;
    },
  });

  // ── write_word ───────────────────────────────────────
  toolRegistry.register({
    id: "write_word",
    name: "写 Word",
    description:
      "生成一个 Word 文档（.docx）保存到桌面。\n\n" +
      "何时用：\n" +
      "- 用户要写报告/总结/方案/请假条\n" +
      "- 需要「导出成 Word」「做成 docx」\n\n" +
      "不要用于：\n" +
      "- 表格数据（用 write_excel）\n" +
      "- 正式合同/简历（用 write_pdf）\n" +
      "- 轻量笔记（用 write_markdown）\n\n" +
      "参数：filename（.docx 结尾），title（标题），paragraphs（段落数组）。",
    enabled: true,
    risk: "fs-write",
    inputSchema: {
      type: "object",
      properties: {
        filename:   { type: "string", description: "文件名（.docx 结尾）" },
        title:      { type: "string", description: "文档标题" },
        paragraphs: { type: "array", description: "段落字符串数组", items: { type: "string" } },
      },
      required: ["filename", "title", "paragraphs"],
    },
    execute: async (args) => {
      const filename = validateFilename(String(args.filename || ""), ".docx");
      if (!filename) return "[错误] filename 必须是 .docx 结尾的纯文件名";

      const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import("docx");
      const doc = new Document({
        sections: [{
          children: [
            new Paragraph({
              text: String(args.title || ""),
              heading: HeadingLevel.HEADING_1,
            }),
            ...((args.paragraphs as string[]) || []).map(p =>
              new Paragraph({ children: [new TextRun(p)] })
            ),
          ],
        }],
      });

      const buffer = await Packer.toBuffer(doc);
      const outputPath = desktopPath(filename);
      fs.writeFileSync(outputPath, buffer);
      console.log(LOG_PREFIX, "Word 已生成:", outputPath);
      return `[write_word] 已生成：${outputPath}`;
    },
  });

  // ── write_pdf ────────────────────────────────────────
  toolRegistry.register({
    id: "write_pdf",
    name: "写 PDF",
    description:
      "生成一个 PDF 文件保存到桌面。\n\n" +
      "何时用：\n" +
      "- 用户要写正式文档（合同/简历/申请书）\n" +
      "- 需要「导出成 PDF」\n\n" +
      "不要用于：\n" +
      "- 可编辑文档（用 write_word）\n" +
      "- 表格数据（用 write_excel）\n\n" +
      "参数：filename（.pdf 结尾），title（标题），paragraphs（段落数组）。",
    enabled: true,
    risk: "fs-write",
    inputSchema: {
      type: "object",
      properties: {
        filename:   { type: "string", description: "文件名（.pdf 结尾）" },
        title:      { type: "string", description: "标题" },
        paragraphs: { type: "array", description: "段落字符串数组", items: { type: "string" } },
      },
      required: ["filename", "title", "paragraphs"],
    },
    execute: async (args) => {
      const filename = validateFilename(String(args.filename || ""), ".pdf");
      if (!filename) return "[错误] filename 必须是 .pdf 结尾的纯文件名";

      const PDFKit = await import("pdfkit");
      const outputPath = desktopPath(filename);
      const doc = new PDFKit.default();
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // 中文字体：Windows 用微软雅黑，找不到则用默认（中文会乱码但能生成）
      const fontCandidates = [
        "C:\\Windows\\Fonts\\msyh.ttc",
        "C:\\Windows\\Fonts\\simsun.ttc",
        "C:\\Windows\\Fonts\\simhei.ttf",
      ];
      for (const f of fontCandidates) {
        if (fs.existsSync(f)) { doc.font(f); break; }
      }

      doc.fontSize(22).text(String(args.title || ""), { align: "center" });
      doc.moveDown();
      doc.fontSize(12);
      for (const p of (args.paragraphs as string[]) || []) {
        doc.text(p, { align: "left" });
        doc.moveDown(0.5);
      }
      doc.end();

      await new Promise<void>((resolve, reject) => {
        stream.on("finish", () => resolve());
        stream.on("error", reject);
      });
      console.log(LOG_PREFIX, "PDF 已生成:", outputPath);
      return `[write_pdf] 已生成：${outputPath}`;
    },
  });

  // ── write_markdown ───────────────────────────────────
  toolRegistry.register({
    id: "write_markdown",
    name: "写 Markdown",
    description:
      "生成一个 Markdown 文件（.md）保存到桌面。\n\n" +
      "何时用：\n" +
      "- 用户要写笔记/文档\n" +
      "- 需要轻量级文档输出\n" +
      "- 比 Word/PDF 更轻量的场景\n\n" +
      "不要用于：\n" +
      "- 正式文档（用 write_word / write_pdf）\n" +
      "- 表格数据（用 write_excel）\n\n" +
      "参数：filename（.md 结尾），content（markdown 内容字符串）。",
    enabled: true,
    risk: "fs-write",
    inputSchema: {
      type: "object",
      properties: {
        filename: { type: "string", description: "文件名（.md 结尾）" },
        content:  { type: "string", description: "markdown 内容" },
      },
      required: ["filename", "content"],
    },
    execute: async (args) => {
      const filename = validateFilename(String(args.filename || ""), ".md");
      if (!filename) return "[错误] filename 必须是 .md 结尾的纯文件名";

      const outputPath = desktopPath(filename);
      fs.writeFileSync(outputPath, String(args.content || ""), "utf8");
      console.log(LOG_PREFIX, "Markdown 已生成:", outputPath);
      return `[write_markdown] 已生成：${outputPath}`;
    },
  });
}
