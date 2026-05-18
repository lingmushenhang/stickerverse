# Stickerverse — CLAUDE.md

AIシール生成・販売アプリ。3つのAIを役割分担して統合する。

## プロジェクト概要

| 項目 | 内容 |
|------|------|
| アプリ名 | Stickerverse |
| 目的 | AIシール生成・販売 |
| 最終成果物 | FlutterFlow/Dreamflow に貼り付けるDartコード |
| AI構成 | Gemini Imagen（画像生成）/ Grok（Xトレンド）/ Claude（ライティング） |

## 現在のディレクトリ構造

```
stickerverse/
├── CLAUDE.md                        ← このファイル
├── docs/
│   ├── architecture.md              ← 設計書 (TODO: claude.aiの内容を移植)
│   ├── product_spec.md              ← 仕様書 (TODO: Flutter実装前に詳細確定)
│   └── decisions/                   ← 設計判断ログ置き場 (空)
├── prompts/
│   ├── README.md                    ← プロンプト構築ルール説明
│   └── library/
│       ├── index.json               ← バージョン管理・メタ情報
│       ├── styles.json              ← 6スタイル定義 + universal block ✅完成
│       └── samples.json             ← 30本サンプル ✅完成
├── flutter_actions/
│   ├── README.md
│   ├── api_calls/                   ← Dartコード置き場 (未着手)
│   └── widgets/                     ← カスタムウィジェット置き場 (未着手)
├── prototype/
│   └── react/                       ← Reactプロトタイプ置き場 (ファイル未移動)
└── scripts/
    └── validate_library.py          ← ライブラリ整合性検証スクリプト ✅
```

## 完了済み

- [x] プロジェクトディレクトリ構造の作成
- [x] `prompts/library/styles.json` — 6スタイル全件 + universal block
- [x] `prompts/library/samples.json` — 30サンプル全件 (各スタイル5本、日英バイリンガル)
- [x] `scripts/validate_library.py` — 整合性検証スクリプト (全9項目パス)

## プロンプトライブラリ v1.1 仕様

### 6スタイル一覧

| id | 日本語名 | スコア | showcase sample |
|----|---------|--------|-----------------|
| `bonbon_drop` | ボンボン | 90 | `bonbon_drop_cat` |
| `wet_pop` | うるちゅる | 98 | `wet_pop_butterfly` |
| `encyclopedia` | 図鑑 | 96 | `encyclopedia_amethyst` |
| `puni_puni` | ぷにぷに | 97 | `puni_puni_paw` |
| `heisei_retro` | 平成 | 96 | `heisei_retro_keitai` |
| `anime` | アニメ | 96 | `anime_magical_girl` |

### プロンプト組み立て順序

```
{sample.subject.en}
+ {style.style_block}
+ {universal.stickerBlock}
+ {universal.qualityTags}
+ {universal.negative}
```

### 検証コマンド

```bash
python3 scripts/validate_library.py
```

## 次にやること (優先順)

### A) `docs/architecture.md` を完成させる
- claude.aiで作成した3-AI統合アーキテクチャ設計書の内容をここに移植する
- Flutter実装の判断基準になるため、実装前に確定しておく

### B) `docs/product_spec.md` を完成させる
- 画面フロー・主要機能の詳細を確定する
- FlutterFlow固有の制約もここに記録する

### C) `flutter_actions/api_calls/` のDartコード実装
優先度順:
1. `gemini_generate.dart` — Gemini Imagen API呼び出し
2. `claude_write.dart` — Claude API呼び出し（タイトル・説明文生成）
3. `grok_trends.dart` — Grok API呼び出し（Xトレンド取得）

### D) `prototype/react/` へのReactコードの移動
- claude.aiで作成したUIプロトタイプをここに配置する
- Flutter実装時の参照元として活用

## 備考

- samples.jsonの `style_block` はstyles.jsonから参照する設計（重複保存しない）
- FlutterFlow/Dreamflowに貼り付けることを前提にDartコードを書く
- Reactプロトタイプは設計検証の証拠として残す（削除しない）

---

## 次回再開時のメモ (2026-05-07 朝セッション)

### 完了したこと
- [x] `docs/architecture.md` 完成（344行、API仕様・コスト試算・エラーハンドリング・FlutterFlow統合メモ）
- [x] `flutter_actions/api_calls/gemini_generate.dart` 完成（384行）+ example.dart
- [x] `flutter_actions/api_calls/claude_write.dart` 完成（467行）+ example.dart
- [x] `.gitignore` 作成 + `git init` 済み（重要資産の明示的追跡保護込み）
- [x] `scripts/api_ping.py` 作成（3-AI疎通確認、`--only` / `--verbose` フラグ対応）
- [x] `scripts/preview_prompt.py` 作成（プロンプトプレビュー、`--list` / `--style` / `--lang` / `--copy` フラグ対応）

### 中断したこと — zsh エイリアス設定
- 衝突チェック完了: `sv`, `svc`, `svv`, `svping`, `svp`, `svpc`, `svpl`, `svstat`, `svdiff` すべて未使用
- `~/.zshrc` は存在せず → 新規作成が必要
- 設計案確定済み: 9エイリアス + `svp`/`svpc` 関数 + `svping`/`svpl` の zsh completion
- **書き込み未実施**（次回冒頭で実施する）

### 次回再開タスク（優先順）
1. `~/.zshrc` 新規作成（設計済み内容を採用）
2. エイリアス動作確認（`svc`, `svping`, `svpl` 等をテスト）
3. `grok_trends.dart` 実装（3-AI統合の最後のピース）
4. `scripts/api_ping.py` で全API疎通テスト（`.env` に実キーを設定してから）
