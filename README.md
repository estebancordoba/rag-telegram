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

## Environment Variables

Create a `.env` file with the following variables:

```
# OpenAI
OPENAI_API_KEY=your_openai_api_key

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