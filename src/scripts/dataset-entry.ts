// Install: bun add pdf-parse postgres @qdrant/js-client-rest openai
import { readdirSync } from 'fs';
import { qdrantService } from '../db/qdrant';
import { pdfToMarkdown_FEK } from '../pdf/pdf';
import { postgresService } from '../db/postgress';
import { createMultiLevelChunks } from '../pdf/chucking';
import { MAX_TOKENS_PER_EMBEDDING, openAIClient } from '../openai';
import { getDocumentHashId } from '../pdf/utils';

const fileFormat = '.pdf';

async function setupDatabases() {
  await postgresService.setupPostgress();
  await qdrantService.setupQdrant();

  // Clear existing data to avoid document linking issues
  console.log('🧹 Clearing existing embeddings...');
  await qdrantService.clearCollection();
}

function getPdfFiles(datasetDir: string, fileFormat: string): string[] {
  return readdirSync(datasetDir).filter((f) => f.endsWith(fileFormat));
}

async function processBatchDir(datasetDir: string, fileFormat: string) {
  const datasetFiles = getPdfFiles(datasetDir, fileFormat);
  if (datasetFiles.length === 0) {
    console.log('No PDF files found in ./dataset');
    return;
  }
  for (const pdfFile of datasetFiles) {
    await processSingleFile(pdfFile, datasetDir, fileFormat);
  }
}

async function processSingleFile(pdfFile: string, datasetDir: string, fileFormat: string) {
  console.log(`\n📖 Reading PDF: ${pdfFile}`);
  const filePath = `${datasetDir}/${pdfFile}`;

  try {
    const text = await pdfToMarkdown_FEK(filePath);
    const documentHash = getDocumentHashId(filePath);

    console.log('=============================== CONTEXT ===============================');
    console.log(text.fullMarkdown);
    console.log(`Extracted ${text.fullMarkdown.length} characters from PDF`);

    const multiLevelChunks = createMultiLevelChunks(
      text.fullMarkdown,
      text.pageMarkdowns,
      pdfFile,
      filePath,
      fileFormat,
      documentHash
    );

    const safeChunks = multiLevelChunks.filter(
      (chunk) => chunk.pageContent.length < MAX_TOKENS_PER_EMBEDDING * 2
    );
    if (safeChunks.length !== multiLevelChunks.length) {
      console.warn('⚠️ Some chunks were too large and were skipped!');
    } else {
      console.log('👌 All chunks are within the token limit.');
    }

    const embeddings = await generateEmbeddingsForChunks(safeChunks, documentHash);
    console.log(JSON.stringify(embeddings, null, 2));
    await storeEmbeddings(embeddings);
  } catch (error) {
    console.error(`❌ Error processing file ${pdfFile}:`, error);
  }
}

async function generateEmbeddingsForChunks(safeChunks: any[], documentHash: string) {
  const embeddings: { embedding: number[]; metadata: any; rawText: string }[] = [];
  for (const chunk of safeChunks) {
    const embedding = await openAIClient.createEmbedding(chunk.pageContent);
    console.log(
      `Generated embedding for
chunk id: ${chunk.metadata.chunkId}
length: ${embedding.embedding.length}
chunk level: ${chunk.metadata.chunkLevel}
page number: ${chunk.metadata.pageNumber}
tokens used: ${embedding.tokensUsed}
document hash: ${documentHash}\n`
    );
    embeddings.push({
      embedding: embedding.embedding,
      metadata: {
        ...chunk.metadata,
        tokensUsed: embedding.tokensUsed,
        documentHash,
      },
      rawText: chunk.pageContent,
    });
  }
  return embeddings;
}

async function storeEmbeddings(embeddings: any[]) {
  await qdrantService.storeChunksWithEmbeddings(embeddings);
}

async function main() {
  console.log('📄 FEK RAG System (PostgreSQL + Qdrant)\n');
  try {
    await setupDatabases();
    await processBatchDir('./dataset', fileFormat);
    console.log('\n✅ Complete!');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await postgresService.disconnect();
  }
}

main();
