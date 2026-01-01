import { Hono } from 'hono';
import { openAIClient } from './openai';
import { qdrantService } from './db/qdrant';

const app = new Hono();
const scoreThreshold = 0.65;

// Chat endpoint for similarity search
app.post('/chat', async (c) => {
  try {
    const { prompt, filter, limit } = await c.req.json();
    if (!prompt) {
      return c.json({ error: 'Missing prompt' }, 400);
    }

    // Optional: Clean/expand query with LLM for better retrieval
    const cleanedPrompt = await openAIClient.generateCleanUserPrompt(prompt);
    console.log('Original query:', prompt);

    // 1. Embed the (cleaned) prompt
    const promptEmbedding = await openAIClient.createEmbedding(cleanedPrompt.generatedUserPrompt);
    const promptVector = promptEmbedding.embedding;

    // 2. Similarity search in Qdrant with optional filter
    const results = await qdrantService.similaritySearch(
      promptVector,
      limit || 10,
      scoreThreshold,
      filter
    );

    console.log('Similarity search results:', results);

    // 3. Generate answer based on search results
    const answer = await openAIClient.generateAnswerFromResults(prompt, results);

    return c.json({
      query: prompt,
      searchQuery: cleanedPrompt,
      answer: answer,
      results: results,
      count: results.length,
      filter: filter || null,
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

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start the server
export default {
  port: 3000,
  fetch: app.fetch,
};

console.log('🚀 Server running on http://localhost:3000');
