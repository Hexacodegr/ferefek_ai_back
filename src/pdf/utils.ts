import { createHash } from 'crypto';
import { readFileSync } from 'fs';

/**
 * Removes hyphenation artifacts from OCR or PDF-extracted text, especially for Greek documents.
 *
 * - Removes soft hyphens (\u00AD)
 * - Joins words split by hyphens at line breaks (e.g., "Νομοθε-\nσία" → "Νομοθεσία")
 *
 * This is critical for restoring word integrity before further text processing, chunking, or embedding.
 *
 * @param text The input text to clean
 * @returns The text with hyphenation artifacts removed
 */
export function removeHyphenation(text: string): string {
  // Remove soft hyphens
  text = text.replace(/\u00AD/g, '');

  // Fix hyphenated words at line breaks (CRITICAL for Greek)
  // This handles: "Νομοθε-\nσία" → "Νομοθεσία"
  text = text.replace(
    /([α-ωά-ώΑ-ΩΆ-ΏϊϋΪΫa-zA-Z]+)-\s*[\r\n]+\s*([α-ωά-ώΑ-ΩΆ-ΏϊϋΪΫa-zA-Z]+)/g,
    '$1$2'
  );

  return text;
}

/**
 * Fixes spacing and punctuation issues in Greek (and general) text for cleaner downstream processing.
 *
 * - Collapses multiple spaces/tabs into a single space
 * - Removes spaces before punctuation, adds space after punctuation
 * - Normalizes spacing around parentheses and quotes
 * - Fixes common Greek typography issues (e.g., lowercase followed by uppercase)
 *
 * This is useful for cleaning up OCR or PDF-extracted text before further chunking, embedding, or LLM input.
 *
 * @param text The input text to fix
 * @returns The text with improved spacing and punctuation
 */
