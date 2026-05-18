#!/usr/bin/env python3
"""
Stickerverse — プロンプトプレビュー & コピーツール

組み立て順序 (CLAUDE.md 仕様準拠):
  subject.en + style_block + stickerBlock + qualityTags + negative

Usage:
  python3 scripts/preview_prompt.py bonbon_drop_cat         # 英語プロンプト表示
  python3 scripts/preview_prompt.py bonbon_drop_cat --lang ja  # 日本語主題で表示
  python3 scripts/preview_prompt.py bonbon_drop_cat --copy  # クリップボードにコピー
  python3 scripts/preview_prompt.py --list                  # 全サンプルID一覧
  python3 scripts/preview_prompt.py --list --style wet_pop  # スタイル絞り込み

exit code:
  0: 成功
  1: サンプルID不在 / 引数エラー
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


# ── ANSI カラー ──────────────────────────────
GREEN  = '\033[92m'
RED    = '\033[91m'
YELLOW = '\033[93m'
CYAN   = '\033[96m'
MAGENTA= '\033[95m'
GRAY   = '\033[90m'
BOLD   = '\033[1m'
DIM    = '\033[2m'
RESET  = '\033[0m'

if not sys.stdout.isatty() or os.environ.get('NO_COLOR'):
    GREEN = RED = YELLOW = CYAN = MAGENTA = GRAY = BOLD = DIM = RESET = ''

PROJECT_ROOT  = Path(__file__).parent.parent
STYLES_PATH   = PROJECT_ROOT / 'prompts' / 'library' / 'styles.json'
SAMPLES_PATH  = PROJECT_ROOT / 'prompts' / 'library' / 'samples.json'


# ══════════════════════════════════════════════
#  データロード
# ══════════════════════════════════════════════

def load_library() -> tuple[dict, dict]:
    """
    styles.json と samples.json を読み込み、
    (styles_data, samples_data) を返す。
    ファイルが読めなければエラーを出して終了。
    """
    for path in (STYLES_PATH, SAMPLES_PATH):
        if not path.exists():
            _die(f'ファイルが見つかりません: {path}')
    try:
        styles_data  = json.loads(STYLES_PATH.read_text(encoding='utf-8'))
        samples_data = json.loads(SAMPLES_PATH.read_text(encoding='utf-8'))
    except json.JSONDecodeError as e:
        _die(f'JSON パースエラー: {e}')
    return styles_data, samples_data


def build_indexes(styles_data: dict, samples_data: dict) -> tuple[dict, dict]:
    """
    高速アクセス用のインデックスを作る。
    styles_index: style_id → style_dict
    samples_index: sample_id → sample_dict
    """
    styles_index  = {s['id']: s for s in styles_data['styles']}
    samples_index = {s['id']: s for s in samples_data['samples']}
    return styles_index, samples_index


# ══════════════════════════════════════════════
#  プロンプト組み立て
# ══════════════════════════════════════════════

def assemble_prompt(sample: dict, style: dict, universal: dict, lang: str) -> str:
    """
    CLAUDE.md 仕様に従ってプロンプトを組み立てる。

    {subject.lang}, {style_block}, {stickerBlock}, {qualityTags}{negative}
    ※ negative は '. Avoid: ...' で始まるので直接結合
    """
    subject = sample['subject'][lang]
    parts = [
        subject,
        style['style_block'],
        universal['stickerBlock'],
        universal['qualityTags'],
    ]
    return ', '.join(parts) + universal['negative']


# ══════════════════════════════════════════════
#  表示: プロンプト詳細ビュー
# ══════════════════════════════════════════════

def print_prompt_detail(sample: dict, style: dict, universal: dict, lang: str):
    """プロンプトを色分けしてセクション別に表示する"""
    sample_id   = sample['id']
    label_ja    = sample['labels']['ja']
    label_en    = sample['labels']['en']
    style_label = f"{style['labels']['ja']} ({style['id']})"
    score       = sample.get('verified_score', '?')
    is_showcase = sample.get('showcase', False)

    # ─ ヘッダー ──────────────────────────────
    print(f'\n{BOLD}{CYAN}════ Prompt Preview ════{RESET}')
    print(f'  {BOLD}サンプル{RESET}: {sample_id}')
    print(f'  {GRAY}ラベル  : {label_en} / {label_ja}{RESET}')
    print(f'  {GRAY}スタイル: {style_label}  スコア: {YELLOW}★{score}{RESET}', end='')
    if is_showcase:
        print(f'  {CYAN}[showcase]{RESET}')
    else:
        print()

    lang_label = '英語 (en)' if lang == 'en' else '日本語 (ja)'
    print(f'  {GRAY}言語    : {lang_label}{RESET}')

    # ─ セクション別表示 ───────────────────────
    subject     = sample['subject'][lang]
    style_block = style['style_block']
    sticker_blk = universal['stickerBlock']
    quality     = universal['qualityTags']
    negative    = universal['negative']

    _section('SUBJECT',       subject,     GREEN)
    _section('STYLE BLOCK',   style_block, CYAN)
    _section('STICKER BLOCK', sticker_blk, MAGENTA)
    _section('QUALITY TAGS',  quality,     YELLOW)
    _section('NEGATIVE',      negative,    GRAY)

    # ─ 完成プロンプト ─────────────────────────
    full = assemble_prompt(sample, style, universal, lang)
    char_count = len(full)
    token_est  = round(char_count / 4)  # 英語は4文字≒1トークンの概算

    print(f'\n{BOLD}━━━ 完成プロンプト ━━━{RESET}')
    # 80文字ごとに折り返して読みやすくする
    for chunk in _wrap(full, 80):
        print(f'  {chunk}')

    print(f'\n  {GRAY}文字数: {char_count}  /  トークン推定: ~{token_est}tok{RESET}')


def _section(label: str, content: str, color: str):
    """セクションをボーダー付きで表示する"""
    bar   = '─' * (46 - len(label))
    print(f'\n  {DIM}┌─ {label} {bar}{RESET}')
    for line in _wrap(content, 76):
        print(f'  {color}│{RESET} {line}')
    print(f'  {DIM}└{"─" * 48}{RESET}')


def _wrap(text: str, width: int) -> list[str]:
    """テキストを指定幅で折り返す"""
    lines = []
    while len(text) > width:
        # スペースで区切れる位置を探す
        pos = text.rfind(' ', 0, width)
        if pos == -1:
            pos = width
        lines.append(text[:pos])
        text = text[pos:].lstrip()
    if text:
        lines.append(text)
    return lines or ['']


# ══════════════════════════════════════════════
#  表示: サンプル一覧ビュー
# ══════════════════════════════════════════════

def print_list(styles_data: dict, samples_data: dict, filter_style: str | None):
    """スタイルグループ別にサンプル一覧を表示する"""
    styles_index = {s['id']: s for s in styles_data['styles']}
    samples      = samples_data['samples']

    if filter_style and filter_style not in styles_index:
        _die(f'スタイルID "{filter_style}" が見つかりません\n'
             f'  利用可能: {", ".join(styles_index.keys())}', code=1)

    total = len(samples)
    filtered = [s for s in samples if not filter_style or s['style_id'] == filter_style]

    title = f'サンプル一覧 ({len(filtered)}/{total}件)'
    if filter_style:
        title += f'  [絞り込み: {filter_style}]'
    print(f'\n{BOLD}{CYAN}════ {title} ════{RESET}')

    # スタイルごとにグループ化
    current_style = None
    for sample in filtered:
        sid = sample['style_id']
        if sid != current_style:
            current_style = sid
            style = styles_index.get(sid, {})
            emoji  = style.get('emoji', '•')
            lbl_ja = style.get('labels', {}).get('ja', sid)
            lbl_en = style.get('labels', {}).get('en', sid)
            score  = style.get('verified_score', '?')
            print(f'\n  {emoji} {BOLD}{sid}{RESET}  {GRAY}{lbl_ja} / {lbl_en}  ★{score}{RESET}')

        showcase_mark = f'  {CYAN}★ showcase{RESET}' if sample.get('showcase') else ''
        s_score = sample.get('verified_score', '?')
        label   = sample['labels']['en']
        print(
            f'    {GREEN}{sample["id"]:<34}{RESET}'
            f'{GRAY}[{s_score}]{RESET}'
            f'{showcase_mark}'
            f'  {DIM}{label}{RESET}'
        )

    print()
    print(f'  {GRAY}使い方: python3 scripts/preview_prompt.py <sample_id>{RESET}')
    print()


# ══════════════════════════════════════════════
#  クリップボードコピー（macOS）
# ══════════════════════════════════════════════

def copy_to_clipboard(text: str):
    """pbcopy でクリップボードにコピーする"""
    try:
        subprocess.run(['pbcopy'], input=text.encode('utf-8'), check=True)
        print(f'\n  {GREEN}✓ クリップボードにコピーしました{RESET}')
        print(f'  {GRAY}（{len(text)}文字）{RESET}')
    except FileNotFoundError:
        print(f'\n  {YELLOW}⚠ pbcopy が見つかりません（macOS 以外では動作しません）{RESET}')
    except subprocess.CalledProcessError as e:
        print(f'\n  {RED}✗ コピー失敗: {e}{RESET}')


# ══════════════════════════════════════════════
#  ユーティリティ
# ══════════════════════════════════════════════

def _die(message: str, code: int = 1):
    print(f'{RED}エラー: {message}{RESET}', file=sys.stderr)
    sys.exit(code)


def _usage():
    print(__doc__)
    sys.exit(0)


# ══════════════════════════════════════════════
#  引数パース（argparse 不使用、stdlib 依存ゼロ）
# ══════════════════════════════════════════════

def parse_args(argv: list[str]) -> dict:
    args = {
        'sample_id':    None,
        'lang':         'en',
        'copy':         False,
        'list':         False,
        'style_filter': None,
    }

    i = 1
    while i < len(argv):
        tok = argv[i]
        if tok in ('-h', '--help'):
            _usage()
        elif tok == '--list':
            args['list'] = True
        elif tok == '--copy':
            args['copy'] = True
        elif tok == '--lang':
            i += 1
            if i >= len(argv) or argv[i] not in ('ja', 'en'):
                _die('--lang の値は "ja" または "en" にしてください')
            args['lang'] = argv[i]
        elif tok == '--style':
            i += 1
            if i >= len(argv):
                _die('--style の後にスタイルIDを指定してください')
            args['style_filter'] = argv[i]
        elif not tok.startswith('-'):
            if args['sample_id'] is not None:
                _die(f'サンプルIDは1つだけ指定してください')
            args['sample_id'] = tok
        else:
            _die(f'不明なオプション: {tok}')
        i += 1

    return args


# ══════════════════════════════════════════════
#  メイン
# ══════════════════════════════════════════════

def main():
    args = parse_args(sys.argv)

    styles_data, samples_data = load_library()
    styles_index, samples_index = build_indexes(styles_data, samples_data)

    # ── --list モード ────────────────────────
    if args['list']:
        print_list(styles_data, samples_data, args['style_filter'])
        sys.exit(0)

    # ── プレビューモード ─────────────────────
    if args['sample_id'] is None:
        # 引数なし: ヘルプを表示
        _usage()

    sample_id = args['sample_id']
    if sample_id not in samples_index:
        # 候補を提案（部分一致）
        candidates = [sid for sid in samples_index if sample_id in sid]
        msg = f'サンプルID "{sample_id}" が見つかりません。'
        if candidates:
            msg += f'\n  もしかして: {", ".join(candidates[:5])}'
        else:
            msg += f'\n  --list で全サンプルIDを確認してください。'
        _die(msg, code=1)

    sample = samples_index[sample_id]
    style  = styles_index.get(sample['style_id'])
    if style is None:
        _die(f'スタイル "{sample["style_id"]}" が styles.json に見つかりません')

    universal = styles_data['universal']
    lang      = args['lang']

    # プレビュー表示
    print_prompt_detail(sample, style, universal, lang)

    # クリップボードコピー
    if args['copy']:
        full = assemble_prompt(sample, style, universal, lang)
        copy_to_clipboard(full)

    print()
    sys.exit(0)


if __name__ == '__main__':
    main()
