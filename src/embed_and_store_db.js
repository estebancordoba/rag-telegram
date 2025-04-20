// src/embed_and_store_db.js ----------------------------------------------
import "dotenv/config";
import axios from "axios";
import pg from "pg";
import { v4 as uuid } from "uuid";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { OpenAIEmbeddings } from "@langchain/openai";
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";

/* ------------------------------------------------------------------ */
/* 1) Descargar el texto remoto (equiv. nodo HTTP Request en n8n)     */
/* ------------------------------------------------------------------ */
async function fetchText(url) {
  const { data } = await axios.get(url);
  return data;
}

/* ------------------------------------------------------------------ */
/* 2) Dividir en fragmentos con RecursiveCharacterTextSplitter         */
/* ------------------------------------------------------------------ */
async function splitIntoDocuments(rawText) {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: Number(process.env.CHUNK_SIZE) || 1000,
    chunkOverlap: Number(process.env.CHUNK_OVERLAP) || 100,
  });
  return splitter.createDocuments([rawText]); // devuelve Array< Document >
}

/* ------------------------------------------------------------------ */
/* 3) Generar embeddings y almacenar en pgvector                       */
/* ------------------------------------------------------------------ */
async function embedAndStore(docs) {
  // Instancia del pool global para controlarlo adecuadamente
  let pool = null;

  try {
    // Crear el pool de conexiones
    pool = new pg.Pool({
      host: process.env.PGHOST,
      port: process.env.PGPORT,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    });

    // Comprobar que la conexión funciona
    await pool.query("SELECT 1");
    console.log("✓ Conexión a PostgreSQL establecida correctamente");

    const tableName = process.env.TABLE_NAME || "documentos_rag";

    // Inicializa / "se asegura de que la tabla exista" (una vez)
    const vectorStore = await PGVectorStore.initialize(
      new OpenAIEmbeddings(), // función de embeddings
      {
        pool,
        tableName, // usa tu tabla
        // Especificamos explícitamente los nombres de las columnas
        columns: {
          idColumnName: "id",
          vectorColumnName: "embedding",
          contentColumnName: "content", // aseguramos que sea 'content' y no 'text'
          metadataColumnName: "metadata",
        },
        // las columnas default son id, content, metadata y vector
        // cámbialas aquí si tu tabla difiere
      }
    );

    // Genera embeddings en lote e inserta
    await vectorStore.addDocuments(
      docs.map((d) => ({
        // 👉 pageContent será la columna "content"
        pageContent: d.pageContent,
        // 👉 metadata puede almacenar la URL fuente, índice, etc.
        metadata: { source: "truora-blog", uuid: uuid() },
      }))
    );

    console.log(`✔ Almacenados ${docs.length} fragmentos en "${tableName}".`);
    return true;
  } catch (error) {
    console.error("Error al almacenar documentos:", error);
    throw error;
  } finally {
    // Asegurarse de que pool.end() siempre se ejecute si el pool existe
    if (pool) {
      try {
        await pool.end();
        console.log("✓ Conexión a la base de datos cerrada correctamente.");
      } catch (err) {
        console.error("Error al cerrar el pool de conexiones:", err);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* 4) Lanzador ("main")                                                */
/* ------------------------------------------------------------------ */
(async () => {
  const exitTimeout = setTimeout(() => {
    console.log(
      "⚠️ Forzando cierre del proceso tras 30 segundos de inactividad"
    );
    process.exit(0);
  }, 30000); // 30 segundos de seguridad

  try {
    const url =
      "https://raw.githubusercontent.com/juanhenaoparra/examples/refs/heads/main/truora-blog.txt";
    console.log("▶ Descargando texto…");
    const rawText = await fetchText(url);

    console.log("🔪 Dividiendo en fragmentos…");
    const docs = await splitIntoDocuments(rawText);

    console.log("📥 Generando embeddings y guardando en Postgres…");
    await embedAndStore(docs);

    console.log("✅ Proceso completado exitosamente.");

    // Limpiar el timeout ya que el proceso terminó correctamente
    clearTimeout(exitTimeout);

    // Dar tiempo para que todos los logs se escriban y forzar salida
    setTimeout(() => {
      process.exit(0);
    }, 500);
  } catch (error) {
    console.error("Error en el proceso principal:", error);
    clearTimeout(exitTimeout);
    process.exit(1);
  }
})();

// Manejo de señales para cerrar el proceso limpiamente
process.on("SIGINT", () => {
  console.log("Proceso interrumpido manualmente. Finalizando...");
  process.exit(0);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Promesa rechazada no manejada:", reason);
  process.exit(1);
});
