// src/chatbot.js
import "dotenv/config";
import TelegramBot from "node-telegram-bot-api";
import pg from "pg";
import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai";
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";

// Función auxiliar para logs más detallados
function logWithTimestamp(message, data = null) {
  const timestamp = new Date().toISOString().slice(11, 19); // HH:MM:SS
  const prefix = `[${timestamp}]`;

  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

/* ---------- 1) Conexiones globales ---------- */
logWithTimestamp("🔌 Iniciando conexiones a servicios externos...");

const pool = new pg.Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

logWithTimestamp(
  `📊 Conexión al pool de PostgreSQL configurada (${process.env.PGHOST}:${process.env.PGPORT})`
);

const embeddings = new OpenAIEmbeddings(); // genera vectores
logWithTimestamp("🧠 Modelo de embeddings de OpenAI inicializado");

logWithTimestamp(
  `🗄️ Inicializando PGVectorStore con tabla: ${process.env.TABLE_NAME}`
);
const vectorStore = await PGVectorStore.initialize(
  // crea/usa tabla
  embeddings,
  {
    pool,
    tableName: process.env.TABLE_NAME,
    // Especificamos explícitamente los nombres de las columnas para evitar problemas
    columns: {
      idColumnName: "id",
      vectorColumnName: "embedding",
      contentColumnName: "content",
      metadataColumnName: "metadata",
    },
  }
); // docs PGVectorStore :contentReference[oaicite:0]{index=0}
logWithTimestamp("✅ PGVectorStore inicializado correctamente");

const llm = new ChatOpenAI({ temperature: 0, modelName: "gpt-4o" });
logWithTimestamp("🤖 Modelo de lenguaje ChatOpenAI (GPT-4o) inicializado");

/* ---------- 2) Arranque del bot de Telegram ---------- */
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true }); // uso básico de node‑telegram‑bot‑api :contentReference[oaicite:1]{index=1}
logWithTimestamp("🚀 Bot de Telegram iniciado y escuchando mensajes");

/* ---------- 3) Handler de mensajes ---------- */
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from?.first_name || "Usuario";
  const text = msg.text?.trim();

  logWithTimestamp(
    `📨 Mensaje recibido de ${userName} (ID: ${chatId}): "${text}"`
  );

  if (!text || text.startsWith("/")) {
    if (text === "/start") {
      logWithTimestamp(`🤝 Comando /start recibido de ${userName}`);
      await bot.sendMessage(
        chatId,
        "¡Hola! Estoy listo para responder tus preguntas sobre el contenido del blog. ¿Qué te gustaría saber?"
      );
    } else if (text) {
      logWithTimestamp(`⚠️ Comando no procesado: ${text}`);
    }
    return; // ignora otros comandos
  }

  // Enviar mensaje de espera
  await bot.sendMessage(chatId, "Procesando tu pregunta, dame un momento...");
  logWithTimestamp("🔄 Enviado mensaje de espera al usuario");

  try {
    /* 3a) Recupera los 4 fragmentos más relevantes */
    logWithTimestamp("🔍 Buscando fragmentos relevantes para la consulta...");
    const startSearch = Date.now();
    const docs = await vectorStore.similaritySearch(text, 4);
    const searchTime = ((Date.now() - startSearch) / 1000).toFixed(2);

    logWithTimestamp(
      `📚 Recuperados ${docs.length} fragmentos relevantes en ${searchTime} segundos`
    );

    if (docs.length === 0) {
      logWithTimestamp("⚠️ No se encontraron fragmentos relevantes");
      await bot.sendMessage(
        chatId,
        "No encontré información relevante para tu pregunta. ¿Puedes reformularla?"
      );
      return;
    }

    /* 3b) Construye el contexto para el prompt */
    logWithTimestamp(
      "📝 Construyendo contexto para el prompt con los fragmentos recuperados"
    );
    const context = docs
      .map((d, i) => `(${i + 1}) ${d.pageContent}`)
      .join("\n");

    // Log de los fragmentos recuperados (versión resumida)
    docs.forEach((doc, i) => {
      const shortContent =
        doc.pageContent.substring(0, 150) +
        (doc.pageContent.length > 150 ? "..." : "");
      logWithTimestamp(`📄 Fragmento #${i + 1}:`, shortContent);
    });

    /* 3c) Prompt + llamada al modelo */
    const prompt = `Responde la siguiente pregunta usando SÓLO la información proporcionada.

${context}

Pregunta: ${text}
Respuesta en español:`;

    logWithTimestamp("🧠 Enviando consulta al modelo LLM...");
    const startLLM = Date.now();
    const response = await llm.invoke(prompt);
    const llmTime = ((Date.now() - startLLM) / 1000).toFixed(2);

    // Extraer el contenido del mensaje del modelo
    const answer = response.content;
    logWithTimestamp(`✅ Respuesta recibida del modelo en ${llmTime} segundos`);
    logWithTimestamp("📤 Respuesta del modelo:", answer);

    // Verificar que la respuesta no esté vacía
    if (!answer || typeof answer !== "string" || answer.trim() === "") {
      throw new Error("La respuesta del modelo está vacía");
    }

    /* 3d) Devuelve al usuario */
    await bot.sendMessage(chatId, answer);
    logWithTimestamp(`📬 Respuesta enviada a ${userName}`);

    // Métricas de tiempo total
    const totalTime = ((Date.now() - startSearch) / 1000).toFixed(2);
    logWithTimestamp(
      `⏱️ Tiempo total de procesamiento: ${totalTime} segundos (Búsqueda: ${searchTime}s, LLM: ${llmTime}s)`
    );
  } catch (err) {
    console.error("❌ Error en QA:", err);
    logWithTimestamp("🚨 Error al procesar la consulta", err);
    // Asegurar que siempre enviamos un mensaje válido
    await bot.sendMessage(
      chatId,
      "Lo siento, ocurrió un error al procesar tu pregunta. Por favor, inténtalo de nuevo más tarde."
    );
    logWithTimestamp("📤 Mensaje de error enviado al usuario");
  }
});

/* ---------- 4) Cierre limpio si detienes el proceso ---------- */
process.on("SIGINT", async () => {
  logWithTimestamp("⌨️ Señal de interrupción recibida. Cerrando conexiones...");
  await pool.end();
  logWithTimestamp("🛑 Conexiones cerradas. Terminando el proceso.");
  process.exit(0);
});

// Capturar rechazos de promesas no manejados
process.on("unhandledRejection", (reason, promise) => {
  logWithTimestamp("❌ Promesa rechazada no manejada:", reason);
  // No terminamos el proceso para que el bot siga funcionando
});