export function fixSpacing(text: string): string {
  // Fix multiple spaces
  text = text.replace(/[ \t]+/g, ' ');

  // Fix spacing around punctuation
  text = text.replace(/\s+([,;:.!?·])/g, '$1'); // Remove space BEFORE punctuation
  text = text.replace(/([,;:.!?·])([α-ωά-ώΑ-ΩΆ-Ώa-zA-Z])/g, '$1 $2'); // Add space AFTER punctuation

  // Fix spacing around parentheses
  text = text.replace(/\s+\)/g, ')');
  text = text.replace(/\(\s+/g, '(');

  // Fix spacing around quotes
  text = text.replace(/\s+"/g, ' "');
  text = text.replace(/"\s+/g, '" ');

  // Fix common Greek typography issues
  text = text.replace(/([α-ωά-ώ])([Α-ΩΆ-Ώ])/g, '$1 $2'); // Space between lowercase-uppercase

  return text;
}

/**
 * Strips markdown and returns both the plain text and metadata about removed elements.
 *
 * @param markdown The markdown string to process
 * @returns An object with the stripped text and metadata about removed markdown elements
 */
export function stripMarkdownForEmbedding(markdown: string): {
  text: string;
  metadata: {
    headers: string[];
    bold: string[];
    italic: string[];
    code: string[];
    lists: string[];
    numbered: string[];
  };
} {
  let text = markdown;
  const metadata = {
    headers: [],
    bold: [],
    italic: [],
    code: [],
    lists: [],
    numbered: [],
  };

  // Remove headers but keep text
  text = text.replace(/^#{1,6}\s+(.+)$/gm, (m, p1) => {
    metadata.headers.push(p1);
    return p1;
  });

  // Remove bold but keep text
  text = text.replace(/\*\*([^*]+)\*\*/g, (m, p1) => {
    metadata.bold.push(p1);
    return p1;
  });

  // Remove italic but keep text
  text = text.replace(/\*([^*]+)\*/g, (m, p1) => {
    metadata.italic.push(p1);
    return p1;
  });

  // Remove code blocks but keep text
  text = text.replace(/`([^`]+)`/g, (m, p1) => {
    metadata.code.push(p1);
    return p1;
  });

  // Remove list markers but keep text
  text = text.replace(/^[-*]\s+(.+)$/gm, (m, p1) => {
    metadata.lists.push(p1);
    return p1;
  });

  // Remove numbered list markers but keep text
  text = text.replace(/^\d+\.\s+(.+)$/gm, (m, p1) => {
    metadata.numbered.push(p1);
    return p1;
  });
  console.log('Removed markdown elements:', metadata);
  return { text, metadata };
}

/**
 * Adds markdown structure to Greek legal/official documents for better parsing and chunking.
 *
 * - Converts article, chapter, section, and list headers to markdown headers (###)
 * - Formats numbered and Greek letter lists for markdown compatibility
 * - Ensures consistent spacing and structure for downstream processing
 *
 * This is especially useful for preparing Greek legal texts for semantic chunking, embedding, or LLM input.
 *
 * @param text The input text to structure
 * @returns The text with markdown structure added
 */
export function addMarkdownStructure(text: string): string {
  // Article headers: "Άρθρο 1" → "### Άρθρο 1"
  text = text.replace(/^(Άρθρο \d+[Α-Ω]*\.?)\s*/gm, '\n### $1\n\n');

  // Chapter headers
  text = text.replace(/^(Κεφάλαιο [Α-ΩA-Z]+['΄]?\.?.*)\s*$/gm, '\n### $1\n\n');

  // Section headers (common patterns)
  text = text.replace(/^(ΠΑΡΑΡΤΗΜΑ [Α-Ω]+)\s*$/gm, '\n### $1\n\n');
  text = text.replace(/^(ΤΜΗΜΑ [Α-Ω]+)\s*$/gm, '\n### $1\n\n');

  // Numbered lists - ensure proper spacing
  text = text.replace(/^\s*(\d+)\.\s+/gm, '\n$1. ');

  // Greek letter lists - consistent formatting
  text = text.replace(/^\s*([α-ω])\)\s+/gm, '\n- **$1)** ');
  text = text.replace(/^\s*([α-ω])\.\s+/gm, '\n- **$1.** ');

  // Double Greek letters (sub-items)
  text = text.replace(/^\s*([α-ω]{2})\)\s+/gm, '\n  - **$1)** ');
  text = text.replace(/^\s*([α-ω]{2})\.\s+/gm, '\n  - **$1.** ');

  // Triple Greek letters (sub-sub-items)
  text = text.replace(/^\s*([α-ω]{3})\)\s+/gm, '\n    - **$1)** ');

  return text;
}

/**
 * Normalizes line breaks and whitespace in a text block for consistent downstream processing.
 *
 * - Converts all line endings to \n (handles Windows, Mac, Unix formats)
 * - Removes trailing spaces at the end of lines
 * - Joins lines that are broken in the middle of sentences (if the next line doesn't start with a capital, number, or bullet)
 * - Preserves paragraph breaks (2+ newlines)
 *
 * This is especially useful for cleaning up OCR or PDF-extracted text before further chunking or NLP processing.
 *
 * @param text The input text to normalize
 * @returns The normalized text with consistent line breaks and spacing
 */
export function normalizeLineBreaks(text: string): string {
  // Convert all line endings to \n
  text = text.replace(/\r\n/g, '\n');
  text = text.replace(/\r/g, '\n');

  // Remove trailing spaces on lines
  text = text.replace(/[ \t]+\n/g, '\n');

  // Fix sentences broken across lines (join if next line doesn't start with capital/number/bullet)
  text = text.replace(/([α-ωά-ώ,;])\n([α-ωά-ώ])/g, '$1 $2');

  // Preserve paragraph breaks (2+ newlines)
  text = text.replace(/\n{3,}/g, '\n\n');

  return text;
}

/**
 * Formats special legal/document elements for improved visibility and downstream processing.
 *
 * - Wraps law references (π.δ., ν., ν.δ.) in code blocks
 * - Formats FEK (Government Gazette) references
 * - Bolds dates and monetary amounts
 * - Adds markdown headers for decision and section markers
 *
 * This is useful for highlighting and structuring key legal elements in Greek documents before chunking or LLM input.
 *
 * @param text The input text to format
 * @returns The text with special elements formatted
 */
export function formatSpecialElements(text: string): string {
  // Law references → Code blocks for visibility
  text = text.replace(/(π\.δ\.\s*\d+\/\d{4})/gi, '`$1`');
  text = text.replace(/(ν\.\s*\d+\/\d{4})/gi, '`$1`');
  text = text.replace(/(ν\.δ\.\s*\d+\/\d{4})/gi, '`$1`');

  // FEK (Government Gazette) references
  text = text.replace(/\(([ΑΒΓΔαβγδ])['΄']\s*(\d+)\)/g, "`(ΦΕΚ $1' $2)`");

  // Dates → Bold
  text = text.replace(/\b(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{4})\b/g, '**$1**');

  // Decision markers
  text = text.replace(/^(αποφασίζουμε:?)\s*$/gim, '\n#### 📋 Αποφασίζουμε:\n\n');
  text = text.replace(/^(ΑΠΟΦΑΣΙΖΟΥΜΕ:?)\s*$/gm, '\n#### 📋 ΑΠΟΦΑΣΙΖΟΥΜΕ:\n\n');

  // Common document sections
  text = text.replace(/^(Έχοντας υπόψη:?)\s*$/gim, '\n#### 📌 Έχοντας υπόψη:\n\n');

  // Monetary amounts
  text = text.replace(/(\d+(?:\.\d{3})*,\d{2}\s*€)/g, '**$1**');

  return text;
}

/**
 * Performs a final pass to ensure formatting and structural consistency across the entire document.
 *
 * - Ensures consistent spacing before/after markdown headers
 * - Cleans up list formatting and excessive blank lines
 * - Ensures paragraphs are separated after sentence-ending punctuation
 * - Trims spaces at the start/end of lines and the whole document
 *
 * This is useful as the last step after all other text normalization, markdown, and formatting functions.
 *
 * @param text The input text to finalize
 * @returns The fully normalized and consistently formatted text
 */
export function ensureConsistency(text: string): string {
  // Final pass to ensure consistency across entire document

  // Ensure consistent spacing after headers
  text = text.replace(/(#{2,4}[^\n]+)\n([^\n])/g, '$1\n\n$2');

  // Ensure consistent spacing before headers
  text = text.replace(/([^\n])\n(#{2,4})/g, '$1\n\n$2');

  // Clean up list formatting
  text = text.replace(/\n{2,}(-|\d+\.)/g, '\n\n$1'); // Max 1 blank line before list
  text = text.replace(/(-|\d+\.[^\n]+)\n{3,}/g, '$1\n\n'); // Max 1 blank line after list item

  // Ensure paragraphs are separated
  text = text.replace(/([.!?;])\n([Α-ΩΆ-Ώ])/g, '$1\n\n$2'); // Sentence end + capital letter

  // Remove excessive blank lines (max 2)
  text = text.replace(/\n{4,}/g, '\n\n');

  // Clean up spaces at start/end of lines
  text = text.replace(/^[ \t]+/gm, '');
  text = text.replace(/[ \t]+$/gm, '');

  // Final trim
  text = text.trim();

  return text;
}

/**
 * Enhances raw page text into structured markdown for Greek legal/official documents.
 *
 * - Fixes hyphenation, spacing, and line breaks
 * - Adds a markdown page header
 * - Applies markdown structure and formats special legal/document elements
 *
 * This is useful for converting OCR/PDF-extracted text into a clean, chunkable markdown format for downstream processing.
 *
 * @param text The raw page text to enhance
 * @param pageNum The page number (for header)
 * @returns The enhanced markdown string for the page
 */
export function enhanceToMarkdown(text: string, pageNum: number): string {
  let markdown = '';
  // Step 1: Fix hyphenation FIRST (critical for Greek text)
  text = removeHyphenation(text);

  // Step 2: Fix common spacing issues
  text = fixSpacing(text);

  // Step 3: Normalize line breaks
  text = normalizeLineBreaks(text);

  //! // Step 4: Add page header
  // markdown = `## 📄 Σελίδα ${pageNum}\n\n`;

  // Step 5: Structure conversion
  text = addMarkdownStructure(text);

  // Step 6: Format special elements
  text = formatSpecialElements(text);

  markdown += text.trim();

  return markdown;
}

export function getDocumentHashId(filePath: string): string {
  const docHashId = createHash('md5').update(readFileSync(filePath)).digest('hex');
  return docHashId;
}
