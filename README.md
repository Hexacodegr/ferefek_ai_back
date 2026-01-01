# FEK AI - RAG Document Search System

A sophisticated Retrieval-Augmented Generation (RAG) system that processes PDF documents and provides intelligent chat-based question answering with conversation history.

## 🚀 Features

- **PDF Document Processing**: Extracts and processes PDF files into searchable chunks
- **Multi-level Chunking**: Document → Page → Paragraph hierarchy for precise information retrieval
- **Vector Search**: Semantic similarity search using OpenAI embeddings + Qdrant vector database
- **Intelligent Chat**: Context-aware responses using GPT-4 with conversation history
- **Chat History**: Persistent conversation storage with PostgreSQL
- **Answer Rating**: Users can rate AI responses (good/bad) for quality tracking
- **Session Management**: Automatic session ID generation for conversation continuity
- **REST API**: Clean API endpoints for integration

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   PDF Files     │    │   OpenAI API     │    │   PostgreSQL    │
│   (Documents)   │───>│   (Embeddings    │    │ (Chat History)  │
└─────────────────┘    │   + GPT-4)       │    └─────────────────┘
                       └──────────────────┘              │
                                │                        │
                       ┌──────────────────┐              │
                       │   Qdrant DB      │              │
                       │ (Vector Search)  │              │
                       └──────────────────┘              │
                                │                        │
                       ┌──────────────────┐              │
                       │   Hono.js API    │──────────────┘
                       │   (REST Server)  │
                       └──────────────────┘
```

## 🛠️ Tech Stack

- **Runtime**: Bun (Node.js compatible)
- **Framework**: Hono.js (Fast web framework)
- **Vector DB**: Qdrant (Similarity search)
- **Database**: PostgreSQL (Chat history & metadata)
- **AI**: OpenAI (GPT-4 + text-embedding-3-large)
- **PDF Processing**: Custom chunking with LangChain integration
- **Language**: TypeScript

## 📋 Prerequisites

- [Bun](https://bun.sh/) (v1.0+) or Node.js (v18+)
- PostgreSQL (v14+)
- Qdrant (v1.7+)
- OpenAI API key

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/Hexacodegr/ferefek_ai_back.git
cd ferefek_ai_back
bun install
```

### 2. Environment Setup

```bash
cp .env.example .env
# Edit .env with your actual values
```

### 3. Start Services

**Using Docker:**
```bash
docker compose up -d
```

**Manual setup:**
- Start PostgreSQL on port 5432
- Start Qdrant on port 6333

### 4. Add Documents

```bash
# Place PDF files in ./dataset/ directory
mkdir dataset
cp your-documents.pdf dataset/

# Process documents
bun run data-entry
```

### 5. Start API Server

```bash
bun run dev
```

Server will be available at `http://localhost:3000`

## 📁 Project Structure

```
ferefek-ai/
├── src/
│   ├── index.ts              # API server & endpoints
│   ├── openai.ts            # OpenAI client & prompts
│   ├── types.ts             # TypeScript interfaces
│   ├── utils.ts             # Utility functions
│   ├── db/
│   │   ├── qdrant.ts        # Vector database operations
│   │   └── postgress.ts     # PostgreSQL operations
│   ├── pdf/
│   │   ├── pdf.ts           # PDF text extraction
│   │   ├── chucking.ts      # Document chunking logic
│   │   ├── prompts.ts       # AI prompts
│   │   └── utils.ts         # PDF utilities
│   └── scripts/
│       └── dataset-entry.ts # Document processing script
├── dataset/                 # PDF files to process
├── dataset_no_proc/        # Backup of original files
├── docker-compose.yml      # Docker services
├── Dockerfile              # Container definition
└── README.md               # This file
```

## 🔌 API Endpoints

### Chat with Documents
```http
POST /chat
Content-Type: application/json

{
  "prompt": "What are the requirements for this job?",
  "sessionId": "optional-session-id",
  "limit": 10,
  "filter": null
}
```

**Response:**
```json
{
  "query": "What are the requirements for this job?",
  "answer": "Based on Document 1, the requirements are...",
  "sessionId": "1704067200000_abc123def456",
  "results": [...],
  "count": 5,
  "tokensUsed": 450,
  "relativeDocs": [
    {
      "name": "job_posting.pdf",
      "url": "/path/to/file",
      "score": 0.85,
      "docHash": "abc123..."
    }
  ]
}
```

### Rate Answer Quality
```http
POST /feedback
Content-Type: application/json

{
  "messageId": 123,
  "answerVal": "good"  // or "bad"
}
```

### Get Chat History
```http
GET /history?sessionId=123&limit=50
```

### Get All Documents
```http
GET /all
```

### Health Check
```http
GET /health
```

## 🔧 Configuration

### Environment Variables

See `.env.example` for all required environment variables:

- **OpenAI**: API key and model configuration
- **PostgreSQL**: Database connection details
- **Qdrant**: Vector database connection
- **Application**: Server settings

### Document Processing

The system processes documents in multiple levels:

1. **Document Level**: Entire PDF as one chunk
2. **Page Level**: Each page as individual chunks
3. **Paragraph Level**: Intelligent paragraph splitting with header merging

### Chunking Strategy

- Headers are merged with following paragraphs
- Small paragraphs (< 100 chars) are combined
- Maintains document hierarchy with `parentIds`
- Each chunk gets a unique deterministic ID

## 🐳 Docker Setup

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down
```

## 📊 Monitoring & Analytics

The system tracks:

- **Token Usage**: Embedding and generation tokens per request
- **Response Quality**: User ratings (good/bad) for answers
- **Search Performance**: Similarity scores and result counts
- **Conversation Flow**: Complete chat history with sessions

## 🔍 Debugging

### Common Issues

**1. "Chat history table doesn't exist"**
```bash
# Restart server to trigger database setup
bun run dev
```

**2. "Qdrant connection failed"**
```bash
# Check Qdrant is running
curl http://localhost:6333/health
```

**3. "OpenAI rate limit"**
- Check API key and quota
- Increase rate limiting delays in `openai.ts`

### Logs

```bash
# API server logs
bun run dev

# Document processing logs
bun run data-entry
```

## 🚀 Development

### Add New Features

1. **Custom Prompts**: Edit `src/openai.ts`
2. **New Endpoints**: Add to `src/index.ts`
3. **Document Types**: Extend `src/pdf/` processors
4. **Database Schema**: Modify `src/db/postgress.ts`

### Running Tests

```bash
# Add your test files to test/
bun test
```

## 📈 Performance Tuning

- **Embedding Model**: Switch between OpenAI models in `src/openai.ts`
- **Chunk Sizes**: Adjust in `src/pdf/chucking.ts`
- **Search Threshold**: Modify `scoreThreshold` in `src/index.ts`
- **Rate Limiting**: Configure delays in OpenAI client

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/Hexacodegr/ferefek_ai_back/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Hexacodegr/ferefek_ai_back/discussions)

---

**Made with ❤️ by [Hexacode](https://github.com/Hexacodegr)**