import _api from "@playzone/youtube-transcript/dist/api/index.js";
const YouTubeTranscriptApi = (_api as any).default || _api;
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

// ---------------------------------------------------------------------------
// .env loader
// ---------------------------------------------------------------------------

function findEnv(): string | null {
  for (const base of [process.cwd(), new URL(".", import.meta.url).pathname]) {
    let dir = resolve(base);
    for (let i = 0; i < 5; i++) {
      const candidate = resolve(dir, ".env");
      if (existsSync(resolve(dir, "package.json")) && existsSync(candidate)) {
        return candidate;
      }
      dir = resolve(dir, "..");
    }
  }
  return null;
}

export function loadEnv(): void {
  const envPath = findEnv();
  if (envPath) {
    for (const raw of readFileSync(envPath, "utf-8").split("\n")) {
      const line = raw.replace(/\r$/, "");
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

// Auto-load on import
loadEnv();

// ---------------------------------------------------------------------------
// Constants & Types
// ---------------------------------------------------------------------------

export const DEFAULT_OUTPUT_DIR = resolve(
  process.env.HOME || "/home/hal",
  "workspace/obsidian/Clippings"
);

export interface VideoMeta {
  title: string;
  channelName: string;
  description: string;
  publishedDate: string;
}

export interface ProcessOptions {
  url: string;
  lang?: string;
  skipSummary?: boolean;
  outputDir?: string;
  onProgress?: (msg: string) => void;
}

export interface ProcessResult {
  title: string;
  channelName: string;
  filename: string;
  outputPath: string;
  language: string;
  hasSummary: boolean;
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

export function extractVideoId(input: string): string {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) return match[1];
  }

  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;

  throw new Error(`Invalid YouTube URL or video ID: ${input}`);
}

export async function fetchVideoMeta(videoId: string): Promise<VideoMeta> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "ja,en;q=0.9",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch YouTube page: ${res.status}`);
  }

  const html = await res.text();

  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  let title = titleMatch
    ? titleMatch[1].replace(/ - YouTube$/, "").trim()
    : "Untitled";
  title = decodeHtmlEntities(title);

  let channelName = "Unknown";
  const channelMatch = html.match(/"ownerChannelName"\s*:\s*"([^"]+)"/);
  if (channelMatch) {
    channelName = decodeUnicodeEscapes(channelMatch[1]);
  } else {
    const linkMatch = html.match(
      /<link itemprop="name" content="([^"]+)">/
    );
    if (linkMatch) {
      channelName = decodeHtmlEntities(linkMatch[1]);
    }
  }

  let description = "";
  const descMatch = html.match(
    /<meta property="og:description" content="([^"]*)">/
  );
  if (descMatch) {
    description = decodeHtmlEntities(descMatch[1]);
  }

  let publishedDate = "";
  const dateMatch = html.match(
    /"(?:datePublished|uploadDate)"\s*:\s*"(\d{4}-\d{2}-\d{2})/
  );
  if (dateMatch) {
    publishedDate = dateMatch[1];
  }

  return { title, channelName, description, publishedDate };
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10))
    );
}

function decodeUnicodeEscapes(text: string): string {
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
    String.fromCodePoint(parseInt(hex, 16))
  );
}

function formatTimestamp(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

async function generateSummary(
  title: string,
  transcriptText: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const truncated =
    transcriptText.length > 12000
      ? transcriptText.slice(0, 12000) + "\n...(truncated)"
      : transcriptText;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `以下はYouTube動画「${title}」のトランスクリプトです。この内容を日本語で要約してください。

要件:
- 動画の主要なポイントを箇条書き（3〜7個）でまとめる
- 各ポイントは1〜2文で簡潔に
- 専門用語はそのまま残す
- Markdown記法で出力（見出し不要、箇条書きのみ）

トランスクリプト:
${truncated}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error: ${res.status} ${body}`);
  }

  const data = (await res.json()) as {
    content: Array<{ type: string; text: string }>;
  };
  const text = data.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("Empty response from Anthropic API");
  return text.trim();
}

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*#^[\]]/g, "")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function escapeYamlString(s: string): string {
  if (/[:"'#\[\]{}|>&*!%@`]/.test(s) || s.includes("\n")) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return `"${s}"`;
}

// ---------------------------------------------------------------------------
// Obsidian Vault sync (git commit & push)
// ---------------------------------------------------------------------------

