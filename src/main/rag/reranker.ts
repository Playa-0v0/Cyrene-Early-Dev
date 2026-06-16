// Reranker module — cross-encoder reranking for RAG
import * as path from "path";
import { app } from "electron";

// ── Types ──
export interface RerankerProvider {
  rerank(query: string, documents: string[]): Promise<Array<{ text: string; score: number }>>;
  readonly name: string;
}

// ── ESM import helper (same pattern as embedding.ts) ──
const importEsm = new Function("moduleName", "return import(moduleName)") as (moduleName: string) => Promise<any>;

// ── Pipeline cache ──
let lightPipeline: any = null;
let standardPipeline: any = null;

function getModelsDir(): string {
  return path.join(app.getAppPath(), "models");
}

async function loadRerankerPipeline(modelDir: string): Promise<any> {
  const { pipeline, env } = await importEsm("@xenova/transformers");

  // Save original localModelPath (embedding may have set it)
  const originalPath = env.localModelPath;
  env.localModelPath = getModelsDir();
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.useBrowserCache = false;

  try {
    const pipe = await pipeline("text-classification", modelDir, {
      quantized: true,
    });
    console.log(`[Reranker] pipeline "${modelDir}" loaded OK`);
    return pipe;
  } finally {
    // Restore so embedding pipeline still works
    env.localModelPath = originalPath;
  }
}

// ── Lightweight reranker (ms-marco-MiniLM-L6-v2, ~23MB) ──
export async function createLightReranker(): Promise<RerankerProvider> {
  if (!lightPipeline) {
    lightPipeline = await loadRerankerPipeline("ms-marco-MiniLM-L-6-v2");
  }

  return {
    name: "ms-marco-MiniLM-L6-v2",

    async rerank(query: string, documents: string[]): Promise<Array<{ text: string; score: number }>> {
      if (documents.length === 0) return [];
      if (!lightPipeline) throw new Error("Light reranker not initialized");

      const start = Date.now();

      // Cross-encoder: each input is [query, doc] pair
      const inputs = documents.map((doc) => [query, doc]);
      const outputs = await lightPipeline(inputs);

      const results = documents.map((text, i) => ({
        text,
        score: outputs[i]?.score ?? 0,
      }));

      results.sort((a, b) => b.score - a.score);

      console.log(`[Reranker] light: ${documents.length} docs reranked in ${Date.now() - start}ms`);
      return results;
    },
  };
}

// ── Standard reranker (bge-reranker-base, ~279MB) ──
export async function createStandardReranker(): Promise<RerankerProvider> {
  if (!standardPipeline) {
    standardPipeline = await loadRerankerPipeline("bge-reranker-base");
  }

  return {
    name: "bge-reranker-base",

    async rerank(query: string, documents: string[]): Promise<Array<{ text: string; score: number }>> {
      if (documents.length === 0) return [];
      if (!standardPipeline) throw new Error("Standard reranker not initialized");

      const start = Date.now();

      const inputs = documents.map((doc) => [query, doc]);
      const outputs = await standardPipeline(inputs);

      const results = documents.map((text, i) => ({
        text,
        score: outputs[i]?.score ?? 0,
      }));

      results.sort((a, b) => b.score - a.score);

      console.log(`[Reranker] standard: ${documents.length} docs reranked in ${Date.now() - start}ms`);
      return results;
    },
  };
}

// ── Reranker manager ──
let currentReranker: RerankerProvider | null = null;
let currentRerankerMode: "light" | "standard" | "none" = "none";

export async function initReranker(mode: "light" | "standard" | "none"): Promise<void> {
  currentRerankerMode = mode;

  if (mode === "none") {
    currentReranker = null;
    console.log("[Reranker] disabled");
    return;
  }

  console.log(`[Reranker] initializing ${mode} mode...`);

  if (mode === "light") {
    currentReranker = await createLightReranker();
  } else {
    currentReranker = await createStandardReranker();
  }

  console.log(`[Reranker] ${mode} mode ready: ${currentReranker.name}`);
}

export function getReranker(): RerankerProvider | null {
  return currentReranker;
}

export function getRerankerMode(): "light" | "standard" | "none" {
  return currentRerankerMode;
}

export function resetReranker(): void {
  currentReranker = null;
  currentRerankerMode = "none";
  lightPipeline = null;
  standardPipeline = null;
}
