import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_KNOWLEDGE_DIR = "sommelier_knowledge_base";
const DEFAULT_MANIFEST = "sommelier_knowledge_base/manifest.json";
const DEFAULT_MAX_TOKENS = 500;
const DEFAULT_OVERLAP_TOKENS = 50;
const WORDS_PER_TOKEN_APPROX = 0.75;
const EMBEDDING_MODEL = "text-embedding-3-small";

function parseArgs(argv) {
  const args = {
    dryRun: false,
    knowledgeDir: DEFAULT_KNOWLEDGE_DIR,
    manifestPath: DEFAULT_MANIFEST,
    envFile: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg === "--env-file") {
      args.envFile = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--knowledge-dir") {
      args.knowledgeDir = argv[index + 1] ?? args.knowledgeDir;
      index += 1;
      continue;
    }
    if (arg === "--manifest") {
      args.manifestPath = argv[index + 1] ?? args.manifestPath;
      index += 1;
      continue;
    }
  }

  return args;
}

function loadEnvFile(envFile) {
  if (!envFile) {
    return;
  }

  const raw = fs.readFileSync(envFile, "utf8");
  raw
    .split(/\n/)
    .filter(Boolean)
    .forEach((line) => {
      const index = line.indexOf("=");
      if (index === -1) {
        return;
      }
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();
      if (key && !(key in process.env)) {
        process.env[key] = value;
      }
    });
}

function normalizeWhitespace(value) {
  return value.replace(/\r\n/g, "\n").trim();
}

function estimateTokens(value) {
  const words = value.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_TOKEN_APPROX));
}

function overlapTail(value, overlapTokens) {
  if (overlapTokens <= 0) {
    return "";
  }
  const words = value.split(/\s+/).filter(Boolean);
  const overlapWords = Math.max(1, Math.round(overlapTokens * WORDS_PER_TOKEN_APPROX));
  return words.slice(-overlapWords).join(" ");
}

function splitOversizedUnit(unit, maxTokens) {
  if (estimateTokens(unit) <= maxTokens) {
    return [unit];
  }

  const sentences = unit
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length <= 1) {
    const words = unit.split(/\s+/).filter(Boolean);
    const chunkWords = Math.max(1, Math.round(maxTokens * WORDS_PER_TOKEN_APPROX));
    const chunks = [];
    for (let index = 0; index < words.length; index += chunkWords) {
      chunks.push(words.slice(index, index + chunkWords).join(" "));
    }
    return chunks;
  }

  const chunks = [];
  let current = "";
  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (current && estimateTokens(candidate) > maxTokens) {
      chunks.push(current);
      current = sentence;
      continue;
    }
    current = candidate;
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

function chunkText(text, maxTokens = DEFAULT_MAX_TOKENS, overlapTokens = DEFAULT_OVERLAP_TOKENS) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return [];
  }

  const paragraphUnits = normalized
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .flatMap((paragraph) => splitOversizedUnit(paragraph, maxTokens));

  const chunks = [];
  let current = "";

  const pushCurrent = () => {
    const content = normalizeWhitespace(current);
    if (!content) {
      return;
    }
    chunks.push({
      chunkIndex: chunks.length,
      content,
      approxTokens: estimateTokens(content),
    });
  };

  for (const unit of paragraphUnits) {
    const candidate = current ? `${current}\n\n${unit}` : unit;
    if (current && estimateTokens(candidate) > maxTokens) {
      const previous = normalizeWhitespace(current);
      pushCurrent();
      const overlap = overlapTail(previous, overlapTokens);
      current = overlap ? `${overlap}\n\n${unit}` : unit;
      continue;
    }
    current = candidate;
  }

  if (current) {
    pushCurrent();
  }

  return chunks;
}

function splitMarkdownSections(markdown) {
  const lines = normalizeWhitespace(markdown).split("\n");
  const sections = [];
  let heading = null;
  let body = [];

  const pushSection = () => {
    const content = body.join("\n").trim();
    if (!content && !heading) {
      return;
    }
    sections.push({ heading, body: content });
  };

  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line.trim())) {
      pushSection();
      heading = line.trim();
      body = [];
      continue;
    }
    body.push(line);
  }

  pushSection();
  return sections;
}

function chunkMarkdown(markdown) {
  const sections = splitMarkdownSections(markdown);
  const chunks = [];

  for (const section of sections) {
    const content = section.heading
      ? `${section.heading}\n${section.body}`.trim()
      : section.body.trim();
    for (const chunk of chunkText(content)) {
      chunks.push({
        ...chunk,
        chunkIndex: chunks.length,
        heading: section.heading,
      });
    }
  }

  return chunks;
}

function filenameToTitle(filename) {
  return filename
    .replace(/\.md$/i, "")
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

async function generateEmbeddings(openai, texts) {
  const embeddings = [];

  for (let index = 0; index < texts.length; index += 96) {
    const batch = texts.slice(index, index + 96);
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });
    embeddings.push(...response.data.map((item) => item.embedding));
  }

  return embeddings;
}

async function ensureSchema(supabase) {
  const { error } = await supabase.from("knowledge_documents").select("id").limit(1);
  if (error) {
    throw new Error(
      "Pocket Sommelier schema is missing on the target database. Apply 053_pocket_sommelier.sql first."
    );
  }
}

