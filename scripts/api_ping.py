#!/usr/bin/env python3
"""
Stickerverse — 3-AI API 疎通確認ツール

Gemini Imagen / Claude / Grok への認証チェックと疎通確認を行う。
実際の画像生成は一切しない（コスト: Claudeのみ ~$0.000001/回）。

Usage:
  python3 scripts/api_ping.py              # .env から読む
  python3 scripts/api_ping.py --verbose    # レスポンス詳細を表示
  python3 scripts/api_ping.py --only gemini claude  # 指定APIのみ確認

前提 (.env の作り方):
  プロジェクトルートに .env を作成して以下を記述する:
    GEMINI_API_KEY=AIza...
    ANTHROPIC_API_KEY=sk-ant-...
    XAI_API_KEY=xai-...

  .env は .gitignore に含まれているので commit されない。
"""

from __future__ import annotations  # Python 3.9 以下で | 型ヒントを使うため

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


# ── ANSI カラー（ターミナル出力用）──────────────
GREEN  = '\033[92m'
RED    = '\033[91m'
YELLOW = '\033[93m'
CYAN   = '\033[96m'
GRAY   = '\033[90m'
BOLD   = '\033[1m'
RESET  = '\033[0m'

# NO_COLOR 環境変数または非TTYならカラーを無効化
if not sys.stdout.isatty() or os.environ.get('NO_COLOR'):
    GREEN = RED = YELLOW = CYAN = GRAY = BOLD = RESET = ''

VERBOSE = '--verbose' in sys.argv or '-v' in sys.argv
ONLY    = []
if '--only' in sys.argv:
    idx = sys.argv.index('--only')
    ONLY = [s.lower() for s in sys.argv[idx + 1:]]

PROJECT_ROOT = Path(__file__).parent.parent


# ══════════════════════════════════════════════
#  .env ローダー
# ══════════════════════════════════════════════

