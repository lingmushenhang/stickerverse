# Prompts

## library/
- `index.json` — バージョン・メタ情報
- `styles.json` — 6スタイル定義 + Gemini修飾語
- `samples.json` — 30本サンプル (スタイル×5本、日英バイリンガル)

## templates/
Gemini Imagen へ送信するプロンプトのベーステンプレート。
`{subject}` と `{style_modifiers}` を差し込んで使う。

## プロンプト構築ルール

```
[subject.en] + [style.gemini_modifiers] + [固定サフィックス]
```

固定サフィックス例:
`sticker design, white background, no shadow, flat illustration`
