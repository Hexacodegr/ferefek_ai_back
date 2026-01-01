import { QdrantClient } from '@qdrant/js-client-rest';
import { randomUUID } from 'crypto';

export const COLLECTION_NAME = 'job_listings';
export const EMBEDDING_DIM = 3072;

export class QdrantService {
  client;
  collectionName;
  embeddingDim;
  private idCounter: number = 0;

  constructor(options?: { collectionName?: string; embeddingDim?: number }) {
    const url = process.env.QDRANT_URL || 'http://localhost:6333';
    const apiKey = process.env.QDRANT_API_KEY;
    this.collectionName = options?.collectionName || COLLECTION_NAME;
    this.embeddingDim = options?.embeddingDim || EMBEDDING_DIM;
    this.client = new QdrantClient({ url, apiKey });
  }

  async setupQdrant() {
    console.log('🔧 Setting up Qdrant collection...');
    try {
      // Check existing collection
      const existing = await this.client.getCollection(this.collectionName);
      console.log(`📊 Existing collection dimension: ${existing.config.params.vectors.size}`);
      console.log(`🎯 Required dimension: ${this.embeddingDim}`);

      if (existing.config.params.vectors.size !== this.embeddingDim) {
        console.log('🗑️ Deleting existing collection with wrong dimensions...');
        await this.client.deleteCollection(this.collectionName);
        console.log('✅ Collection deleted successfully');
      } else {
        console.log('✅ Qdrant collection exists with correct dimensions');
        return;
      }
    } catch (error) {
      console.log('📝 Collection does not exist, will create new one');
    }

    console.log(`🏗️ Creating collection with dimension ${this.embeddingDim}...`);
    await this.client.createCollection(this.collectionName, {
      vectors: {
        size: this.embeddingDim,
        distance: 'Cosine',
      },
      optimizers_config: {
        indexing_threshold: 20000,
      },
    });
    console.log('✅ Qdrant collection created with correct dimensions');
  }

  async storeChunksWithEmbeddings(
    chunks: { embedding: number[]; metadata: any; rawText: string }[]
  ) {
    console.log(`💾 Storing ${chunks.length} chunks in Qdrant...`);

    const points = chunks.map((chunk, i) => {
      // Validate embedding dimension
      if (chunk.embedding.length !== this.embeddingDim) {
        console.warn(
          `⚠️ Embedding dimension mismatch: expected ${this.embeddingDim}, got ${chunk.embedding.length}`
        );
      }

      return {
        id: this.idCounter++, // Use simple incrementing integer
        vector: chunk.embedding,
        payload: {
          text: chunk.rawText || '', // Ensure text exists
          chunkLevel: chunk.metadata.chunkLevel || null,
          pageNumber: chunk.metadata.pageNumber || null,
          documentName: chunk.metadata.fileName || null,
          documentFilePath: chunk.metadata.filePath || null,
          paragraphIndex: chunk.metadata.paragraphIndex || null,
          parentIds: chunk.metadata.parentIds || [],
          fileFormat: chunk.metadata.fileFormat || null,
          tokensUsed: chunk.metadata.tokensUsed || null,
          documentHash: chunk.metadata.documentHash || null,
        },
      };
    });

    console.log('First point sample:', JSON.stringify(points[0], null, 2));
    console.log('Vector dimension:', points[0].vector.length);
    console.log('Expected dimension:', this.embeddingDim);

    try {
      await this.client.upsert(this.collectionName, { points });
      console.log('✅ Chunks stored in Qdrant');
    } catch (error) {
      console.error('❌ Qdrant storage error details:');
      console.error('Error message:', error.message || 'Unknown error');
      console.error('Error data:', error.data);
      console.error('Sample point causing the issue:');
      console.error(JSON.stringify(points[0], null, 2));

      // Try to get more details from Qdrant response
      if (error.data && error.data.status) {
        console.error('Qdrant status response:', error.data.status);
      }

      throw error;
    }
  }

  // async storeChunkWithEmbedding(pageContent: string, metadata: any, embedding: number[]) {
  //   console.log(`💾 Storing single chunk in Qdrant...`);

  //   const point = {
  //     id: metadata.chunkId || Math.random().toString(36).substr(2, 9), // Generate ID if not exists
  //     vector: embedding,
  //     payload: {
  //       text: pageContent,
  //       metadata: metadata,
  //     },
  //   };

  //   await this.client.upsert(this.collectionName, { points: [point] });
  //   console.log('✅ Single chunk stored in Qdrant');
  // }
}

export const qdrantService = new QdrantService();
