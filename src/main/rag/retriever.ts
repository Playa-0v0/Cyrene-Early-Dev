import { JsonVectorStore, SearchResult } from "./vectorstore";
import { EmbeddingProvider, getEmbeddingProvider } from "./embedding";

// ── 简易 BM25 ──
// 不依赖外部库，用 TF-IDF 风格的词频匹配
function tokenize(text: string): string[] {
  // 中文按字符切，英文按空格切
  const tokens: string[] = [];
  const seg = text.split(/([\u4e00-\u9fff]|[a-zA-Z]+|\d+)/).filter(Boolean);
  for (const s of seg) {
    if (/[\u4e00-\u9fff]/.test(s)) {
      // 中文逐字
      for (const c of s) tokens.push(c);
    } else {
      tokens.push(s.toLowerCase());
    }
  }
  return tokens;
}

function bm25Score(
  queryTokens: string[],
  docTokens: string[],
  docFreq: Map<string, number>,
  totalDocs: number,
  avgDocLen: number
): number {
  const k1 = 1.2;
  const b = 0.75;
  const docLen = docTokens.length;
  let score = 0;

  const tf: Map<string, number> = new Map();
  for (const t of docTokens) {
    tf.set(t, (tf.get(t) || 0) + 1);
  }

  for (const qt of queryTokens) {
    const df = docFreq.get(qt) || 0;
    if (df === 0) continue;
    const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1);
    const termFreq = tf.get(qt) || 0;
    const numerator = termFreq * (k1 + 1);
    const denominator = termFreq + k1 * (1 - b + b * (docLen / avgDocLen));
    score += idf * (numerator / denominator);
  }

  return score;
}

// ── 混合检索器 ──
export class HybridRetriever {
  private store: JsonVectorStore;
  private provider: EmbeddingProvider;

  constructor(store: JsonVectorStore, provider?: EmbeddingProvider) {
    this.store = store;
    this.provider = provider || getEmbeddingProvider();
  }

  async retrieve(
    query: string,
    source?: string,
    topK = 5,
    vectorWeight = 0.7,
    bm25Weight = 0.3
  ): Promise<SearchResult[]> {
    const stats = this.store.stats;
    if (stats.total === 0) return [];

    // 1. Vector 检索
    const vectorResults = await this.store.search(query, source, this.provider, topK * 3);

    // 2. BM25 检索
    const bm25Results = this.bm25Search(query, source, topK * 3);

    // 3. 融合：加权求和
    const merged: Map<string, { result: SearchResult; vectorScore: number; bm25Score: number }> = new Map();

    for (const r of vectorResults) {
      merged.set(r.entry.id, { result: r, vectorScore: r.score, bm25Score: 0 });
    }

    for (const r of bm25Results) {
      const existing = merged.get(r.entry.id);
      if (existing) {
        existing.bm25Score = r.score;
      } else {
        merged.set(r.entry.id, { result: r, vectorScore: 0, bm25Score: r.score });
      }
    }

    // 归一化 + 加权
    const all = Array.from(merged.values());
    const maxV = Math.max(...all.map((m) => m.vectorScore), 1);
    const maxB = Math.max(...all.map((m) => m.bm25Score), 1);

    const scored = all.map((m) => ({
      ...m.result,
      score: (m.vectorScore / maxV) * vectorWeight + (m.bm25Score / maxB) * bm25Weight,
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  private bm25Search(query: string, source?: string, topK = 15): SearchResult[] {
    const entries = this.store["entries"] as Array<{
      id: string; text: string; embedding: number[]; source: string;
      weight: number; createdAt: number; lastRecalledAt: number;
    }>;

    const docs = source ? entries.filter((e) => e.source === source) : entries;
    if (docs.length === 0) return [];

    const queryTokens = tokenize(query);
    const docTokensList = docs.map((d) => tokenize(d.text));
    const totalDocs = docs.length;
    const avgDocLen = docTokensList.reduce((sum, t) => sum + t.length, 0) / totalDocs;

    // 文档频率
    const docFreq = new Map<string, number>();
    for (const tokens of docTokensList) {
      const seen = new Set<string>();
      for (const t of tokens) {
        if (!seen.has(t)) {
          docFreq.set(t, (docFreq.get(t) || 0) + 1);
          seen.add(t);
        }
      }
    }

    const scored = docs.map((doc, i) => ({
      entry: {
        id: doc.id,
        text: doc.text,
        embedding: doc.embedding,
        source: doc.source,
        weight: doc.weight,
        createdAt: doc.createdAt,
        lastRecalledAt: doc.lastRecalledAt,
      },
      score: bm25Score(queryTokens, docTokensList[i], docFreq, totalDocs, avgDocLen),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }
}