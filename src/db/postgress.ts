import postgres from 'postgres';
import { JobListing } from '../types';

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
    await this.client`
      CREATE TABLE IF NOT EXISTS job_listings (
        id VARCHAR(255) PRIMARY KEY,
        title TEXT NOT NULL,
        department VARCHAR(255),
        location VARCHAR(255),
        salary VARCHAR(255),
        description TEXT,
        requirements JSONB,
        deadline TIMESTAMP,
        raw_text TEXT,
        extracted_at TIMESTAMP DEFAULT NOW(),
        source_file VARCHAR(500),
        page_numbers INTEGER[],
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    await this.client`CREATE INDEX IF NOT EXISTS idx_department ON job_listings(department)`;
    await this.client`CREATE INDEX IF NOT EXISTS idx_location ON job_listings(location)`;
    await this.client`CREATE INDEX IF NOT EXISTS idx_deadline ON job_listings(deadline)`;
    await this.client`CREATE INDEX IF NOT EXISTS idx_extracted_at ON job_listings(extracted_at)`;
    console.log('✅ PostgreSQL schema ready');
  }

  async storeInPostgres(jobs: JobListing[]) {
    console.log(`💾 Storing ${jobs.length} jobs in PostgreSQL...`);
    for (const job of jobs) {
      await this.client`
      INSERT INTO job_listings ${this.client(
        job,
        'id',
        'title',
        'department',
        'location',
        'salary',
        'description',
        'raw_text',
        'extracted_at',
        'source_file',
        'page_numbers'
      )}
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        department = EXCLUDED.department,
        location = EXCLUDED.location,
        salary = EXCLUDED.salary,
        description = EXCLUDED.description,
        raw_text = EXCLUDED.raw_text,
        updated_at = NOW()
    `;
    }
    console.log('✅ Stored in PostgreSQL');
  }

  async disconnect() {
    await this.client.end();
  }
}

export const postgresService = new PostgresService();
