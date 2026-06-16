// @xenova/transformers is ESM-only, use dynamic import in CJS context

// ── 类型 ──
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  readonly dims: number;
  readonly name: string;
}

// ── 本地 MiniLM Provider ──
let localPipeline: any = null;

const importEsm = new Function("moduleName", "return import(moduleName)") as (moduleName: string) => Promise<any>;

async function getLocalPipeline(): Promise<any> {
  if (!localPipeline) {
    const { pipeline, env } = await importEsm("@xenova/transformers");
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.useBrowserCache = false;
    // Point to HuggingFace cache (default is node_modules, but models are in ~/.cache/huggingface)
    env.localModelPath = require("path").join(require("os").homedir(), ".cache", "huggingface");
    localPipeline = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return localPipeline;
}

export function createLocalEmbeddingProvider(): EmbeddingProvider {
  return {
    name: "local-MiniLM-L6-v2",
    dims: 384,

    async embed(text: string): Promise<number[]> {
      const pipe = await getLocalPipeline();
      const result: any = await pipe(text, { pooling: "mean", normalize: true });
      return Array.from(result.data as Float32Array);
    },

    async embedBatch(texts: string[]): Promise<number[][]> {
      const pipe = await getLocalPipeline();
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
    name: `openai-compat-${model}`,
    dims: 1536,

    async embed(text: string): Promise<number[]> {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, input: text }),
      });
      if (!res.ok) {
        throw new Error(`Embedding API error: ${res.status} ${await res.text()}`);
      }
      const data = await res.json() as { data: Array<{ embedding: number[] }> };
      return data.data[0].embedding;
    },

    async embedBatch(texts: string[]): Promise<number[][]> {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, input: texts }),
      });
      if (!res.ok) {
        throw new Error(`Embedding API error: ${res.status} ${await res.text()}`);
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
  cloudApiKey?: string
): EmbeddingProvider {
  if (cachedProvider) return cachedProvider;

  if (mode === "local") {
    cachedProvider = createLocalEmbeddingProvider();
  } else if (mode === "cloud" && cloudBaseUrl && cloudApiKey) {
    cachedProvider = createOpenAIEmbeddingProvider(cloudBaseUrl, cloudApiKey);
  } else {
    cachedProvider = createLocalEmbeddingProvider();
  }

  return cachedProvider;
}

export function resetEmbeddingProvider(): void {
  cachedProvider = null;
  localPipeline = null;
}