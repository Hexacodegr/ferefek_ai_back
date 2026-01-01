import { QdrantClient } from '@qdrant/js-client-rest';

export const COLLECTION_NAME = 'job_listings';
export const EMBEDDING_DIM = 3072;

export class QdrantService {
  client;
  collectionName;
  embeddingDim;

  constructor(options?: { collectionName?: string; embeddingDim?: number }) {
    const url = process.env.QDRANT_URL || 'http://localhost:6333';
    const apiKey = process.env.QDRANT_API_KEY;
    this.collectionName = options?.collectionName || COLLECTION_NAME;
    this.embeddingDim = options?.embeddingDim || EMBEDDING_DIM;
    this.client = new QdrantClient({ url, apiKey });
  }

  private generateUniqueId(chunkId: string): string {
    // Convert chunkId to a UUID v5 format using a deterministic hash
    // This ensures we get a valid UUID that Qdrant accepts
    const crypto = require('crypto');
    const hash = crypto.createHash('md5').update(chunkId).digest('hex');

    // Format as UUID v4 (8-4-4-4-12)
    const uuid = [
      hash.substring(0, 8),
      hash.substring(8, 12),
      hash.substring(12, 16),
      hash.substring(16, 20),
      hash.substring(20, 32),
    ].join('-');

    return uuid;
  }

  async setupQdrant() {
    console.log('🔧 Setting up Qdrant collection...');
    try {
      // Check existing collection
      const existing = await this.client.getCollection(this.collectionName);
      const vectorsConfig = existing.config.params.vectors;
      if (!vectorsConfig || typeof vectorsConfig.size !== 'number') {
        console.log('⚠️ Existing collection vectors config is undefined or invalid.');
        console.log('🗑️ Deleting existing collection...');
        await this.client.deleteCollection(this.collectionName);
        console.log('✅ Collection deleted successfully');
      } else {
        console.log(`📊 Existing collection dimension: ${vectorsConfig.size}`);
        console.log(`🎯 Required dimension: ${this.embeddingDim}`);

        if (vectorsConfig.size !== this.embeddingDim) {
          console.log('🗑️ Deleting existing collection with wrong dimensions...');
          await this.client.deleteCollection(this.collectionName);
          console.log('✅ Collection deleted successfully');
        } else {
          console.log('✅ Qdrant collection exists with correct dimensions');
          return;
        }
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

      // Generate deterministic unique ID based on chunk ID
      const uniqueId = this.generateUniqueId(chunk.metadata.chunkId);

      return {
        id: uniqueId,
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
          chunkId: chunk.metadata.chunkId || null,
        },
      };
    });

    console.log('First point sample:', JSON.stringify(points[0], null, 2));
    console.log('Vector dimension:', points[0].vector.length);
    console.log('Expected dimension:', this.embeddingDim);

    try {
      await this.client.upsert(this.collectionName, { points });
      console.log('✅ Chunks stored in Qdrant');
    } catch (error: any) {
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

  async similaritySearch(vector: number[], topK: number = 5, scoreThreshold: number, filter?: any) {
    try {
      // Validate vector dimension
      if (vector.length !== this.embeddingDim) {
        throw new Error(
          `Vector dimension mismatch: expected ${this.embeddingDim}, got ${vector.length}`
        );
      }

      console.log(`Searching with vector dimension: ${vector.length}, topK: ${topK}`);
      if (filter) {
        console.log('Using filter:', JSON.stringify(filter, null, 2));
      }

      // Build query parameters for proper similarity search
      const queryParams: any = {
        query: vector,
        limit: topK,
        with_payload: true, // FIXED: Need payload data
        with_vector: false,
        score_threshold: scoreThreshold || 0.7,
      };

      if (filter) {
        queryParams.filter = filter;
      }

      // Perform actual similarity search
      const points = await this.client.query(this.collectionName, queryParams);

      console.log(`Found ${points.points?.length || 0} similarity search results`);
      if (points.points && points.points.length > 0) {
        console.log('Top result score:', points.points[0].score);
        console.log('Sample payload keys:', Object.keys(points.points[0].payload || {}));
      } else {
        console.log('🤔 No similarity results found');
      }

      // Return the results with scores
      return (
        points.points?.map((res: any) => ({
          score: res.score,
          payload: res.payload,
        })) || []
      );
    } catch (error: any) {
      console.error('❌ Similarity search error:', error.message);
      throw error;
    }
  }

  async getAllEntries(limit: number = 100) {
    // Scroll through all points in the collection
    const scrollResult = await this.client.scroll(this.collectionName, {
      limit,
      with_payload: true,
    });
    // Return the payloads (documents)
    return scrollResult.points.map((res: any) => ({
      id: res.id,
      payload: res.payload,
    }));
  }

  async clearCollection() {
    console.log('🗑️ Clearing all points from collection...');
    try {
      // Get all point IDs first
      const scrollResult = await this.client.scroll(this.collectionName, {
        limit: 10000, // Get large number of points
        with_payload: false,
        with_vector: false,
      });

      if (scrollResult.points && scrollResult.points.length > 0) {
        const pointIds = scrollResult.points.map((point: any) => point.id);
        console.log(`Found ${pointIds.length} points to delete`);

        // Delete all points
        await this.client.delete(this.collectionName, {
          points: pointIds,
        });

        console.log(`✅ Deleted ${pointIds.length} points from collection`);
      } else {
        console.log('✅ Collection is already empty');
      }
    } catch (error: any) {
      console.error('❌ Error clearing collection:', error.message);
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
