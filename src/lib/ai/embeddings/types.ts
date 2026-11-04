/** Dimensión de todos los embeddings guardados (columna vector(1024)). */
export const EMBEDDING_DIMENSIONS = 1024;

/** Las consultas y los documentos se codifican distinto (mejor recuperación). */
export type EmbeddingInputType = "query" | "document";

export type EmbeddingProviderName = "voyage" | "mock";

export type EmbeddingResult = {
  vectors: number[][];
  /** Tokens facturados por el proveedor (estimados en el mock). */
  tokens: number;
};

/** Frontera con el proveedor de embeddings: sustituible en tests sin red. */
export interface EmbeddingProvider {
  readonly name: EmbeddingProviderName;
  /** Se guarda con cada documento: si cambia, hay que reprocesarlos. */
  readonly model: string;
  /** Similitud mínima por defecto para considerar relevante un fragmento. */
  readonly defaultMinSimilarity: number;
  /** Máximo de textos por petición. */
  readonly maxBatchSize: number;
  embed(texts: string[], inputType: EmbeddingInputType): Promise<EmbeddingResult>;
}
