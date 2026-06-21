// coords —— VLM 文本 → 坐标/布尔/匹配索引 解析。
// 纯函数，不依赖 electron。VLM 返回 JSON（可能带 ```json 围栏或夹在文本里），
// 统一要求坐标为 0-1000 归一化，不依赖各模型私有格式。

/** 从文本提取首个 JSON 对象并解析。失败返回 null。 */
function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```/gi, "").trim();
  try {
    const v = JSON.parse(cleaned);
    return v && typeof v === "object" ? v as Record<string, unknown> : null;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      const v = JSON.parse(cleaned.slice(start, end + 1));
      return v && typeof v === "object" ? v as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }
}

/** VLM 文本 → 点击坐标（0-1000 归一化 → 屏幕像素，clamp 边界）。无坐标返回 null。 */
export function parseClickCoord(text: string, screenW: number, screenH: number): { x: number; y: number } | null {
  const obj = extractJson(text);
  if (!obj) return null;
  const x = Number(obj.x);
  const y = Number(obj.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const px = Math.max(0, Math.min(screenW, Math.round((x / 1000) * screenW)));
  const py = Math.max(0, Math.min(screenH, Math.round((y / 1000) * screenH)));
  return { x: px, y: py };
}

/** VLM 文本 → 布尔（vlm_check 用）。JSON {answer:bool} 优先；否则中文/英文关键词。无法判断 null。 */
export function parseBoolAnswer(text: string): boolean | null {
  const obj = extractJson(text);
  if (obj && typeof obj.answer === "boolean") return obj.answer;
  // false 关键词优先（"没有"含"有"但整体应是 false）
  if (/无|没|否|不|未|关|false|no/i.test(text)) return false;
  if (/是|有|开|true|yes/i.test(text)) return true;
  return null;
}

/** VLM 文本 → 匹配索引（vlm_compare 用）。{match:index}；索引超 [0,refCount) 返回 null。 */
export function parseMatchIndex(text: string, refCount: number): number | null {
  const obj = extractJson(text);
  if (!obj) return null;
  const idx = Number(obj.match);
  if (!Number.isFinite(idx)) return null;
  const i = Math.round(idx);
  if (i < 0 || i >= refCount) return null;
  return i;
}
