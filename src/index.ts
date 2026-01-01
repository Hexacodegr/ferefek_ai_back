// Install: bun add pdf-parse postgres @qdrant/js-client-rest openai
import { readdirSync } from 'fs';
import { qdrantService } from './db/qdrant';
import { pdfToMarkdown_FEK } from './pdf/pdf';
import { postgresService } from './db/postgress';
import { createMultiLevelChunks, generateEmbeddings } from './pdf/chucking';
import { MAX_TOKENS_PER_EMBEDDING, openAIClient } from './openai';
import { getDocumentHashId } from './pdf/utils';

const fileFormat = '.pdf';

async function main() {
  console.log('📄 FEK RAG System (PostgreSQL + Qdrant)\n');

  try {
    // Setup
    await postgresService.setupPostgress();
    await qdrantService.setupQdrant();

    // Process all PDFs in ./dataset folder
    const datasetDir = './dataset';
    const datasetFiles = readdirSync(datasetDir).filter((f) => f.endsWith(fileFormat));
    if (datasetFiles.length === 0) {
      console.log('No PDF files found in ./dataset');
      return;
    }

    for (const pdfFile of datasetFiles) {
      console.log(`\n📖 Reading PDF: ${pdfFile}`);
      const filePath = `${datasetDir}/${pdfFile}`;
      // 1. Split the markdown into pages (assuming pages are separated by "---")
      const text = await pdfToMarkdown_FEK(filePath);
      const documentHash = getDocumentHashId(filePath);

      console.log('=============================== CONTEXT ===============================');
      console.log(text.fullMarkdown);
      console.log(`Extracted ${text.fullMarkdown.length} characters from PDF`);

      // 2. Create multi-level chunks: whole PDF, per page, per paragraph
      const multiLevelChunks = createMultiLevelChunks(
        text.fullMarkdown,
        text.pageMarkdowns,
        pdfFile,
        filePath,
        fileFormat,
        false
      );

      // console.log(`Generated ${JSON.stringify(multiLevelChunks, null, 2)} chunks for embedding`);

      const safeChunks = multiLevelChunks.filter(
        (chunk) => chunk.pageContent.length < MAX_TOKENS_PER_EMBEDDING * 2 // ~2 chars per token
      );
      if (safeChunks.length !== multiLevelChunks.length) {
        console.warn('⚠️ Some chunks were too large and were skipped!');
      } else {
        console.log('👌 All chunks are within the token limit.');
      }
      // 3. Generate embeddings for all chunks
      const embeddings: { embedding: number[]; metadata: any; rawText: string }[] = [];
      for (const chunk of safeChunks) {
        // const embedding = [0, 5, 10];

        const embedding = await openAIClient.createEmbedding(chunk.pageContent);

        console.log(
          `Generated embedding of length ${embedding.embedding.length} for chunk ${chunk.metadata.chunkId}`
        );

        // (chunk as any).embedding = embedding; // Attach embedding to chunk
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
      console.log(JSON.stringify(embeddings, null, 2));
      // 4. Store in Qdrant
      await qdrantService.storeChunksWithEmbeddings(embeddings);
    }

    // Store
    // await postgresService.storeInPostgres(allJobs);
    // await qdrantService.storeInQdrant(allJobs);

    //! Example queries
    // console.log('\n=== EXAMPLE SEARCHES ===');

    // const results1 = await qdrantService.searchJobs('senior software engineer', 5);
    // console.log('\n1. Senior Software Engineer:');
    // function isJobListing(obj: any): obj is JobListing {
    //   return obj && typeof obj.title === 'string' && typeof obj.score === 'number';
    // }

    // results1.forEach((r, i) => {
    //   if (isJobListing(r) && r.department) {
    //     console.log(`   ${i + 1}. ${r.title} (${r.department}) - Score: ${r.score.toFixed(3)}`);
    //   } else {
    //     console.log(`   ${i + 1}. [No job details found] - Score: ${r.score?.toFixed(3)}`);
    //   }
    // });

    // const results2 = await qdrantService.searchJobs('project manager', { location: 'Remote' }, 5);
    // console.log('\n2. Project Manager (Remote):');
    // results2.forEach((r, i) => {
    //   if (isJobListing(r) && r.location) {
    //     console.log(`   ${i + 1}. ${r.title} (${r.location}) - Score: ${r.score.toFixed(3)}`);
    //   } else {
    //     console.log(`   ${i + 1}. [No job details found] - Score: ${r.score?.toFixed(3)}`);
    //   }
    // });

    console.log('\n✅ Complete!');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await postgresService.disconnect();
  }
}

// Run: bun run script.ts
main();