def load_env() -> dict[str, str]:
    """
    プロジェクトルートの .env を読む。
    同名の環境変数があればそちらで上書きする（CI/CD対応）。
    """
    env: dict[str, str] = {}
    env_path = PROJECT_ROOT / '.env'

    if env_path.exists():
        for raw_line in env_path.read_text(encoding='utf-8').splitlines():
            line = raw_line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, _, value = line.partition('=')
            key   = key.strip()
            value = value.strip().strip('"').strip("'")
            env[key] = value

    # 環境変数で上書き（.env より優先）
    for key in ('GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'XAI_API_KEY'):
        if key in os.environ:
            env[key] = os.environ[key]

    return env


def key_preview(key: str) -> str:
    """APIキーを先頭8文字だけ見せてマスクする"""
    if not key:
        return f'{YELLOW}(未設定){RESET}'
    return f'{GRAY}{key[:8]}...{RESET}'


# ══════════════════════════════════════════════
#  HTTP ヘルパー
# ══════════════════════════════════════════════

def _request(
    url: str,
    *,
    method: str = 'GET',
    headers: dict | None = None,
    payload: dict | None = None,
    timeout: int = 15,
) -> tuple[int, dict]:
    """
    urllib で HTTP リクエストを送り (status_code, body_dict) を返す。
    HTTPError は呼び出し元でキャッチする。
    """
    body = json.dumps(payload).encode() if payload else None
    req  = urllib.request.Request(url, data=body, headers=headers or {}, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, json.loads(resp.read())


# ══════════════════════════════════════════════
#  各 API の ping 関数
#  戻り値: (ok: bool, status_code: int, message: str, elapsed_ms: int, detail: dict)
# ══════════════════════════════════════════════

def ping_gemini(api_key: str):
    """
    Gemini Imagen 3 モデル情報エンドポイントで認証チェック。
    GET /v1beta/models/imagen-3.0-generate-001 — 無料・画像生成なし。
    """
    if not api_key:
        return False, 0, 'APIキー未設定 → .env に GEMINI_API_KEY を追加', 0, {}

    url = (
        'https://generativelanguage.googleapis.com'
        '/v1beta/models/imagen-3.0-generate-001'
        f'?key={api_key}'
    )
    t = time.monotonic()
    try:
        status, data = _request(url)
        elapsed = _ms(t)
        name = data.get('name', '?')
        desc = data.get('description', '')[:60]
        return True, status, f'モデル確認OK: {name}', elapsed, data if VERBOSE else {}
    except urllib.error.HTTPError as e:
        elapsed = _ms(t)
        body = _read_error(e)
        if e.code in (401, 403):
            return False, e.code, f'APIキーが無効です ({e.code})', elapsed, body
        return False, e.code, f'予期しないエラー: {_short(body)}', elapsed, body
    except Exception as e:
        return False, 0, f'接続失敗: {e}', _ms(t), {}


def ping_claude(api_key: str):
    """
    Claude API に最小コストのメッセージを送信して認証チェック。
    claude-haiku-4-5 + max_tokens=1 → 約 $0.000001/回。
    """
    if not api_key:
        return False, 0, 'APIキー未設定 → .env に ANTHROPIC_API_KEY を追加', 0, {}

    url = 'https://api.anthropic.com/v1/messages'
    headers = {
        'x-api-key':        api_key,
        'anthropic-version': '2023-06-01',
        'content-type':     'application/json',
    }
    # Haiku (最安) + max_tokens=1 でコストを最小化
    payload = {
        'model':     'claude-haiku-4-5-20251001',
        'max_tokens': 1,
        'messages':  [{'role': 'user', 'content': 'hi'}],
    }
    t = time.monotonic()
    try:
        status, data = _request(url, method='POST', headers=headers, payload=payload)
        elapsed = _ms(t)
        model = data.get('model', '?')
        usage = data.get('usage', {})
        msg = (
            f'OK: {model} '
            f'(入力 {usage.get("input_tokens","?")}tok / '
            f'出力 {usage.get("output_tokens","?")}tok)'
        )
        return True, status, msg, elapsed, data if VERBOSE else {}
    except urllib.error.HTTPError as e:
        elapsed = _ms(t)
        body = _read_error(e)
        err_type = body.get('error', {}).get('type', '')
        if e.code in (401, 403) or err_type == 'authentication_error':
            return False, e.code, f'APIキーが無効です ({e.code})', elapsed, body
        return False, e.code, f'予期しないエラー: {_short(body)}', elapsed, body
    except Exception as e:
        return False, 0, f'接続失敗: {e}', _ms(t), {}


def ping_grok(api_key: str):
    """
    xAI Grok API のモデルリストエンドポイントで認証チェック。
    GET /v1/models — OpenAI 互換・トークン消費なし。
    """
    if not api_key:
        return False, 0, 'APIキー未設定 → .env に XAI_API_KEY を追加', 0, {}

    url = 'https://api.x.ai/v1/models'
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type':  'application/json',
    }
    t = time.monotonic()
    try:
        status, data = _request(url, headers=headers)
        elapsed = _ms(t)
        models = [m.get('id', '') for m in data.get('data', []) if 'grok' in m.get('id', '')]
        preview = ', '.join(models[:4]) or '(モデルなし)'
        return True, status, f'モデル確認OK: {preview}', elapsed, data if VERBOSE else {}
    except urllib.error.HTTPError as e:
        elapsed = _ms(t)
        body = _read_error(e)
        if e.code in (401, 403):
            return False, e.code, f'APIキーが無効です ({e.code})', elapsed, body
        return False, e.code, f'予期しないエラー: {_short(body)}', elapsed, body
    except Exception as e:
        return False, 0, f'接続失敗: {e}', _ms(t), {}


# ── ユーティリティ ────────────────────────────
def _ms(start: float) -> int:
    return int((time.monotonic() - start) * 1000)

def _read_error(e: urllib.error.HTTPError) -> dict:
    try:
        return json.loads(e.read().decode(errors='replace'))
    except Exception:
        return {}

def _short(body: dict | str) -> str:
    text = json.dumps(body, ensure_ascii=False) if isinstance(body, dict) else str(body)
    return text[:120] + ('...' if len(text) > 120 else '')


# ══════════════════════════════════════════════
#  出力フォーマット
# ══════════════════════════════════════════════

def print_result(name: str, emoji: str, ok: bool, status: int, msg: str, elapsed: int, detail: dict):
    mark   = f'{GREEN}✓{RESET}' if ok else f'{RED}✗{RESET}'
    color  = GREEN if ok else RED
    status_str = f'HTTP {status}' if status else 'N/A      '
    elapsed_str = f'{elapsed}ms' if elapsed else '-'

    print(f'  {mark}  {BOLD}{emoji} {name}{RESET}')
    print(f'     {color}{status_str}{RESET}  {elapsed_str}')
    print(f'     {GRAY}{msg}{RESET}')

    if VERBOSE and detail:
        compact = json.dumps(detail, ensure_ascii=False, indent=2)
        for line in compact.splitlines()[:20]:
            print(f'     {GRAY}{line}{RESET}')
        if len(compact.splitlines()) > 20:
            print(f'     {GRAY}... (省略){RESET}')


def print_env_hint(env_path: Path, missing_keys: list[str]):
    print(f'\n{YELLOW}━━━ .env 設定ガイド ━━━{RESET}')
    if not env_path.exists():
        print(f'{GRAY}  .env が存在しません。以下の内容で作成してください:{RESET}')
        print(f'{GRAY}  ファイル: {env_path}{RESET}')
    else:
        print(f'{GRAY}  .env に以下のキーを追加してください:{RESET}')
    print()
    for key in missing_keys:
        print(f'{CYAN}  {key}=your_key_here{RESET}')
    print(f'\n{GRAY}  各サービスのAPIキー取得先:{RESET}')
    print(f'{GRAY}  Gemini  → https://aistudio.google.com/app/apikey{RESET}')
    print(f'{GRAY}  Claude  → https://console.anthropic.com/settings/keys{RESET}')
    print(f'{GRAY}  Grok    → https://console.x.ai/{RESET}')


# ══════════════════════════════════════════════
#  メイン
# ══════════════════════════════════════════════

def main():
    print(f'\n{BOLD}{CYAN}════════════════════════════════{RESET}')
    print(f'{BOLD}{CYAN}  Stickerverse — API Ping{RESET}')
    print(f'{BOLD}{CYAN}════════════════════════════════{RESET}')

    env_path = PROJECT_ROOT / '.env'
    env = load_env()

    if env_path.exists():
        print(f'{GRAY}  .env: {env_path}{RESET}')
    else:
        print(f'{YELLOW}  .env が見つかりません（環境変数で代替）{RESET}')
    print()

    # API定義: (id, 表示名, emoji, 環境変数名, ping関数)
    all_apis = [
        ('gemini', 'Gemini Imagen 3',   '🎨', 'GEMINI_API_KEY',    ping_gemini),
        ('claude', 'Claude (Anthropic)', '✍️ ', 'ANTHROPIC_API_KEY', ping_claude),
        ('grok',   'Grok (xAI)',         '🐦', 'XAI_API_KEY',       ping_grok),
    ]

    # --only フィルタリング
    apis = [a for a in all_apis if not ONLY or a[0] in ONLY]

    results = []
    missing_keys = []

    for api_id, name, emoji, key_name, ping_fn in apis:
        api_key = env.get(key_name, '')
        print(f'{GRAY}  {key_name}: {key_preview(api_key)}{RESET}')

        ok, status, msg, elapsed, detail = ping_fn(api_key)
        print_result(name, emoji, ok, status, msg, elapsed, detail)
        print()

        results.append((api_id, ok))
        if not api_key:
            missing_keys.append(key_name)

    # ─── サマリー ──────────────────────────────
    ok_count = sum(1 for _, ok in results if ok)
    total    = len(results)

    print(f'{BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{RESET}')
    if ok_count == total:
        print(f'{GREEN}{BOLD}  全 {total} API 疎通確認 ✓{RESET}')
        print(f'{GRAY}  FlutterFlow の App Settings に各キーを登録すれば完了{RESET}')
    else:
        print(f'{YELLOW}{BOLD}  結果: {ok_count}/{total} 疎通OK{RESET}')
        # 失敗したAPIの名前を表示
        api_map = {a[0]: a[1] for a in all_apis}
        for api_id, ok in results:
            if not ok:
                print(f'{RED}  ✗ {api_map[api_id]}: 要確認{RESET}')
    print(f'{BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{RESET}')

    if missing_keys:
        print_env_hint(env_path, missing_keys)

    print()
    sys.exit(0 if ok_count == total else 1)


if __name__ == '__main__':
    main()
