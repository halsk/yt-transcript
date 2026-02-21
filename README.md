# yt-transcript

YouTube動画のトランスクリプト（字幕）を取得し、AI要約付きのMarkdownファイルとしてObsidianに保存するCLI & HTTPサーバー。

## Features

- YouTube動画のトランスクリプトを自動取得（APIキー不要）
- Claude Haiku による日本語要約を自動生成
- Obsidian Clippings互換のYAML frontmatter付きMarkdown出力
- 言語フォールバック（ja → en → auto）
- Obsidian安全なファイル名サニタイズ
- HTTPサーバー（モバイル対応Webフォーム + JSON API）
- 保存後にObsidian Vault自動同期（git commit & push）

## Setup

```bash
git clone https://github.com/halsk/yt-transcript.git
cd yt-transcript
npm install
```

### API Key

AI要約を使う場合、`.env` ファイルを作成:

```bash
cp .env.example .env
# .env を編集して ANTHROPIC_API_KEY を設定
```

APIキーなしでも動作します（要約のみスキップ）。

## CLI Usage

```bash
# 基本（日本語字幕優先 + AI要約）
npm run transcript -- https://www.youtube.com/watch?v=xxxxx

# 短縮URL
npm run transcript -- https://youtu.be/xxxxx

# 言語指定
npm run transcript -- https://youtu.be/xxxxx --lang en

# 要約なし（トランスクリプトのみ）
npm run transcript -- https://youtu.be/xxxxx --no-summary

# Obsidian同期をスキップ
npm run transcript -- https://youtu.be/xxxxx --no-sync

# 出力先を指定
npm run transcript -- https://youtu.be/xxxxx --out ./output
```

## HTTP Server

### 起動

```bash
# 開発
npm run serve

# 本番（要 npm run build）
npm run build
npm start
```

デフォルトで `0.0.0.0:3456` でリッスン（`PORT` 環境変数で変更可）。

### エンドポイント

| Method | Path | 説明 |
|--------|------|------|
| GET | `/` | モバイル対応Webフォーム |
| POST | `/api/transcript` | JSON API |
| GET | `/health` | ヘルスチェック |

### API

```bash
curl -X POST http://localhost:3456/api/transcript \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://youtu.be/xxxxx","skipSummary":true}'
```

リクエスト:
```json
{
  "url": "https://youtu.be/xxxxx",
  "lang": "ja",
  "skipSummary": false
}
```

レスポンス:
```json
{
  "title": "動画タイトル",
  "channelName": "チャンネル名",
  "filename": "動画タイトル.md",
  "outputPath": "/home/hal/workspace/obsidian/Clippings/動画タイトル.md",
  "language": "ja",
  "hasSummary": true
}
```

### iOS ショートカット設定

Tailscale経由でスマホから使用:

1. ショートカットアプリで「YT Transcript」を作成
2. 共有シート入力を「URL」に設定
3. 「URLの内容を取得」アクション追加:
   - URL: `http://<tailscale-hostname>:3456/api/transcript`
   - Method: POST
   - Content-Type: `application/json`
   - Body: `{"url":"(共有シートの入力)"}`
4. 「通知を表示」で結果を表示

## Output

デフォルトでは `~/workspace/obsidian/Clippings/` に以下の形式で保存（`--out` で変更可）:

```markdown
---
title: "動画タイトル"
source: "https://www.youtube.com/watch?v=xxxxx"
author:
  - "[[チャンネル名]]"
published: 2025-01-15
created: 2026-02-22
description: "動画の説明（先頭200文字）"
tags:
  - "clippings"
  - "youtube-transcript"
---

## Summary

- ポイント1
- ポイント2
- ポイント3

## Transcript

[00:00] こんにちは
[00:05] 今日のテーマは...
```

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude Haiku summary | No (summary skipped if not set) |
| `PORT` | HTTP server port (default: 3456) | No |

## License

MIT
