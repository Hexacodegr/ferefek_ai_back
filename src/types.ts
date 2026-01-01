export interface JobListing {
  id: string;
  title: string;
  department: string;
  location: string;
  salary?: string;
  description: string;
  requirements: string[];
  deadline?: string;
  raw_text: string;
  extracted_at: Date;
  source_file: string;
  page_numbers: number[];
}

export interface ChunkMetadata {
  pageNum: number;
  chunkIndex: number;
  type: "title" | "paragraph" | "section";
}

export interface Chunk {
  text: string;
  metadata: ChunkMetadata;
}
