import { ANSWER_MODEL } from '../openai';
import { Chunk, JobListing } from '../types';

/**
 * Extract job listings from text chunks using an LLM (OpenAI).
 * @param chunks Array of text chunks (from splitTextIntoChunks)
 * @param sourceFile The source file name
 * @param openai An instance of OpenAIClient
 * @returns Array of JobListing objects
 */
export async function extractJobListingsWithLLM(
  chunks: Chunk[],
  sourceFile: string,
  openai: OpenAIClient
): Promise<JobListing[]> {
  // Concatenate all chunk texts for context (or use batching for large files)
  const text = chunks.map((c) => c.text).join('\n\n');
  const prompt = `Extract all job listings from the following text. For each job, return a JSON object with the following fields: id, title, department, location, salary, description, requirements (as an array), deadline, raw_text, extracted_at (ISO string), source_file, page_numbers (array of numbers). Return an array of such objects.\n\nText:\n${text}`;

  const response = await openai.completion({
    prompt,
    max_tokens: 2048,
    temperature: 0.2,
    stop: null,
    model: ANSWER_MODEL,
    // You may need to adjust model/params as needed
  });

  // Try to parse the response as JSON
  try {
    const jobs = JSON.parse(response.trim());
    // Optionally, add/override fields like source_file, extracted_at, etc.
    return jobs.map((job: any, i: number) => ({
      ...job,
      id: job.id || `job_${Date.now()}_${i}`,
      source_file: sourceFile,
      extracted_at: job.extracted_at || new Date().toISOString(),
    }));
  } catch (e) {
    console.error('Failed to parse LLM job extraction response:', e, response);
    return [];
  }
}
