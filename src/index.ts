import { Hono } from 'hono';
import { GENERATIVE_MODEL, EMBEDDING_MODEL, openAIClient } from './openai';
import { qdrantService } from './db/qdrant';
import { postgresService } from './db/postgress';
import { ChatHistoryRow } from './types';

const app = new Hono();
const scoreThreshold = 0.4;

// Chat endpoint for similarity search
app.post('/chat', async (c) => {
  try {
    const { prompt, filter, limit, sessionId } = await c.req.json();
    if (!prompt) {
      return c.json({ error: 'Missing prompt' }, 400);
    }

    // 1. Get conversation history if sessionId is provided
    let chatHistory: ChatHistoryRow[] = [];
    if (sessionId) {
      chatHistory = await postgresService.getChatHistory(sessionId, 20); // Get last 20 messages
    }

    // Optional: Clean/expand query with LLM for better retrieval
    const cleanedPrompt = await openAIClient.generateCleanUserPrompt(prompt, chatHistory);
    console.log('Original query:', prompt);

    // 2. Embed the (cleaned) prompt
    const promptEmbedding = await openAIClient.createEmbedding(cleanedPrompt.generatedUserPrompt);
    const promptVector = promptEmbedding.embedding;

    // 3. Similarity search in Qdrant with optional filter
    const results = await qdrantService.similaritySearch(
      promptVector,
      limit || 10,
      scoreThreshold,
      filter
    );

    console.log('Similarity search results:', results);

    // 4. Generate answer based on search results and chat history
    const answer = await openAIClient.generateAnswerFromResults(prompt, results, chatHistory);

    // 5. Prepare relative documents data
    const relativeDocs = results.map((result) => ({
      name: result.payload?.documentName || 'Unknown Document',
      url: result.payload?.documentFilePath || '',
      score: result.score || 0,
      docHash: result.payload?.documentHash || '',
    }));

    const totalGenTokens = cleanedPrompt.tokensUsed + answer.tokensUsed;
    const totalEmbTokens = promptEmbedding.tokensUsed;

    // 6. Store conversation history in PostgreSQL
    const finalSessionId = await postgresService.storeChatConversation({
      sessionId,
      userMessage: prompt,
      agentMessage: answer.generatedAnswer,
      embPromptTokens: promptEmbedding.tokensUsed,
      genPromptTokens: cleanedPrompt.tokensUsed,
      genAnswerTokens: answer.tokensUsed,
      embModel: EMBEDDING_MODEL,
      genModel: GENERATIVE_MODEL,
      relativeDocs,
    });

    return c.json({
      query: prompt,
      searchQuery: cleanedPrompt,
      answer: answer.generatedAnswer,
      results: results,
      count: results.length,
      filter: filter || null,
      genTokensUsed: totalGenTokens,
      embTokensUsed: totalEmbTokens,
      relativeDocs: relativeDocs,
      sessionId: finalSessionId,
    });
  } catch (e: any) {
    return c.json({ error: e.message || e.toString() }, 500);
  }
});

// Get all entries endpoint
app.get('/all', async (c) => {
  try {
    const entries = await qdrantService.getAllEntries();
    return c.json({ entries, count: entries.length });
  } catch (e: any) {
    return c.json({ error: e.message || e.toString() }, 500);
  }
});

// Get chat history endpoint
app.get('/history', async (c) => {
  try {
    const sessionId = c.req.query('sessionId');
    const limit = parseInt(c.req.query('limit') || '50');

    const history = await postgresService.getChatHistory(sessionId, limit);
    return c.json({
      history,
      count: history.length,
      sessionId: sessionId || 'all',
    });
  } catch (e: any) {
    return c.json({ error: e.message || e.toString() }, 500);
  }
});

// Update answer validation endpoint
app.post('/feedback', async (c) => {
  try {
    const { messageId, answerVal } = await c.req.json();

    if (!messageId || !answerVal || !['good', 'bad'].includes(answerVal)) {
      return c.json({ error: 'Invalid messageId or answerVal (must be "good" or "bad")' }, 400);
    }

    await postgresService.updateAnswerValidation(messageId, answerVal);
    return c.json({
      success: true,
      message: `Answer marked as ${answerVal}`,
      messageId,
    });
  } catch (e: any) {
    return c.json({ error: e.message || e.toString() }, 500);
  }
});

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Initialize database on startup
async function initializeDatabase() {
  try {
    console.log('🔧 Initializing database...');
    await postgresService.setupPostgress();
    await qdrantService.setupQdrant();
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    process.exit(1);
  }
}

// Initialize database before starting server
initializeDatabase();

// Start the server
export default {
  port: 3000,
  fetch: app.fetch,
};

console.log('🚀 Server running on http://localhost:3000');
