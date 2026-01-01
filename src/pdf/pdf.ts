import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { enhanceToMarkdown, ensureConsistency } from './utils';

/**
 * Converts a PDF file to Markdown and returns both the entire Markdown and an array of per-page Markdown.
 *
 * Also removes the last page from processing (contains non-content FEK last page template).
 *
 * @param {string} filePath - The path to the PDF file to convert.
 * @returns {Promise<{ fullMarkdown: string, pageMarkdowns: string[], docHashId: string }>}
 * An object containing the full Markdown, an array of per-page Markdown and a hash ID.
 */
export async function pdfToMarkdown_FEK(
  filePath: string
): Promise<{ fullMarkdown: string; pageMarkdowns: string[] }> {
  const loader = new PDFLoader(filePath, { splitPages: true });

  const docs = await loader.load();
  docs.pop(); // Remove last page

  console.log(`📄 Processing ${docs.length} pages...`);

  const pageMarkdowns = docs.map((doc, i) => enhanceToMarkdown(doc.pageContent, i + 1));
  const fullMarkdown = pageMarkdowns.join('\n\n---\n\n');
  const consistent = ensureConsistency(fullMarkdown);

  console.log(`✅ Generated ${consistent.length} chars of Markdown from PDF`);

  return {
    fullMarkdown: consistent,
    pageMarkdowns,
  };
}
