// @xenova/transformers is ESM-only, use dynamic import in CJS context

// ── 类型 ──
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  readonly dims: number;
  readonly name: string;
}

// ── 模型注册表 ──
interface ModelConfig {
  key: string;
  hfName: string;
  dims: number;
}

const LOCAL_MODELS: Record<string, ModelConfig> = {
  minilm: { key: "minilm", hfName: "Xenova/all-MiniLM-L6-v2", dims: 384 },
  bgem3:  { key: "bgem3",  hfName: "Xenova/bge-m3",          dims: 1024 },
};

const DEFAULT_MODEL_KEY = "minilm";

// ── 本地 Pipeline ──
let localPipeline: any = null;
let currentModelKey: string = DEFAULT_MODEL_KEY;

const importEsm = new Function("moduleName", "return import(moduleName)") as (moduleName: string) => Promise<any>;

async function getLocalPipeline(modelKey?: string): Promise<any> {
  const key = modelKey || currentModelKey;
  const config = LOCAL_MODELS[key];
  if (!config) throw new Error("Unknown embedding model: " + key);

  if (!localPipeline || currentModelKey !== key) {
    const { pipeline, env } = await importEsm("@xenova/transformers");
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.useBrowserCache = false;
    env.localModelPath = require("path").join(require("os").homedir(), ".cache", "huggingface");
    localPipeline = await pipeline("feature-extraction", config.hfName);
    currentModelKey = key;
  }
  return localPipeline;
}

export function createLocalEmbeddingProvider(modelKey?: string): EmbeddingProvider {
  const key = modelKey || DEFAULT_MODEL_KEY;
  const config = LOCAL_MODELS[key];
  if (!config) throw new Error("Unknown embedding model: " + key);

  return {
    name: "local-" + config.hfName.split("/").pop(),
    dims: config.dims,

    async embed(text: string): Promise<number[]> {
      const pipe = await getLocalPipeline(key);
      const result: any = await pipe(text, { pooling: "mean", normalize: true });
      return Array.from(result.data as Float32Array);
    },

    async embedBatch(texts: string[]): Promise<number[][]> {
      const pipe = await getLocalPipeline(key);
      const results: number[][] = [];
      for (const text of texts) {
        const result: any = await pipe(text, { pooling: "mean", normalize: true });
        results.push(Array.from(result.data as Float32Array));
      }
      return results;
    },
  };
}

// ── OpenAI 兼容 Provider ──
export function createOpenAIEmbeddingProvider(
  baseUrl: string,
  apiKey: string,
  model = "text-embedding-ada-002"
): EmbeddingProvider {
  const endpoint = baseUrl.replace(/\/+$/, "") + "/embeddings";

  return {
    name: "openai-compat-" + model,
    dims: 1536,

    async embed(text: string): Promise<number[]> {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey,
        },
        body: JSON.stringify({ model, input: text }),
      });
      if (!res.ok) {
        throw new Error("Embedding API error: " + res.status + " " + await res.text());
      }
      const data = await res.json() as { data: Array<{ embedding: number[] }> };
      return data.data[0].embedding;
    },

    async embedBatch(texts: string[]): Promise<number[][]> {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey,
        },
        body: JSON.stringify({ model, input: texts }),
      });
      if (!res.ok) {
        throw new Error("Embedding API error: " + res.status + " " + await res.text());
      }
      const data = await res.json() as { data: Array<{ embedding: number[] }> };
      return data.data.map((d) => d.embedding);
    },
  };
}

// ── 自动选择 Provider ──
let cachedProvider: EmbeddingProvider | null = null;

export function getEmbeddingProvider(
  mode: "auto" | "local" | "cloud" = "auto",
  cloudBaseUrl?: string,
  cloudApiKey?: string,
  modelKey?: string
): EmbeddingProvider {
  if (cachedProvider) return cachedProvider;

  if (mode === "local") {
    cachedProvider = createLocalEmbeddingProvider(modelKey);
  } else if (mode === "cloud" && cloudBaseUrl && cloudApiKey) {
    cachedProvider = createOpenAIEmbeddingProvider(cloudBaseUrl, cloudApiKey);
  } else {
    cachedProvider = createLocalEmbeddingProvider(modelKey);
  }

  return cachedProvider;
}

export function getCurrentModelKey(): string {
  return currentModelKey;
}

export function getCurrentModelDims(): number {
  const config = LOCAL_MODELS[currentModelKey];
  return config ? config.dims : 384;
}

export function switchEmbeddingModel(modelKey: string): void {
  const config = LOCAL_MODELS[modelKey];
  if (!config) throw new Error("Unknown embedding model: " + modelKey);
  cachedProvider = null;
  localPipeline = null;
  currentModelKey = modelKey;
}

export function resetEmbeddingProvider(): void {
  cachedProvider = null;
  localPipeline = null;
  currentModelKey = DEFAULT_MODEL_KEY;
}
