import * as path from "path";
import { app } from "electron";
import { getEmbeddingProvider, resetEmbeddingProvider, EmbeddingProvider } from "./embedding";
import { JsonVectorStore } from "./vectorstore";
import { HybridRetriever } from "./retriever";
import { WorldbookManager } from "./worldbook";
import { chunkText } from "./chunk";

// ── Global RAG instances ──
let store: JsonVectorStore | null = null;
let retriever: HybridRetriever | null = null;
let worldbook: WorldbookManager | null = null;
let provider: EmbeddingProvider | null = null;

function getDataDir(): string {
  return path.join(app.getPath("userData"), "rag-data");
}

// ── Init ──
export async function initRAG(
  ragMode: "auto" | "local" | "cloud" = "auto",
  cloudBaseUrl?: string,
  cloudApiKey?: string
): Promise<void> {
  const dataDir = getDataDir();
  provider = getEmbeddingProvider(ragMode, cloudBaseUrl, cloudApiKey);
  store = new JsonVectorStore(dataDir);
  retriever = new HybridRetriever(store, provider);
  worldbook = new WorldbookManager(path.join(app.getAppPath(), "prompts", "worldbook"));
  await worldbook.loadFromDirectory();

  console.log("[RAG] initialized. Mode:", ragMode, "Provider:", provider.name, "Memories:", store.stats.total);
}

// ── Memory write ──
export async function addMemory(
  text: string,
  source = "user_memory",
  metadata?: Record<string, unknown>
): Promise<string> {
  if (!store || !provider) throw new Error("RAG not initialized");
  const entry = await store.add(text, source, provider, metadata);
  return entry.id;
}

// ── Memory search ──
export async function searchMemory(
  query: string,
  source?: string,
  topK = 5
): Promise<string[]> {
  if (!retriever) return [];
  const results = await retriever.retrieve(query, source, topK);
  return results.map((r) => r.entry.text);
}

// ── Worldbook search (keyword-only, no vector) ──
export async function searchWorldbook(userInput: string): Promise<string[]> {
  if (!worldbook) return [];
  return worldbook.retrieveByKeywords(userInput);
}

// ── Get permanent worldbook entries ──
export function getPermanentWorldbookEntries(): string[] {
  if (!worldbook) return [];
  return worldbook.getPermanentEntries();
}

export function getAllWorldbookTriggerWords(): string[] {
  if (!worldbook) return [];
  return worldbook.getAllTriggerWords();
}

// ── Import document ──
export async function importDocument(
  text: string,
  fileName: string
): Promise<number> {
  if (!store || !provider) throw new Error("RAG not initialized");
  const chunks = chunkText(text, `doc_${fileName}`);
  await store.addBatch(
    chunks.map((c) => ({ text: c.text, source: "imported_doc", metadata: { fileName, chunkIndex: c.index } })),
    provider
  );
  return chunks.length;
}

// ── Build memory context (legacy, kept for compatibility) ──
export async function buildMemoryContext(userInput: string): Promise<string> {
  const parts: string[] = [];

  // 1. Worldbook
  const wbResults = await searchWorldbook(userInput);
  if (wbResults.length > 0) {
    parts.push("\u3010\u76f8\u5173\u80cc\u666f\u3011\n" + wbResults.join("\n\n"));
  }

  // 2. Imported docs
  const docResults = await searchMemory(userInput, "imported_doc", 5);
  if (docResults.length > 0) {
    parts.push("\u3010\u76f8\u5173\u6587\u4ef6\u7247\u6bb5\u3011\n" + docResults.map((m) => "- " + m).join("\n"));
  }

  // 3. User memory
  const memResults = await searchMemory(userInput, "user_memory", 3);
  if (memResults.length > 0) {
    parts.push("\u3010\u5173\u4e8e\u7528\u6237\u7684\u8bb0\u5fc6\u3011\n" + memResults.map((m) => "- " + m).join("\n"));
  }

  return parts.join("\n\n");
}

// ── Reset ──
export function resetRAG(): void {
  store = null;
  retriever = null;
  worldbook = null;
  provider = null;
  resetEmbeddingProvider();
}

export function getRAGStats() {
  return store?.stats ?? { total: 0, sources: {} };
}
