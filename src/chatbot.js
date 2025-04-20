// src/chatbot.js
import "dotenv/config";
import TelegramBot from "node-telegram-bot-api";
import pg from "pg";
import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai";
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";

// Helper function for detailed logs
function logWithTimestamp(message, data = null) {
  const timestamp = new Date().toISOString().slice(11, 19); // HH:MM:SS
  const prefix = `[${timestamp}]`;

  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

/* ---------- 1) Global connections ---------- */
logWithTimestamp("🔌 Initializing connections to external services...");

const pool = new pg.Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

logWithTimestamp(
  `📊 PostgreSQL pool connection configured (${process.env.PGHOST}:${process.env.PGPORT})`
);

const embeddings = new OpenAIEmbeddings(); // generates vectors
logWithTimestamp("🧠 OpenAI embeddings model initialized");

logWithTimestamp(
  `🗄️ Initializing PGVectorStore with table: ${process.env.TABLE_NAME}`
);
const vectorStore = await PGVectorStore.initialize(
  // creates/uses table
  embeddings,
  {
    pool,
    tableName: process.env.TABLE_NAME,
    // Explicitly specify column names to avoid problems
    columns: {
      idColumnName: "id",
      vectorColumnName: "embedding",
      contentColumnName: "content",
      metadataColumnName: "metadata",
    },
  }
); // PGVectorStore docs :contentReference[oaicite:0]{index=0}
logWithTimestamp("✅ PGVectorStore successfully initialized");

const llm = new ChatOpenAI({ temperature: 0, modelName: "gpt-4o" });
logWithTimestamp("🤖 ChatOpenAI language model (GPT-4o) initialized");

/* ---------- 2) Telegram bot startup ---------- */
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true }); // basic usage of node‑telegram‑bot‑api :contentReference[oaicite:1]{index=1}
logWithTimestamp("🚀 Telegram bot started and listening for messages");

/* ---------- 3) Message handler ---------- */
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from?.first_name || "User";
  const text = msg.text?.trim();

  logWithTimestamp(
    `📨 Message received from ${userName} (ID: ${chatId}): "${text}"`
  );

  if (!text || text.startsWith("/")) {
    if (text === "/start") {
      logWithTimestamp(`🤝 /start command received from ${userName}`);
      await bot.sendMessage(
        chatId,
        "Hello! I'm ready to answer your questions about the blog content. What would you like to know?"
      );
    } else if (text) {
      logWithTimestamp(`⚠️ Unprocessed command: ${text}`);
    }
    return; // ignore other commands
  }

  // Send waiting message
  await bot.sendMessage(
    chatId,
    "Processing your question, give me a moment..."
  );
  logWithTimestamp("🔄 Waiting message sent to user");

  try {
    /* 3a) Retrieve the 4 most relevant fragments */
    logWithTimestamp("🔍 Searching for relevant fragments for the query...");
    const startSearch = Date.now();
    const docs = await vectorStore.similaritySearch(text, 4);
    const searchTime = ((Date.now() - startSearch) / 1000).toFixed(2);

    logWithTimestamp(
      `📚 Retrieved ${docs.length} relevant fragments in ${searchTime} seconds`
    );

    if (docs.length === 0) {
      logWithTimestamp("⚠️ No relevant fragments found");
      await bot.sendMessage(
        chatId,
        "I couldn't find relevant information for your question. Can you rephrase it?"
      );
      return;
    }

    /* 3b) Build context for the prompt */
    logWithTimestamp(
      "📝 Building context for the prompt with retrieved fragments"
    );
    const context = docs
      .map((d, i) => `(${i + 1}) ${d.pageContent}`)
      .join("\n");

    // Log of retrieved fragments (summarized version)
    docs.forEach((doc, i) => {
      const shortContent =
        doc.pageContent.substring(0, 150) +
        (doc.pageContent.length > 150 ? "..." : "");
      logWithTimestamp(`📄 Fragment #${i + 1}:`, shortContent);
    });

    /* 3c) Prompt + model call */
    const prompt = `Answer the following question using ONLY the information provided.

                    ${context}

                    Question: ${text}
                    Answer:`;

    logWithTimestamp("🧠 Sending query to LLM model...");
    const startLLM = Date.now();
    const response = await llm.invoke(prompt);
    const llmTime = ((Date.now() - startLLM) / 1000).toFixed(2);

    // Extract content from model response
    const answer = response.content;
    logWithTimestamp(`✅ Response received from model in ${llmTime} seconds`);
    logWithTimestamp("📤 Model response:", answer);

    // Verify that the response is not empty
    if (!answer || typeof answer !== "string" || answer.trim() === "") {
      throw new Error("The model response is empty");
    }

    /* 3d) Return to user */
    await bot.sendMessage(chatId, answer);
    logWithTimestamp(`📬 Response sent to ${userName}`);

    // Total time metrics
    const totalTime = ((Date.now() - startSearch) / 1000).toFixed(2);
    logWithTimestamp(
      `⏱️ Total processing time: ${totalTime} seconds (Search: ${searchTime}s, LLM: ${llmTime}s)`
    );
  } catch (err) {
    console.error("❌ Error in QA:", err);
    logWithTimestamp("🚨 Error processing the query", err);
    // Ensure we always send a valid message
    await bot.sendMessage(
      chatId,
      "Sorry, an error occurred while processing your question. Please try again later."
    );
    logWithTimestamp("📤 Error message sent to user");
  }
});

/* ---------- 4) Clean shutdown when process is stopped ---------- */
process.on("SIGINT", async () => {
  logWithTimestamp("⌨️ Interrupt signal received. Closing connections...");
  await pool.end();
  logWithTimestamp("🛑 Connections closed. Terminating the process.");
  process.exit(0);
});

// Capture unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  logWithTimestamp("❌ Unhandled promise rejection:", reason);
  // We don't terminate the process so the bot keeps running
});
