import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents';
import { EMBEDDING_MODEL } from '../openai';
/**
 * Create 3 levels of chunk embeddings: whole PDF, per page, and per paragraph.
 * @param fullMarkdown The full markdown string of the PDF
 * @param pagesMarkdown Array of per-page markdown strings
 * @param fileName filename of the file
 * @param filePath path of the file
 * @param fileFormat format of the file
 * @param documentHash unique hash of the document
 * @param paragraphChucking whether to create paragraph level chunks
 * @returns Array of Document objects for each level
 */
export function createMultiLevelChunks(
  fullMarkdown: string,
  pagesMarkdown: string[],
  fileName: string,
  filePath: string,
  fileFormat: string,
  documentHash: string,
  paragraphChucking: boolean = true
): Document[] {
  const documents: Document[] = [];

  // 1. Whole PDF
  const documentChunkId = `${documentHash}`;
  const fullDocument = new Document({
    pageContent: fullMarkdown,
    metadata: {
      fileName,
      filePath,
      fileFormat,
      documentHash,
      chunkLevel: 'document',
      pageRange: [1, pagesMarkdown.length],
      chunkId: documentChunkId,
      parentIds: [], // Root document has no parents
      embeddingModel: EMBEDDING_MODEL,
    },
  });
  documents.push(fullDocument);

  // 2. Per page
  pagesMarkdown.forEach((page, i) => {
    const pageChunkId = `${documentHash}-${i + 1}`;
    const pageDocument = new Document({
      pageContent: page,
      metadata: {
        fileName,
        filePath,
        fileFormat,
        documentHash,
        chunkLevel: 'page',
        pageNumber: i + 1,
        chunkId: pageChunkId,
        parentIds: [documentChunkId], // References the actual document chunk ID
        embeddingModel: EMBEDDING_MODEL,
      },
    });
    documents.push(pageDocument);
  });

  // 3. Per paragraph
  if (paragraphChucking) {
    const MIN_PARAGRAPH_LENGTH = 100; // Adjust as needed

    pagesMarkdown.forEach((page, pgi) => {
      const rawParagraphs = page
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      const mergedParagraphs: string[] = [];
      let buffer = '';

      for (let j = 0; j < rawParagraphs.length; j++) {
        const para = rawParagraphs[j];

        // If it's a header, merge with the next paragraph
        if (/^#+\s/.test(para)) {
          buffer = para;
          // If next exists and is not a header, merge
          if (rawParagraphs[j + 1] && !/^#+\s/.test(rawParagraphs[j + 1])) {
            buffer += '\n\n' + rawParagraphs[j + 1];
            j++; // Skip next, as it's merged
          }
          mergedParagraphs.push(buffer);
          buffer = '';
        } else if (para.length < MIN_PARAGRAPH_LENGTH) {
          // Merge small paragraphs with buffer
          buffer = buffer ? buffer + '\n\n' + para : para;
          // If next is large or last, push buffer
          if (
            !rawParagraphs[j + 1] ||
            rawParagraphs[j + 1].length >= MIN_PARAGRAPH_LENGTH ||
            /^#+\s/.test(rawParagraphs[j + 1])
          ) {
            mergedParagraphs.push(buffer);
            buffer = '';
          }
        } else {
          // Normal paragraph, just push
          if (buffer) {
            mergedParagraphs.push(buffer);
            buffer = '';
          }
          mergedParagraphs.push(para);
        }
      }
      if (buffer) mergedParagraphs.push(buffer);

      mergedParagraphs.forEach((para, pri) => {
        const pageChunkId = `${documentHash}-${pgi + 1}`;
        const paragraphChunkId = `${pageChunkId}-${pri + 1}`;

        documents.push(
          new Document({
            pageContent: para,
            metadata: {
              fileName,
              filePath,
              fileFormat,
              documentHash,
              chunkLevel: 'paragraph',
              pageNumber: pgi + 1,
              paragraphIndex: pri + 1,
              chunkId: paragraphChunkId,
              parentIds: [pageChunkId], // References the actual page chunk ID
              embeddingModel: EMBEDDING_MODEL,
            },
          })
        );
      });
    });
  }

  return documents;
}

