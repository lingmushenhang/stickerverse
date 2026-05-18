#!/usr/bin/env python3
"""Prompt Library v1.1 integrity validator"""

import json
from pathlib import Path

BASE = Path(__file__).parent.parent / "prompts" / "library"

def load(name):
    with open(BASE / name) as f:
        return json.load(f)

styles_data = load("styles.json")
samples_data = load("samples.json")

styles  = styles_data["styles"]
samples = samples_data["samples"]
universal = styles_data.get("universal", {})

results = []
ok = True

def check(label, passed, detail=""):
    global ok
    mark = "✅" if passed else "⚠️ "
    if not passed:
        ok = False
    results.append(f"{mark} {label}" + (f"\n     → {detail}" if detail else ""))

# ── 1. 数値検証 ────────────────────────────────────────────
check("スタイル数 == 6", len(styles) == 6,
      f"実際: {len(styles)}")

check("サンプル数 == 30", len(samples) == 30,
      f"実際: {len(samples)}")

style_ids = [s["id"] for s in styles]
counts = {sid: 0 for sid in style_ids}
for s in samples:
    sid = s.get("style_id")
    if sid in counts:
        counts[sid] += 1
    else:
        counts[sid] = 1

all_five = all(v == 5 for v in counts.values())
detail = ", ".join(f"{k}:{v}" for k, v in counts.items())
check("各スタイル5サンプルずつ", all_five, detail)

# ── 2. 構造検証 ────────────────────────────────────────────
REQUIRED = ["id", "style_id", "labels", "subject", "showcase", "verified_score"]
missing_fields = []
for s in samples:
    for field in REQUIRED:
        if field not in s:
            missing_fields.append(f"{s.get('id','?')}.{field}")
    if "labels" in s:
        for lang in ["ja", "en"]:
            if lang not in s["labels"]:
                missing_fields.append(f"{s.get('id','?')}.labels.{lang}")
    if "subject" in s:
        for lang in ["ja", "en"]:
            if lang not in s["subject"]:
                missing_fields.append(f"{s.get('id','?')}.subject.{lang}")

check("全サンプル必須フィールド完備",
      len(missing_fields) == 0,
      ", ".join(missing_fields) if missing_fields else "")

showcase_samples = [s for s in samples if s.get("showcase") is True]
check("showcase:true == 6件",
      len(showcase_samples) == 6,
      f"実際: {len(showcase_samples)}件 → {[s['id'] for s in showcase_samples]}")

mismatch = []
for style in styles:
    sid = style["id"]
    expected_showcase_id = style.get("showcase_sample_id")
    if expected_showcase_id is None:
        mismatch.append(f"{sid}: showcase_sample_id が null")
        continue
    matched = next((s for s in samples if s["id"] == expected_showcase_id), None)
    if matched is None:
        mismatch.append(f"{sid}: '{expected_showcase_id}' がsamples.jsonに存在しない")
    elif not matched.get("showcase"):
        mismatch.append(f"{sid}: '{expected_showcase_id}' のshowcase がtrue でない")

check("showcase_sample_id ↔ samples.json 整合",
      len(mismatch) == 0,
      ", ".join(mismatch) if mismatch else "")

# ── 3. プロンプトビルダー構造 ──────────────────────────────
u_keys = set(universal.keys())
required_u = {"stickerBlock", "qualityTags", "negative"}
check("universal block (stickerBlock/qualityTags/negative) 存在",
      required_u <= u_keys,
      f"欠損: {required_u - u_keys}" if not required_u <= u_keys else "")

styles_with_block = [s for s in styles if s.get("style_block")]
check("全スタイルに style_block あり",
      len(styles_with_block) == len(styles),
      f"style_block 欠損: {[s['id'] for s in styles if not s.get('style_block')]}")

# プロンプト組み立てサンプル（最初の1件）
sample_0 = samples[0]
style_0 = next(s for s in styles if s["id"] == sample_0["style_id"])
prompt_preview = " ".join([
    sample_0["subject"]["en"],
    style_0["style_block"],
    universal["stickerBlock"],
    universal["qualityTags"],
    universal["negative"],
])
check("プロンプト組み立てテスト (samples[0])",
      len(prompt_preview) > 50,
      f"先頭80文字: {prompt_preview[:80]}…")

# ── 出力 ─────────────────────────────────────────────────
print("\n=== Stickerverse Prompt Library v1.1 検証レポート ===\n")
for r in results:
    print(r)
print()
if ok:
    print("🎉 v1.1 検証完了 — ライブラリ整合性 OK")
else:
    print("🔧 修正必要 — 上記 ⚠️ 項目を確認してください")
