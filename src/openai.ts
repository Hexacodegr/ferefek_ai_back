import OpenAI from 'openai';
import { sleep } from './utils';

export const MAX_TOKENS_PER_EMBEDDING = 8000; // As per OpenAI docs

export class OpenAIClient {
  private client: OpenAI;
  private minDelayMs: number;
  private lastCall: number;

  constructor(minDelayMs: number = 2000) {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.minDelayMs = minDelayMs;
    this.lastCall = 0;
  }

  private async rateLimit() {
    const now = Date.now();
    const wait = Math.max(0, this.lastCall + this.minDelayMs - now);
    if (wait > 0) await sleep(wait);
    this.lastCall = Date.now();
  }

  async createEmbedding(text: string): Promise<{ embedding: number[]; tokensUsed: number }> {
    await this.rateLimit();

    try {
      const response = await this.client.embeddings.create({
        model: 'text-embedding-3-large',
        input: text.substring(0, MAX_TOKENS_PER_EMBEDDING),
      });

      return {
        embedding: response.data[0].embedding,
        tokensUsed: response.usage?.total_tokens || 0,
      };
    } catch (error: any) {
      if (error.status === 429) {
        console.warn('🔄 Rate limited. Waiting...');
        await sleep(5000);
        return this.createEmbedding(text);
      }
      throw error;
    }
  }
}

export const openAIClient = new OpenAIClient();