/**
 * Processes markdown text into semantically meaningful Document chunks for embedding and retrieval.
 *
 * - Splits markdown by headers, paragraphs, sentences, etc. using RecursiveCharacterTextSplitter
 * - Adds metadata for page number, article number, lists, and law references
 * - Returns Document objects ready for embedding or search
 *
 * @param markdown The markdown string to process
 * @returns Array of Document objects with metadata
 */
export async function processMarkdownForEmbeddings(markdown: string) {
  // 1. Split by headers (semantic boundaries)
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000, // Optimal for most embedding models
    chunkOverlap: 200, // Context continuity
    separators: [
      '\n## ', // Page breaks
      '\n### ', // Articles/Sections
      '\n#### ', // Sub-sections
      '\n\n', // Paragraphs
      '\n', // Lines
      '. ', // Sentences
      ' ', // Words
      '', // Characters
    ],
  });

  const docs = await splitter.createDocuments([markdown]);

  console.log(`📦 Created ${docs.length} chunks`);

  // 2. Add metadata for better retrieval
  const enrichedDocs = docs.map((doc, i) => {
    // Extract page number from markdown header
    const pageMatch = doc.pageContent.match(/## 📄 Σελίδα (\d+)/);
    const pageNum = pageMatch ? parseInt(pageMatch[1]) : null;

    // Extract article number
    const articleMatch = doc.pageContent.match(/### Άρθρο (\d+)/);
    const articleNum = articleMatch ? parseInt(articleMatch[1]) : null;

    return new Document({
      pageContent: doc.pageContent,
      metadata: {
        chunkId: i,
        pageNumber: pageNum,
        articleNumber: articleNum,
        hasLists: /^[-*] /m.test(doc.pageContent),
        hasLawReferences: /`(π\.δ\.|ν\.)\s*\d+\/\d{4}`/.test(doc.pageContent),
      },
    });
  });

  return enrichedDocs;
}

// /**
//  * Split PDF pages into chunks, skipping the last page before chunking.
//  * @param pages Array of page strings (from PDF)
//  */
// export function splitTextIntoChunksFromPages(pages: string[]) {
//   const splitter = new RecursiveCharacterTextSplitter({
//     chunkSize: 1000,
//     chunkOverlap: 200,
//   });
//   let chunkIndex = 0;
//   const chunks: Chunk[] = [];
//   // Skip the last page
//   for (let i = 0; i < pages.length - 1; i++) {
//     const page = pages[i];
//     const docs = splitter.splitText(page);
//     for (const chunk of docs) {
//       chunks.push({
//         text: chunk,
//         metadata: {
//           pageNum: i + 1,
//           chunkIndex: chunkIndex++,
//           type: 'paragraph',
//         },
//       });
//     }
//   }
//   return chunks;
// }

// /**
//  * Creates hybrid Document objects for embedding: both markdown and plain text (with stripped markdown elements as metadata).
//  *
//  * - Splits markdown into semantic chunks using RecursiveCharacterTextSplitter
//  * - For each chunk, strips markdown for embedding and attaches original markdown and removed elements as metadata
//  *
//  * Useful for pipelines that want to embed plain text but retain markdown structure for display or analysis.
//  *
//  * @param markdown The markdown string to process
//  * @returns Array of Document objects with both plain and markdown content/metadata
//  */
// export async function createHybridDocuments(markdown: string) {
//   const splitter = new RecursiveCharacterTextSplitter({
//     chunkSize: 1000,
//     chunkOverlap: 200,
//     separators: ['\n## ', '\n### ', '\n#### ', '\n\n', '\n', '. ', ' '],
//   });

//   const chunks = await splitter.createDocuments([markdown]);

//   console.log(`📦 Chunks ${chunks} `);

//   return chunks.map((chunk, i) => {
//     const markdownContent = chunk.pageContent;
//     const plainContent = stripMarkdownForEmbedding(markdownContent);

//     return new Document({
//       pageContent: plainContent.text, // For embedding
//       metadata: {
//         ...chunk.metadata,
//         chunkId: i,
//         markdownContent: markdownContent, // For display
//         strippedMetadata: plainContent.metadata, // Metadata about removed markdown elements
//       },
//     });
//   });
// }
