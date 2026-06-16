// ── 简单 Chunk 切分 ──
// 按段落切分，超长段落按句子切，确保每个 chunk 不超过 maxTokens

export interface Chunk {
  id: string;
  text: string;
  source: string;       // 来源：文件名或 "memory"
  index: number;        // chunk 序号
  metadata?: Record<string, unknown>;
}

// 粗略估算 token 数（中文按字数，英文按空格分词）
function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherTokens = text
    .replace(/[\u4e00-\u9fff]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return chineseChars + otherTokens;
}

// 按句子切分（中英文通用）
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。！？.!?\n])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function chunkText(
  text: string,
  source: string,
  maxTokens = 512,
  overlapTokens = 50
): Chunk[] {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const chunks: Chunk[] = [];
  let currentChunk = "";
  let chunkIndex = 0;

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);

    if (paraTokens <= maxTokens) {
      // 段落可以直接作为一个 chunk
      if (estimateTokens(currentChunk) + paraTokens > maxTokens && currentChunk) {
        chunks.push({
          id: `${source}_${chunkIndex}`,
          text: currentChunk.trim(),
          source,
          index: chunkIndex,
        });
        chunkIndex++;
        currentChunk = "";
      }
      currentChunk += (currentChunk ? "\n\n" : "") + para;
    } else {
      // 段落太长，按句子切
      if (currentChunk) {
        chunks.push({
          id: `${source}_${chunkIndex}`,
          text: currentChunk.trim(),
          source,
          index: chunkIndex,
        });
        chunkIndex++;
        currentChunk = "";
      }

      const sentences = splitSentences(para);
      let sentenceChunk = "";
      for (const sentence of sentences) {
        if (estimateTokens(sentenceChunk) + estimateTokens(sentence) > maxTokens && sentenceChunk) {
          chunks.push({
            id: `${source}_${chunkIndex}`,
            text: sentenceChunk.trim(),
            source,
            index: chunkIndex,
          });
          chunkIndex++;
          // overlap: 保留最后几个句子
          const overlapSentences = splitSentences(sentenceChunk).slice(-2);
          sentenceChunk = overlapSentences.join("") + sentence;
        } else {
          sentenceChunk += sentence;
        }
      }
      if (sentenceChunk.trim()) {
        chunks.push({
          id: `${source}_${chunkIndex}`,
          text: sentenceChunk.trim(),
          source,
          index: chunkIndex,
        });
        chunkIndex++;
      }
    }
  }

  // 剩余内容
  if (currentChunk.trim()) {
    chunks.push({
      id: `${source}_${chunkIndex}`,
      text: currentChunk.trim(),
      source,
      index: chunkIndex,
    });
  }

  return chunks;
}