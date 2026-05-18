# Stickerverse — 3-AI統合アーキテクチャ設計書

**バージョン**: 1.0  
**更新日**: 2026-05-06  
**ステータス**: 確定（Flutter実装前レビュー済み）

---

## 1. システム概要

AIシール生成・販売アプリ。ユーザーがテーマを入力（または Grok のトレンドから自動提案）すると、Gemini Imagen がシール画像を生成し、Claude がタイトルと説明文を生成。FlutterFlow/Dreamflow 上で動作する。

### AI役割分担

| AI | 役割 | 入力 | 出力 |
|----|------|------|------|
| **Grok (xAI)** | Xトレンド取得・テーマ提案 | なし（リアルタイムX情報） | トレンドキーワード5件 |
| **Gemini Imagen 3** | シール画像生成 | 組み立て済みプロンプト | 画像データ (PNG, base64) |
| **Claude Sonnet** | タイトル・説明文生成 | スタイル名 + テーマ + 言語指定 | タイトル・説明文 (日英) |

---

## 2. データフロー図

```
┌─────────────────────────────────────────────────────────────────┐
│                        FlutterFlow App                          │
│                                                                 │
│  ┌──────────┐     ┌───────────────────────────────────────┐    │
│  │ユーザー  │     │            画面フロー                  │    │
│  │  入力   │────▶│ ホーム → スタイル選択 → テーマ入力     │    │
│  └──────────┘     │         → 生成 → プレビュー → 購入    │    │
│                   └───────────────────────────────────────┘    │
│                                    │                            │
│             ┌──────────────────────┼───────────────────┐       │
│             │                      │                   │       │
│             ▼                      ▼                   ▼       │
│   ┌──────────────┐    ┌────────────────────┐  ┌──────────────┐│
│   │ [Custom      │    │  [Custom Action]   │  │ [Custom      ││
│   │  Action]     │    │  gemini_generate   │  │  Action]     ││
│   │ grok_trends  │    │  .dart             │  │ claude_write ││
│   │ .dart        │    └────────────────────┘  │ .dart        ││
│   └──────────────┘             │               └──────────────┘│
│          │                     │                      │        │
└──────────┼─────────────────────┼──────────────────────┼────────┘
           │                     │                      │
           ▼                     ▼                      ▼
   ┌──────────────┐   ┌─────────────────────┐  ┌──────────────┐
   │  xAI Grok    │   │  Google Gemini       │  │  Anthropic   │
   │  API         │   │  Imagen 3 API        │  │  Claude API  │
   │  (HTTPS)     │   │  (HTTPS)             │  │  (HTTPS)     │
   └──────────────┘   └─────────────────────┘  └──────────────┘
          │                     │                      │
          ▼                     ▼                      ▼
   トレンドキーワード       PNG画像 (base64)      タイトル + 説明文
   5件リスト               1024×1024px           日本語 / 英語
```

### ユーザー操作シナリオ（標準フロー）

```
1. ホーム画面を開く
2. 「トレンドから選ぶ」→ grok_trends 呼び出し → キーワード5件を表示
   または「テーマを入力」→ テキスト直接入力
3. スタイルを選択 (6スタイルから1つ)
4. 「生成」ボタンタップ
5. プロンプト組み立て (クライアント側, prompts/library/ の定義に従う)
6. gemini_generate 呼び出し → 画像4枚生成・表示
7. 好みの1枚を選択
8. claude_write 呼び出し → タイトル・説明文生成
9. プレビュー確認 → 購入 or ダウンロード
```

---

## 3. プロンプト組み立て（クライアント側）

Dart コード内で以下の順序で文字列結合する。定義は `prompts/library/` の JSON を参照。

```
{sample.subject.en}
  + " " + {style.style_block}
  + ", " + {universal.stickerBlock}
  + ", " + {universal.qualityTags}
  + {universal.negative}
```

**実装例（擬似コード）**

```dart
final prompt = [
  subject,            // 例: "fluffy white cat face"
  style.styleBlock,   // styles.json の style_block フィールド
  universal.stickerBlock,
  universal.qualityTags,
].join(', ') + universal.negative;
```

---

## 4. API詳細仕様

### 4-1. Grok API（Xトレンド取得）

| 項目 | 値 |
|------|-----|
| **ベースURL** | `https://api.x.ai/v1` |
| **エンドポイント** | `POST /chat/completions` |
| **認証** | `Authorization: Bearer {XAI_API_KEY}` |
| **モデル** | `grok-3-latest` |
| **API互換性** | OpenAI互換 |

**リクエストボディ**