const OBSIDIAN_VAULT_DIR = resolve(
  process.env.HOME || "/home/hal",
  "workspace/obsidian"
);

export function syncObsidianVault(log?: (msg: string) => void): void {
  const print = log || (() => {});
  try {
    const status = execSync("git status --porcelain", {
      cwd: OBSIDIAN_VAULT_DIR,
      encoding: "utf-8",
    }).trim();

    if (!status) {
      print("Obsidian vault: no changes to sync");
      return;
    }

    execSync("git add -A", { cwd: OBSIDIAN_VAULT_DIR, stdio: "pipe" });

    const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
    execSync(`git commit -m "yt-transcript: auto-sync ${timestamp}"`, {
      cwd: OBSIDIAN_VAULT_DIR,
      stdio: "pipe",
    });

    execSync("git pull --rebase && git push", {
      cwd: OBSIDIAN_VAULT_DIR,
      stdio: "pipe",
    });

    print("Obsidian vault: synced");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    print(`Obsidian vault sync failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function processVideo(opts: ProcessOptions): Promise<ProcessResult> {
  const log = opts.onProgress || (() => {});
  const preferredLang = opts.lang || "ja";
  const skipSummary = opts.skipSummary ?? false;
  const outputDir = opts.outputDir || DEFAULT_OUTPUT_DIR;

  const videoId = extractVideoId(opts.url);
  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

  log(`Fetching video metadata for ${videoId}...`);
  const meta = await fetchVideoMeta(videoId);
  log(`Title: ${meta.title}`);
  log(`Channel: ${meta.channelName}`);

  // Fetch transcript with language fallback
  const api = new YouTubeTranscriptApi();
  const langPriority =
    preferredLang === "ja"
      ? ["ja", "en"]
      : [preferredLang, "ja", "en"];
  const langs = [...new Set(langPriority)];

  log(`Fetching transcript (preferred: ${preferredLang})...`);

  let transcript;
  for (const lang of langs) {
    try {
      transcript = await api.fetch(videoId, [lang]);
      log(`Transcript found (lang: ${transcript.languageCode}, ${transcript.language})`);
      break;
    } catch {
      log(`No transcript for lang: ${lang}, trying next...`);
    }
  }

  if (!transcript) {
    try {
      transcript = await api.fetch(videoId);
      log(`Transcript found (lang: ${transcript.languageCode}, ${transcript.language})`);
    } catch {
      throw new Error("No transcript available for this video.");
    }
  }

  // Format transcript lines
  const transcriptLines = transcript.snippets.map(
    (s: { text: string; start: number }) =>
      `[${formatTimestamp(s.start)}] ${s.text}`
  );
  const transcriptText = transcriptLines.join("\n");

  // Build markdown
  const today = new Date().toISOString().split("T")[0];
  const descShort =
    meta.description.length > 200
      ? meta.description.slice(0, 200) + "..."
      : meta.description;

  const frontmatter = [
    "---",
    `title: ${escapeYamlString(meta.title)}`,
    `source: ${escapeYamlString(canonicalUrl)}`,
    "author:",
    `  - "[[${meta.channelName}]]"`,
    meta.publishedDate ? `published: ${meta.publishedDate}` : null,
    `created: ${today}`,
    `description: ${escapeYamlString(descShort)}`,
    "tags:",
    '  - "clippings"',
    '  - "youtube-transcript"',
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  let summarySection = "";
  if (!skipSummary) {
    log(`Generating summary with ${HAIKU_MODEL}...`);
    try {
      const summary = await generateSummary(meta.title, transcriptText);
      summarySection = `\n## Summary\n\n${summary}\n`;
      log("Summary generated.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`Warning: Summary generation failed (${msg}). Skipping.`);
    }
  }

  const markdown = `${frontmatter}\n${summarySection}\n## Transcript\n\n${transcriptText}\n`;

  const filename = `${sanitizeFilename(meta.title)}.md`;
  const outputPath = resolve(outputDir, filename);

  writeFileSync(outputPath, markdown, "utf-8");
  log(`Saved: ${outputPath}`);

  return {
    title: meta.title,
    channelName: meta.channelName,
    filename,
    outputPath,
    language: transcript.languageCode || preferredLang,
    hasSummary: summarySection !== "",
  };
}
