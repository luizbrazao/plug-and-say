"use node"; // Essencial para rodar no ambiente Node.js do Convex

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import OpenAI from "openai";
// @ts-ignore - Ignoramos erro de tipagem pois pdf2json não possui tipos oficiais estáveis
import PDFParser from "pdf2json";

const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_TEXT_LENGTH = 3500;

// --- Helper Functions (Embeddings & Normalização) ---

/**
 * Limpa o texto de espaços extras e quebras de linha para otimizar o embedding.
 */
function toEmbeddingInput(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_TEXT_LENGTH) return normalized;
  return normalized.slice(0, MAX_TEXT_LENGTH);
}

/**
 * Versão mais agressiva de limpeza para casos onde o texto extraído do PDF vem muito sujo.
 */
function toAggressiveEmbeddingInput(text: string, maxChars: number): string {
  const normalized = text
    .replace(/\s+/g, " ")
    .replace(/[^A-Za-zÀ-ÿ0-9\s.,;:!?()\-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= maxChars) return normalized;
  return normalized.slice(0, maxChars);
}

/**
 * Busca a chave da OpenAI configurada para a Organização específica.
 */
async function getOpenAIKeyForOrg(ctx: any, orgId: Id<"organizations">) {
  // AJUSTADO: Usando o nome correto 'getByType' conforme o erro do TS
  const integration: any = await ctx.runQuery(internal.integrations.getByType, {
    orgId,
    type: "openai",
  });

  // Tenta os campos comuns onde a chave pode estar salva
  const apiKey = integration?.config?.key || integration?.config?.token || integration?.config?.apiKey;
  return apiKey;
}

/**
 * Gera o embedding usando a chave da organização e tenta estratégias de fallback se falhar.
 */
async function createEmbedding(
  ctx: any,
  orgId: Id<"organizations">,
  text: string
): Promise<number[] | undefined> {
  const apiKey = await getOpenAIKeyForOrg(ctx, orgId);

  if (!apiKey) {
    console.error(`[Embedding] Chave OpenAI não encontrada para a organização: ${orgId}`);
    return undefined;
  }

  const openai = new OpenAI({ apiKey });

  // Tenta diferentes níveis de limpeza se o texto for muito complexo
  const candidates = [
    toEmbeddingInput(text),
    toAggressiveEmbeddingInput(text, 2000),
  ].filter((value) => value.length > 0);

  for (const input of candidates) {
    try {
      const result = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input,
      });
      const embedding = result.data?.[0]?.embedding;
      if (embedding) return embedding;
    } catch (error: any) {
      console.warn("[Embedding] Tentativa falhou:", error?.message || error);
    }
  }

  return undefined;
}

// --- Helper: Parse PDF (Wrapper Promise para pdf2json) ---

function parsePdfBuffer(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    // 'true' ativa o modo de extração de texto bruto
    const pdfParser = new PDFParser(null, true);

    pdfParser.on("pdfParser_dataError", (errData: any) => {
      reject(new Error(errData.parserError));
    });

    pdfParser.on("pdfParser_dataReady", () => {
      const text = pdfParser.getRawTextContent();
      resolve(text);
    });

    try {
      pdfParser.parseBuffer(buffer);
    } catch (e) {
      reject(e);
    }
  });
}

// --- Action Principal: ingestFile ---

export const ingestFile = action({
  args: {
    departmentId: v.id("departments"),
    storageId: v.id("_storage"),
    filename: v.optional(v.string()),
    mimeType: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ id: Id<"knowledgeBase"> }> => {
    // 1. Validar Departamento e Obter OrgId (Multi-tenant)
    const department: any = await ctx.runQuery(internal.tools.knowledge.getDepartment, {
      departmentId: args.departmentId,
    });
    if (!department) throw new Error("Departamento não encontrado.");

    const orgId = department.orgId;
    const filename = (args.filename || "upload").trim();

    // 2. Baixar Arquivo do Storage
    const fileBlob = await ctx.storage.get(args.storageId);
    if (!fileBlob) throw new Error("Arquivo não encontrado no storage do Convex.");

    const isPdf = args.mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf");
    let extractedText = "";

    // 3. Extração baseada no tipo de arquivo
    try {
      if (isPdf) {
        console.log(`[ingestFile] Processando PDF para Org: ${orgId}`);
        const arrayBuffer = await fileBlob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        extractedText = await parsePdfBuffer(buffer);

        // Limpeza de marcas d'água e quebras de página do pdf2json
        extractedText = extractedText
          .replace(/----------------Page \(\d+\) Break----------------/g, "\n")
          .replace(/\n\s*\n/g, "\n")
          .trim();
      } else {
        extractedText = await fileBlob.text();
      }
    } catch (error: any) {
      console.error("[ingestFile] Erro na extração:", error);
      throw new Error(`Falha ao processar conteúdo do arquivo: ${error.message}`);
    }

    // Validação mínima de conteúdo
    if (!extractedText || extractedText.length < 5) {
      throw new Error("O arquivo não contém texto legível suficiente.");
    }

    // 4. Gerar Embeddings (Usando a chave da Organização)
    console.log(`[ingestFile] Gerando embeddings para o arquivo: ${filename}`);
    const embedding = await createEmbedding(ctx, orgId, extractedText);

    if (!embedding) {
      console.warn("[ingestFile] Documento salvo SEM embedding. Verifique as credenciais da OpenAI.");
    }

    // 5. Salvar na Tabela de Conhecimento
    const result = await ctx.runMutation(internal.knowledge.createEntry, {
      title: filename,
      text: extractedText,
      fileStorageId: args.storageId,
      departmentId: args.departmentId,
      orgId: orgId,
      embedding: embedding,
      embeddingModel: embedding ? EMBEDDING_MODEL : undefined,
      metadata: {
        filename,
        type: args.mimeType || (isPdf ? "application/pdf" : "text/plain"),
      },
    });

    console.log(`[ingestFile] Sucesso! ID salvo: ${result.id}`);
    return { id: result.id };
  },
});