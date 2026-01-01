import postgres from 'postgres';
import { EMBEDDING_MODEL, GENERATIVE_MODEL } from '../openai';
import { ChatHistoryRow } from '../types';

export class PostgresService {
  private client;
  constructor(config?: {
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
  }) {
    const cfg = {
      host: config?.host || process.env.POSTGRES_HOST || 'localhost',
      port: config?.port || parseInt(process.env.POSTGRES_PORT || '5432'),
      database: config?.database || process.env.POSTGRES_DB || 'jobs_db',
      username: config?.username || process.env.POSTGRES_USER || 'postgres',
      password: config?.password || process.env.POSTGRES_PASSWORD || 'password',
    };
    this.client = postgres(cfg);
  }

  async setupPostgress() {
    console.log('🔧 Setting up PostgreSQL schema...');
    // Create chat history table
    await this.client`
      CREATE TABLE IF NOT EXISTS chat_history (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255),
        role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        emb_tokens INTEGER DEFAULT 0,
        gen_tokens INTEGER DEFAULT 0,
        emb_model VARCHAR(100),
        gen_model VARCHAR(100),
        answer_val VARCHAR(10) CHECK (answer_val IN ('good', 'bad') OR answer_val IS NULL),
        relative_docs JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    await this.client`CREATE INDEX IF NOT EXISTS idx_session_id ON chat_history(session_id)`;
    await this.client`CREATE INDEX IF NOT EXISTS idx_role ON chat_history(role)`;
    await this.client`CREATE INDEX IF NOT EXISTS idx_created_at ON chat_history(created_at)`;

    console.log('✅ PostgreSQL schema ready');
  }

  async storeChatMessage({
    sessionId,
    role,
    content,
    embTokens,
    genTokens,
    embModel,
    genModel,
    answerVal,
    relativeDocs,
  }: {
    sessionId?: string;
    role: 'user' | 'assistant';
    content: string;
    embTokens?: number;
    genTokens?: number;
    embModel?: string;
    genModel?: string;
    answerVal?: 'good' | 'bad' | null;
    relativeDocs?: Array<{
      name: string;
      url: string;
      score: number;
      docHash: string;
    }> | null;
  }) {
    try {
      await this.client`
        INSERT INTO chat_history (
          session_id,
          role,
          content,
          emb_tokens,
          gen_tokens,
          emb_model,
          gen_model,
          answer_val,
          relative_docs
        ) VALUES (
          ${sessionId || null},
          ${role},
          ${content},
          ${embTokens || 0},
          ${genTokens || 0},
          ${embModel || null},
          ${genModel || null},
          ${answerVal || null},
          ${relativeDocs ? JSON.stringify(relativeDocs) : null}
        )
      `;
      console.log(`💾 ${role} message stored in PostgreSQL`);
    } catch (error) {
      console.error('❌ Error storing chat message:', error);
    }
  }

  async storeChatConversation({
    sessionId,
    userMessage,
    agentMessage,
    embPromptTokens,
    genPromptTokens,
    genAnswerTokens,
    embModel,
    genModel,
    relativeDocs,
  }: {
    sessionId?: string;
    userMessage: string;
    agentMessage: string;
    embPromptTokens?: number;
    genPromptTokens?: number;
    genAnswerTokens?: number;
    embModel?: string;
    genModel?: string;
    relativeDocs?: Array<{
      name: string;
      url: string;
      score: number;
      docHash: string;
    }>;
  }) {
    try {
      // Generate session ID if not provided
      const finalSessionId =
        sessionId || `${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

      // Store user message
      await this.storeChatMessage({
        sessionId: finalSessionId,
        role: 'user',
        content: userMessage,
        embTokens: embPromptTokens || 0,
        genTokens: genPromptTokens || 0,
        embModel: embModel || EMBEDDING_MODEL,
        genModel: embModel || EMBEDDING_MODEL,
        relativeDocs: null,
      });

      // Store agent message
      await this.storeChatMessage({
        sessionId: finalSessionId,
        role: 'assistant',
        content: agentMessage,
        embTokens: 0,
        genTokens: genAnswerTokens || 0,
        embModel: genModel || GENERATIVE_MODEL,
        genModel: genModel || GENERATIVE_MODEL,
        relativeDocs,
      });

      console.log('💾 Complete conversation stored in PostgreSQL');
      return finalSessionId;
    } catch (error) {
      console.error('❌ Error storing conversation:', error);
      return sessionId;
    }
  }

  async updateAnswerValidation(messageId: number, answerVal: 'good' | 'bad') {
    try {
      await this.client`
        UPDATE chat_history 
        SET answer_val = ${answerVal}
        WHERE id = ${messageId} AND role = 'assistant'
      `;
      console.log(`✅ Answer validation updated for message ${messageId}`);
    } catch (error) {
      console.error('❌ Error updating answer validation:', error);
    }
  }

  async getChatHistory(sessionId?: string, limit: number = 50) {
    try {
      if (sessionId) {
        return await this.client<ChatHistoryRow[]>`
          SELECT * FROM chat_history 
          WHERE session_id = ${sessionId}
          ORDER BY created_at DESC 
          LIMIT ${limit}
        `;
      } else {
        return [] as ChatHistoryRow[];
      }
    } catch (error) {
      console.error('❌ Error retrieving chat history:', error);
      return [] as ChatHistoryRow[];
    }
  }

  disconnect() {
    this.client.end();
    console.log('🔌 PostgreSQL connection closed');
  }
}

export const postgresService = new PostgresService();
