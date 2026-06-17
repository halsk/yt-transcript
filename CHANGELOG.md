# Changelog

## [Unreleased]

### Fixed
- `sanitizeFilename()` を文字数ベース (`.slice(0, 200)`) からバイト長ベース (252 byte cap) の truncate に修正。日本語タイトル (3 bytes/char) で最大 600 bytes になり Linux ext4 の 255-byte 上限を超えて残骸ファイル / 0-byte ファイル / PA-001 HTTP 500 を誘発していた問題を解消。UTF-8 文字境界で安全に切断する。

### Added
- YouTube Live URL 対応: `youtube.com/live/{id}` 形式のURLからVideo IDを抽出可能に
- vitest によるユニットテスト基盤を追加

### Changed
- エラーメッセージを日本語化
  - 無効なURL: `無効なYouTube URLです: {input}`
  - 字幕なし: `この動画には字幕（トランスクリプト）がありません。ライブ配信アーカイブの場合、自動字幕が生成されるまで数時間〜数日かかることがあります。`
