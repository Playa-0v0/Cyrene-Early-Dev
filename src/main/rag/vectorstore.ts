import * as fs from "fs";
import * as path from "path";
import { getEmbeddingProvider, EmbeddingProvider } from "./embedding";

// ── 类型 ──
export interface MemoryEntry {
  id: string;
  text: string;
  embedding: number[];
  source: string;       // "user_memory" | "worldbook" | "imported_doc"
  weight: number;       // 1.0 初始，每次召回 +0.1，24h 未提 ×0.95
  createdAt: number;    // timestamp
  lastRecalledAt: number;
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  entry: MemoryEntry;
  score: number;        // 余弦相似度
}

// ── 余弦相似度 ──
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ── JSON 向量存储 ──
export class JsonVectorStore {
  private filePath: string;
  private entries: MemoryEntry[] = [];
  private dirty = false;

  constructor(dbPath: string) {
    this.filePath = path.join(dbPath, "memory-store.json");
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf8");
        this.entries = JSON.parse(raw) as MemoryEntry[];
      }
    } catch (err) {
      console.warn("[RAG] failed to load vector store:", err);
      this.entries = [];
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2), "utf8");
      this.dirty = false;
    } catch (err) {
      console.warn("[RAG] failed to save vector store:", err);
    }
  }

  // 添加记忆（自动去重）
  async add(
    text: string,
    source: string,
    provider: EmbeddingProvider,
    metadata?: Record<string, unknown>
  ): Promise<MemoryEntry> {
    // 去重检查
    const existing = await this.search(text, source, provider, 1, 0.95);
    if (existing.length > 0) {
      // 更新权重和时间
      existing[0].entry.weight = Math.min(existing[0].entry.weight + 0.1, 5.0);
      existing[0].entry.lastRecalledAt = Date.now();
      this.dirty = true;
      this.save();
      return existing[0].entry;
    }

    const embedding = await provider.embed(text);
    const entry: MemoryEntry = {
      id: `${source}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      text,
      embedding,
      source,
      weight: 1.0,
      createdAt: Date.now(),
      lastRecalledAt: Date.now(),
      metadata,
    };

    this.entries.push(entry);
    this.dirty = true;
    this.save();
    return entry;
  }

  // 批量添加（用于导入文档 chunk）
  async addBatch(
    items: Array<{ text: string; source: string; metadata?: Record<string, unknown> }>,
    provider: EmbeddingProvider
  ): Promise<MemoryEntry[]> {
    const texts = items.map((i) => i.text);
    const embeddings = await provider.embedBatch(texts);
    const results: MemoryEntry[] = [];

    for (let i = 0; i < items.length; i++) {
      const entry: MemoryEntry = {
        id: `${items[i].source}_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        text: items[i].text,
        embedding: embeddings[i],
        source: items[i].source,
        weight: 1.0,
        createdAt: Date.now(),
        lastRecalledAt: Date.now(),
        metadata: items[i].metadata,
      };
      this.entries.push(entry);
      results.push(entry);
    }

    this.dirty = true;
    this.save();
    return results;
  }

  // 搜索
  async search(
    query: string,
    source?: string,
    provider?: EmbeddingProvider,
    topK = 5,
    minScore = 0.3
  ): Promise<SearchResult[]> {
    if (this.entries.length === 0) return [];

    const queryEmbedding = provider
      ? await provider.embed(query)
      : await getEmbeddingProvider().embed(query);

    const now = Date.now();
    const results: SearchResult[] = [];

    for (const entry of this.entries) {
      if (source && entry.source !== source) continue;

      const sim = cosineSimilarity(queryEmbedding, entry.embedding);
      // 时间衰减：24h 未提及权重 ×0.95
      const hoursSinceRecall = (now - entry.lastRecalledAt) / (1000 * 60 * 60);
      const decayFactor = Math.pow(0.95, hoursSinceRecall / 24);
      const weightedScore = sim * entry.weight * decayFactor;

      if (weightedScore >= minScore) {
        results.push({ entry, score: weightedScore });
      }
    }

    // 排序并取 topK
    results.sort((a, b) => b.score - a.score);
    const top = results.slice(0, topK);

    // 更新召回时间
    for (const r of top) {
      r.entry.lastRecalledAt = now;
      r.entry.weight = Math.min(r.entry.weight + 0.05, 5.0);
    }
    if (top.length > 0) {
      this.dirty = true;
      this.save();
    }

    return top;
  }

  // 清理低权重记忆
  prune(minWeight = 0.1): number {
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.weight >= minWeight);
    this.dirty = true;
    this.save();
    return before - this.entries.length;
  }

  // 统计
  get stats() {
    const sources: Record<string, number> = {};
    for (const e of this.entries) {
      sources[e.source] = (sources[e.source] || 0) + 1;
    }
    return { total: this.entries.length, sources };
  }
}