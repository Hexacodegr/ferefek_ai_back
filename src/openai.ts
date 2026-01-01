import OpenAI from 'openai';
import { sleep } from './pdf/utils';
import { ChatHistoryRow } from './types';

export const MAX_TOKENS_PER_EMBEDDING = 8000; // As per OpenAI docs
export const EMBEDDING_MODEL = 'text-embedding-3-large';
export const GENERATIVE_MODEL = 'gpt-4.1';

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
        model: EMBEDDING_MODEL,
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

  async generateAnswerFromResults(
    userQuery: string,
    searchResults: any[],
    chatHistory: ChatHistoryRow[] = []
  ): Promise<{ generatedAnswer: string; tokensUsed: number }> {
    await this.rateLimit();

    try {
      const response = await this.client.chat.completions.create({
        model: GENERATIVE_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are a helpful AI assistant that answers questions based on provided document excerpts and conversation history. 

Instructions:
1. Answer the user's question using ONLY the information provided in the context and previous conversation
2. If the context doesn't contain enough information, clearly state this
3. Cite specific documents when referencing information (e.g., "According to Document 1...")
4. Use conversation history to provide contextual and coherent responses
5. Be concise but thorough in your response
6. If multiple documents contain relevant information, synthesize the information
7. Maintain the same language as the user's question
8. If no relevant information is found, politely state that the documents don't contain information about the query`,
          },
          {
            role: 'user',
            content: `Question: ${userQuery}

Please provide a comprehensive answer based on the above context.`,
          },
          ...chatHistory,
        ],
        max_tokens: 4000,
        temperature: 0.1,
      });

      return {
        generatedAnswer:
          response.choices[0].message.content?.trim() || 'Unable to generate response.',
        tokensUsed: response.usage?.total_tokens || 0,
      };
    } catch (error: any) {
      if (error.status === 429) {
        console.warn('🔄 Rate limited. Waiting...');
        await sleep(5000);
        return this.generateAnswerFromResults(userQuery, searchResults);
      }
      console.warn('Answer generation failed:', error.message);
      return {
        generatedAnswer: 'Sorry, I encountered an error while generating the response.',
        tokensUsed: 0,
      };
    }
  }

  async generateCleanUserPrompt(
    query: string,
    chatHistory: ChatHistoryRow[] = []
  ): Promise<{ generatedUserPrompt: string; tokensUsed: number }> {
    await this.rateLimit();

    try {
      const response = await this.client.chat.completions.create({
        model: GENERATIVE_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are a query optimizer for document search. Clean and expand user queries to improve semantic search results.

Rules:
1. Fix typos and grammar
2. Expand abbreviations 
3. Add related keywords/synonyms
4. Keep queries concise
5. Remove conversational fluff
6. Return only the optimized query text
7. Do not add any explanations or additional text
8. Maintain the original intent of the query
9. Answer in the same language as the original query`,
          },
          {
            role: 'user',
            content: query,
          },
          ...chatHistory,
        ],
        max_tokens: 100,
        temperature: 0.1,
      });

      return {
        generatedUserPrompt: response.choices[0].message.content?.trim() || query,
        tokensUsed: response.usage?.total_tokens || 0,
      };
    } catch (error: any) {
      if (error.status === 429) {
        console.warn('🔄 Rate limited. Waiting...');
        await sleep(5000);
        return this.generateCleanUserPrompt(query);
      }
      console.warn('Query cleaning failed, using original:', error.message);
      return { generatedUserPrompt: query, tokensUsed: 0 }; // Fallback to original query
    }
  }
}

export const openAIClient = new OpenAIClient(1000); // 2 seconds between calls