```json
{
  "model": "grok-3-latest",
  "messages": [
    {
      "role": "system",
      "content": "You have access to real-time X (Twitter) data. Return trending topics relevant for cute sticker designs."
    },
    {
      "role": "user",
      "content": "今のXのトレンドからシールデザインに向いているキーワードを5つ教えてください。JSONで返してください: {\"keywords\": [\"...\", \"...\", \"...\", \"...\", \"...\"]}"
    }
  ],
  "temperature": 0.7
}
```

**レスポンス（期待値）**

```json
{
  "choices": [{
    "message": {
      "content": "{\"keywords\": [\"桜\", \"推し活\", \"春コーデ\", \"新生活\", \"猫カフェ\"]}"
    }
  }]
}
```

**Flutter実装ファイル**: `flutter_actions/api_calls/grok_trends.dart`

---

### 4-2. Gemini Imagen 3 API（シール画像生成）

| 項目 | 値 |
|------|-----|
| **ベースURL** | `https://generativelanguage.googleapis.com` |
| **エンドポイント** | `POST /v1beta/models/imagen-3.0-generate-001:predict` |
| **認証** | `?key={GEMINI_API_KEY}` (クエリパラメータ) |
| **出力形式** | base64 PNG |
| **生成枚数** | 4枚（ユーザーが1枚選択）|
| **推奨サイズ** | 1024×1024px (`1:1` aspectRatio) |

**リクエストボディ**

```json
{
  "instances": [
    {
      "prompt": "{組み立て済みプロンプト}"
    }
  ],
  "parameters": {
    "sampleCount": 4,
    "aspectRatio": "1:1",
    "safetyFilterLevel": "BLOCK_ONLY_HIGH",
    "personGeneration": "DONT_ALLOW"
  }
}
```

**レスポンス（期待値）**

```json
{
  "predictions": [
    { "bytesBase64Encoded": "iVBORw0KGgo...", "mimeType": "image/png" },
    { "bytesBase64Encoded": "iVBORw0KGgo...", "mimeType": "image/png" },
    { "bytesBase64Encoded": "iVBORw0KGgo...", "mimeType": "image/png" },
    { "bytesBase64Encoded": "iVBORw0KGgo...", "mimeType": "image/png" }
  ]
}
```

**Flutter実装ファイル**: `flutter_actions/api_calls/gemini_generate.dart`

---

### 4-3. Claude API（タイトル・説明文生成）

| 項目 | 値 |
|------|-----|
| **ベースURL** | `https://api.anthropic.com` |
| **エンドポイント** | `POST /v1/messages` |
| **認証** | `x-api-key: {ANTHROPIC_API_KEY}` |
| **必須ヘッダー** | `anthropic-version: 2023-06-01` |
| **モデル** | `claude-sonnet-4-6` |
| **出力** | タイトル（20字以内）+ 説明文（80字以内）× 日英 |

**リクエストボディ**

```json
{
  "model": "claude-sonnet-4-6",
  "max_tokens": 300,
  "messages": [
    {
      "role": "user",
      "content": "シールの商品情報を生成してください。\n\nスタイル: {style_label_ja}（{style_label_en}）\nテーマ: {subject_ja}\n\n以下のJSONで返してください:\n{\"title_ja\": \"タイトル（20字以内）\", \"title_en\": \"Title (under 30 chars)\", \"desc_ja\": \"説明文（80字以内、魅力的に）\", \"desc_en\": \"Description (under 100 chars)\"}"
    }
  ]
}
```

**レスポンス（期待値）**

```json
{
  "content": [{
    "text": "{\"title_ja\": \"ぷにぷにネコシール\", \"title_en\": \"Puffy Cat Sticker\", \"desc_ja\": \"ふわもこの白猫がぷにぷにシールになった！毎日使いたくなる愛くるしさ。\", \"desc_en\": \"A fluffy white cat turned into the cutest puffy sticker ever.\"}"
  }]
}
```

**Flutter実装ファイル**: `flutter_actions/api_calls/claude_write.dart`

---

## 5. 認証キー管理

FlutterFlow では Custom Actions に直接APIキーを埋め込まない。

| キー | 管理方法 | FlutterFlow実装 |
|------|---------|----------------|
| `GEMINI_API_KEY` | FlutterFlow > App Settings > API Keys（暗号化） | `FFAppConstants.geminiApiKey` |
| `XAI_API_KEY` | 同上 | `FFAppConstants.xaiApiKey` |
| `ANTHROPIC_API_KEY` | 同上 | `FFAppConstants.anthropicApiKey` |