async function upsertDocument(supabase, fileInfo, chunks, embeddings, manifest) {
  const uploaderId =
    process.env.SOMMELIER_UPLOADER_USER_ID ??
    process.env.E2E_USER_A_ID ??
    null;

  const existing = await supabase
    .from("knowledge_documents")
    .select("id")
    .eq("source_filename", fileInfo.filename)
    .maybeSingle();

  if (existing.error) {
    throw new Error(existing.error.message);
  }

  const payload = {
    title: fileInfo.title,
    source_url: fileInfo.sourceUrl,
    source_filename: fileInfo.filename,
    content_type: "markdown",
    content: fileInfo.content,
    metadata: {
      source: "github",
      corpus_name: manifest.name,
      corpus_version: manifest.version,
      generated: manifest.generated,
      topics: fileInfo.topics,
      words: fileInfo.words,
    },
    ingest_status: "processing",
    uploaded_by: uploaderId,
    last_ingested_at: new Date().toISOString(),
  };

  let documentId = existing.data?.id ?? null;

  if (documentId) {
    const { error } = await supabase
      .from("knowledge_documents")
      .update(payload)
      .eq("id", documentId);
    if (error) {
      throw new Error(error.message);
    }
  } else {
    const { data, error } = await supabase
      .from("knowledge_documents")
      .insert(payload)
      .select("id")
      .single();
    if (error || !data?.id) {
      throw new Error(error?.message ?? `Failed to insert ${fileInfo.filename}`);
    }
    documentId = data.id;
  }

  const { error: deleteError } = await supabase
    .from("general_knowledge_chunks")
    .delete()
    .eq("document_id", documentId);
  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const { error: insertError } = await supabase.from("general_knowledge_chunks").insert(
    chunks.map((chunk, index) => ({
      document_id: documentId,
      chunk_index: chunk.chunkIndex,
      content: chunk.content,
      embedding: embeddings[index],
      metadata: {
        title: fileInfo.title,
        source_filename: fileInfo.filename,
        heading: chunk.heading ?? null,
        approx_tokens: chunk.approxTokens,
        topics: fileInfo.topics,
      },
    }))
  );

  if (insertError) {
    throw new Error(insertError.message);
  }

  const { error: finalizeError } = await supabase
    .from("knowledge_documents")
    .update({
      ingest_status: "ready",
      chunk_count: chunks.length,
      last_ingested_at: new Date().toISOString(),
    })
    .eq("id", documentId);
  if (finalizeError) {
    throw new Error(finalizeError.message);
  }

  return {
    documentId,
    filename: fileInfo.filename,
    title: fileInfo.title,
    chunkCount: chunks.length,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workspaceRoot = process.cwd();
  const manifestPath = path.resolve(workspaceRoot, args.manifestPath);
  const knowledgeDir = path.resolve(workspaceRoot, args.knowledgeDir);

  if (!args.envFile) {
    const localEnv = path.resolve(workspaceRoot, ".env.local");
    const siblingEnv = path.resolve(workspaceRoot, "../cellarsnap/.env.local");
    if (fs.existsSync(localEnv)) {
      args.envFile = localEnv;
    } else if (fs.existsSync(siblingEnv)) {
      args.envFile = siblingEnv;
    }
  }

  loadEnvFile(args.envFile);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const prepared = manifest.files.map((entry) => {
    const filePath = path.join(knowledgeDir, entry.filename);
    const content = fs.readFileSync(filePath, "utf8");
    const chunks = chunkMarkdown(content);
    return {
      filename: entry.filename,
      title: filenameToTitle(entry.filename),
      sourceUrl: process.env.GITHUB_KNOWLEDGE_BASE_URL
        ? `${process.env.GITHUB_KNOWLEDGE_BASE_URL.replace(/\/$/, "")}/${entry.filename}`
        : null,
      topics: entry.topics ?? [],
      words: entry.words ?? null,
      content,
      chunks,
    };
  });

  const totalChunks = prepared.reduce((sum, item) => sum + item.chunks.length, 0);
  const totalWords = prepared.reduce((sum, item) => sum + (item.words ?? 0), 0);

  console.log(`Knowledge files: ${prepared.length}`);
  console.log(`Manifest words: ${totalWords}`);
  console.log(`Estimated chunks: ${totalChunks}`);
  prepared.forEach((item) => {
    console.log(
      `- ${item.filename}: ${item.chunks.length} chunks, ${item.words ?? "?"} words`
    );
  });

  if (args.dryRun) {
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  const openAiKey = process.env.OPENAI_API_KEY;

  if (!supabaseUrl || !serviceRoleKey || !openAiKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or OPENAI_API_KEY."
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  await ensureSchema(supabase);

  const openai = new OpenAI({ apiKey: openAiKey });
  const results = [];

  for (const item of prepared) {
    console.log(`Embedding ${item.filename}...`);
    const embeddings = await generateEmbeddings(
      openai,
      item.chunks.map((chunk) => chunk.content)
    );
    results.push(
      await upsertDocument(supabase, item, item.chunks, embeddings, manifest)
    );
  }

  console.log("\nIngest complete:");
  results.forEach((result) => {
    console.log(`- ${result.filename}: ${result.chunkCount} chunks -> ${result.documentId}`);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
