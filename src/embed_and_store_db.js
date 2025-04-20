// src/embed_and_store_db.js ----------------------------------------------
import "dotenv/config";
import axios from "axios";
import pg from "pg";
import { v4 as uuid } from "uuid";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { OpenAIEmbeddings } from "@langchain/openai";
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";

/* ------------------------------------------------------------------ */
/* 1) Download remote text                                            */
/* ------------------------------------------------------------------ */
async function fetchText(url) {
  const { data } = await axios.get(url);
  return data;
}

/* ------------------------------------------------------------------ */
/* 2) Split into fragments with RecursiveCharacterTextSplitter        */
/* ------------------------------------------------------------------ */
async function splitIntoDocuments(rawText) {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: Number(process.env.CHUNK_SIZE) || 1000,
    chunkOverlap: Number(process.env.CHUNK_OVERLAP) || 100,
  });
  return splitter.createDocuments([rawText]); // returns Array< Document >
}

/* ------------------------------------------------------------------ */
/* 3) Generate embeddings and store in pgvector                       */
/* ------------------------------------------------------------------ */
async function embedAndStore(docs) {
  // Global pool instance to control it properly
  let pool = null;

  try {
    // Create connection pool
    pool = new pg.Pool({
      host: process.env.PGHOST,
      port: process.env.PGPORT,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    });

    // Check that connection works
    await pool.query("SELECT 1");
    console.log("✓ PostgreSQL connection established successfully");

    const tableName = process.env.TABLE_NAME || "documentos_rag";

    // Initialize / "make sure table exists" (once)
    const vectorStore = await PGVectorStore.initialize(
      new OpenAIEmbeddings(), // embeddings function
      {
        pool,
        tableName, // use your table
        // Explicitly specify column names
        columns: {
          idColumnName: "id",
          vectorColumnName: "embedding",
          contentColumnName: "content", // ensure it's 'content' not 'text'
          metadataColumnName: "metadata",
        },
        // default columns are id, content, metadata and vector
        // change them here if your table differs
      }
    );

    // Generate batch embeddings and insert
    await vectorStore.addDocuments(
      docs.map((d) => ({
        // 👉 pageContent will be the "content" column
        pageContent: d.pageContent,
        // 👉 metadata can store source URL, index, etc.
        metadata: { source: "truora-blog", uuid: uuid() },
      }))
    );

    console.log(`✔ Stored ${docs.length} fragments in "${tableName}".`);
    return true;
  } catch (error) {
    console.error("Error storing documents:", error);
    throw error;
  } finally {
    // Make sure pool.end() always executes if pool exists
    if (pool) {
      try {
        await pool.end();
        console.log("✓ Database connection closed successfully.");
      } catch (err) {
        console.error("Error closing connection pool:", err);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* 4) Launcher ("main")                                               */
/* ------------------------------------------------------------------ */
(async () => {
  const exitTimeout = setTimeout(() => {
    console.log(
      "⚠️ Forcing process termination after 30 seconds of inactivity"
    );
    process.exit(0);
  }, 30000); // 30 seconds safety

  try {
    const url = process.env.URL_REMOTE_TEXT;
    console.log("▶ Downloading text...");
    const rawText = await fetchText(url);

    console.log("🔪 Splitting into chunks...");
    const docs = await splitIntoDocuments(rawText);

    console.log("📥 Generating embeddings and saving to Postgres...");
    await embedAndStore(docs);

    console.log("✅ Process completed successfully.");

    // Clear timeout as process completed correctly
    clearTimeout(exitTimeout);

    // Give time for all logs to be written and force exit
    setTimeout(() => {
      process.exit(0);
    }, 500);
  } catch (error) {
    console.error("Error in main process:", error);
    clearTimeout(exitTimeout);
    process.exit(1);
  }
})();

// Handle signals to cleanly close the process
process.on("SIGINT", () => {
  console.log("Process manually interrupted. Finishing...");
  process.exit(0);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled promise rejection:", reason);
  process.exit(1);
});