> **セキュリティ方針**: 本番環境では各APIキーをバックエンドプロキシ（Firebase Functions 等）経由で呼び出すことを推奨。MVP段階ではクライアント直呼びを許容するが、キーのローテーション運用を前提とする。

---

## 6. エラーハンドリング方針

### 共通方針

- タイムアウト: 全APIコール 30 秒
- リトライ: 最大 2 回（指数バックオフ: 1秒 → 3秒）
- 失敗時: ユーザーにトースト通知 + ローカルフォールバック表示

### API別エラー対応

| API | エラーコード | 対応 |
|-----|------------|------|
| Gemini Imagen | 400 Bad Request | プロンプトのネガティブキーワード警告をユーザーに表示 |
| Gemini Imagen | 429 Too Many Requests | リトライ後、「少し待ってください」表示 |
| Gemini Imagen | SafetyFilter ブロック | 「このテーマは生成できません」表示、テーマ変更を促す |
| Grok | 401 Unauthorized | APIキー確認を管理者に通知（ユーザーには「トレンド取得できません」） |
| Grok | 失敗全般 | フォールバック: ローカルのサンプルキーワードリスト5件を表示 |
| Claude | 429 / 5xx | リトライ後、フォールバック: 汎用テンプレートタイトル・説明文を使用 |

### Grok フォールバックキーワードリスト（ローカル定義）

```dart
const fallbackTrendKeywords = [
  '猫', '桜', '推しキャラ', 'カフェ', '韓国風'
];
```

---

## 7. コスト試算

### 前提
- 1回のシール生成 = Grok 1呼び出し + Gemini 4枚生成 + Claude 1呼び出し
- Grok は全ユーザーで共有キャッシュ（5分TTL）を使うため、実質呼び出し頻度 = ユーザー数/5分

### 1生成あたりのコスト（概算）

| API | 単価 | 1回あたり消費 | コスト |
|-----|------|--------------|--------|
| **Gemini Imagen 3** | $0.040 / 画像 | 4枚 | **$0.160** |
| **Grok grok-3-latest** | $3.00 / 1M入力トークン, $15.00 / 1M出力トークン | 入力 200tok + 出力 50tok | **$0.0014** |
| **Claude claude-sonnet-4-6** | $3.00 / 1M入力, $15.00 / 1M出力 | 入力 200tok + 出力 150tok | **$0.0028** |
| | | **合計** | **≈ $0.164** |

### 月次コスト試算

| 月間生成数 | 月次コスト |
|-----------|-----------|
| 100回 | ≈ $16.40 |
| 500回 | ≈ $82.00 |
| 1,000回 | ≈ $164.00 |
| 5,000回 | ≈ $820.00 |

> **支配的コスト**: Gemini Imagen が全体の約97%。コスト削減するなら生成枚数を4→2枚に減らす（$0.08/回 → ≈$84/月 @ 1,000回）。

---

## 8. FlutterFlow 統合メモ

### Custom Actions として実装する3ファイル

```
flutter_actions/api_calls/
├── gemini_generate.dart   # Future<List<String>> generateStickerImages(String prompt)
├── claude_write.dart      # Future<Map<String, String>> generateStickerText(String styleLabelJa, String subject)
└── grok_trends.dart       # Future<List<String>> fetchTrendKeywords()
```

### FlutterFlowへの貼り付け手順

1. FlutterFlow プロジェクト > **Custom Code** > **Custom Actions**
2. 各ファイルの内容をペースト
3. `http` パッケージの依存を `pubspec.yaml` に追記 (`http: ^1.2.0`)
4. App Settings > API Keys に各キーを登録
5. Action Flow Editor で各画面のボタンにアクションを接続

### 呼び出し順序（生成フロー）

```
①「生成」タップ
    → [Option A] fetchTrendKeywords() が未実行なら呼び出し（テーマがトレンドの場合）
    → generateStickerImages(prompt) 呼び出し（並列4枚）
    → ユーザーが1枚選択
    → generateStickerText(style, subject) 呼び出し
    → プレビュー画面に遷移
```

---

## 9. 将来の拡張候補（MVP後）

| 拡張 | 理由 | 優先度 |
|------|------|--------|
| バックエンドプロキシ化 | APIキーのクライアント露出を防ぐ | 高（有料リリース前に必須） |
| Grokキャッシュのサーバー管理 | 同じトレンドを全ユーザーが個別に取得するコスト削減 | 中 |
| 生成枚数のユーザー設定化 | 2枚/4枚を選択可能にしてコスト透明化 | 低 |
| Stripe/RevenueCat 課金統合 | 販売フロー実装 | 高（MVP後即時） |
