# RAG Telegram Bot

A demonstration project implementing Retrieval-Augmented Generation (RAG) with a Telegram bot interface.

## Overview

This project showcases how to build a question-answering system that leverages vector embeddings and Large Language Models (LLMs) to provide accurate, context-aware responses through a Telegram bot. The system uses a PostgreSQL database with pgvector extension to store and query document embeddings.

**Note**: This is a test/demonstration project intended for educational purposes.

## Features

- Processes and embeds text documents using OpenAI embeddings
- Stores vector embeddings in PostgreSQL with pgvector extension
- Retrieves relevant document fragments based on user queries
- Uses LLMs (GPT-4o) to generate accurate answers based on retrieved context
- Provides a conversational interface through Telegram

## Project Structure

```
├── src/
│   ├── embed_and_store_db.js  - Script to process and store document embeddings
│   ├── chatbot.js             - Telegram bot implementation with RAG functionality
├── .env                       - Environment variables configuration
└── README.md                  - Project documentation
```

## How It Works

The system operates in two main steps:

1. **Document Processing & Storage** (`embed_and_store_db.js`):
   - Downloads text content from a remote source
   - Splits text into meaningful chunks
   - Generates vector embeddings for each chunk
   - Stores embeddings and text in a PostgreSQL database with pgvector

2. **Query & Response** (`chatbot.js`):
   - Receives user questions through Telegram
   - Converts questions to embeddings
   - Performs similarity search to find relevant document chunks
   - Constructs a prompt with retrieved context
   - Generates answers using an LLM
   - Returns the answer to the user

## Technologies Used

- **Node.js** - Runtime environment
- **PostgreSQL with pgvector extension** - Vector database
- **OpenAI API** - For embeddings and LLM capabilities
- **Telegram Bot API** - User interface
- **LangChain** - Framework for working with LLMs

## Setup Requirements

1. PostgreSQL database with pgvector extension
2. Node.js environment
3. OpenAI API key
4. Telegram Bot token

## Database Setup

### Installing pgvector

Before using this project, you need to install the pgvector extension in your PostgreSQL database. The official documentation and installation instructions can be found at [pgvector's GitHub repository](https://github.com/pgvector/pgvector).

Quick installation steps for different environments:

- **Linux/Mac**:
  ```bash
  cd /tmp
  git clone --branch v0.8.0 https://github.com/pgvector/pgvector.git
  cd pgvector
  make
  make install # may need sudo
  ```

- **Docker**: `docker pull pgvector/pgvector:pg17`

- **APT (Debian/Ubuntu)**: `sudo apt install postgresql-17-pgvector`

- **Homebrew**: `brew install pgvector`

### Creating Database Schema

Once pgvector is installed, run the following SQL commands to set up your database:

```sql
-- 1. Enable the pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- 2. Create table to store documents and embeddings
CREATE TABLE public.documentos_rag (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    content text,         -- Text fragment
    metadata jsonb,       -- Additional metadata (optional)
    embedding vector(1536) -- Vector dimension depends on OpenAI model (text-embedding-3-small uses 1536)
);

-- 3. Create function to search for similar documents (used by LangChain)
-- This version is compatible with langchain_community.vectorstores
CREATE OR REPLACE FUNCTION public.match_documents_lc (
  query_embedding vector(1536),
  match_count      INT      DEFAULT NULL,
  filter           JSONB    DEFAULT '{}'
)
RETURNS TABLE (
  id         UUID,
  content    TEXT,
  similarity FLOAT
)
LANGUAGE SQL STABLE
AS $$
  -- Call the original function with parameters in the expected order
  SELECT
    docs.id,
    docs.content,
    1 - (docs.embedding <=> query_embedding) AS similarity
  FROM documentos_rag AS docs
  WHERE docs.metadata @> filter
  ORDER BY docs.embedding <=> query_embedding
  LIMIT match_count;
$$;
```

**Note**: The table name in the SQL script should match the `TABLE_NAME` in your environment variables.

## Environment Variables

Create a `.env` file with the following variables:

```
# OpenAI
OPENAI_API_KEY=your_openai_api_key  # Used implicitly by LangChain classes

# Telegram
TELEGRAM_TOKEN=your_telegram_bot_token

# PostgreSQL Connection
PGHOST=localhost
PGPORT=5432
PGDATABASE=your_database_name
PGUSER=your_postgres_user
PGPASSWORD=your_postgres_password
TABLE_NAME=documentos_rag

# Document Processing
CHUNK_SIZE=1000
CHUNK_OVERLAP=100
URL_REMOTE_TEXT=https://example.com/your_text_source.txt
```

### Models Used

This project uses the following OpenAI models:
- **LLM**: GPT-4o (explicitly specified in code)
- **Embeddings**: text-embedding-3-small (default model used by LangChain when not explicitly specified)

These models are automatically accessed using the OPENAI_API_KEY environment variable, which is loaded by the application and used implicitly by LangChain's OpenAI integration classes.

## Usage

1. **Process and store documents:**
   ```
   node src/embed_and_store_db.js
   ```

2. **Start the Telegram bot:**
   ```
   node src/chatbot.js
   ```

3. Start a conversation with your bot on Telegram and ask questions about the stored documents.

## Limitations

As this is a demonstration project:
- Error handling is basic
- No authentication beyond what Telegram provides
- Limited to the specific document set provided at setup

## Future Improvements

- Add support for PDF and other document formats
- Implement conversational memory
- Add user authentication and personalization
- Implement streaming responses
- Add more detailed metrics and logging

## License

This project is available for educational purposes only.

## Disclaimer

This is a test project meant for demonstration and educational purposes. It is not intended for production use without further development and security considerations.