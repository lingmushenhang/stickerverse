#!/usr/bin/env python3
"""
Stickerverse - Notion 自動画像アップローダー

~/Desktop/_To_Notion/ フォルダに画像ファイルを入れると、
Notion「Stickerverse 画像図鑑」DB に自動登録します。

Usage:
  python3 notion_uploader.py
  python3 notion_uploader.py --watch  # 常時監視モード（5秒ごとにチェック）

ファイル名のルール:
  キャラ名.png       → タイトル「キャラ名」、タグ「キャラ」で登録
  シーン_xxx.jpg     → タイトル「xxx」、タグ「シーン」で登録
  アイテム_yyy.png   → タイトル「yyy」、タグ「アイテム」で登録
"""

import os
import sys
import time
import shutil
from pathlib import Path
from datetime import datetime

# 設定 ====================================
WATCH_DIR = Path.home() / "Desktop" / "_To_Notion"
DONE_DIR = WATCH_DIR / "_done"
SUPPORTED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}

# .env から読み込む（または環境変数）
def load_env():
    """~/Desktop/stickerverse/.env から設定を読む"""
    env_path = Path.home() / "Desktop" / "stickerverse" / ".env"
    config = {}
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    config[key.strip()] = value.strip().strip('"').strip("'")
    return config

config = load_env()
NOTION_TOKEN = config.get("NOTION_API_KEY") or os.environ.get("NOTION_API_KEY", "")
DATABASE_ID = config.get("NOTION_DATABASE_ID") or os.environ.get(
    "NOTION_DATABASE_ID", "975649d30acb4e02ad2d8a4aaf62a7e5"
)

# カラー出力 ================================
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
GRAY = "\033[90m"
BOLD = "\033[1m"
RESET = "\033[0m"

def log_ok(msg):
    print(f"{GREEN}✓{RESET} {msg}")

def log_warn(msg):
    print(f"{YELLOW}⚠{RESET}  {msg}")

def log_error(msg):
    print(f"{RED}✗{RESET} {msg}")

def log_info(msg):
    print(f"{GRAY}{msg}{RESET}")


def check_requirements():
    """必要なパッケージとAPIキーをチェック"""
    try:
        import requests  # noqa
    except ImportError:
        log_error("requests パッケージが必要です")
        log_info("  以下を実行してください:")
        log_info("  pip3 install requests --break-system-packages")
        sys.exit(1)
    
    if not NOTION_TOKEN:
        log_error("NOTION_API_KEY が設定されていません")
        log_info(f"  ~/Desktop/stickerverse/.env に以下を追記:")
        log_info(f"  NOTION_API_KEY=ntn_xxxxxxxxxx...")
        sys.exit(1)


def parse_filename(filename):
    """
    ファイル名からタイトルとタグを抽出
    例:
      "宇宙アザラシ.png"     → title="宇宙アザラシ", tag="キャラ"
      "シーン_満月の夜.png"  → title="満月の夜",     tag="シーン"
    """
    name = Path(filename).stem
    
    tag_map = {
        "キャラ": "キャラ",
        "シーン": "シーン",
        "アイテム": "アイテム",
        "char": "キャラ",
        "scene": "シーン",
        "item": "アイテム",
    }
    
    for prefix, tag in tag_map.items():
        if name.startswith(prefix + "_"):
            title = name[len(prefix) + 1:]
            return title, tag
    
    # プレフィックスなし → デフォルト「キャラ」
    return name, "キャラ"


def create_notion_page(title, tag, image_path):
    """Notion DB に新規ページを作成"""
    import requests
    
    url = "https://api.notion.com/v1/pages"
    headers = {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
    }
    
    payload = {
        "parent": {"database_id": DATABASE_ID},
        "properties": {
            "シール名": {
                "title": [
                    {"text": {"content": title}}
                ]
            },
            "タグ": {
                "multi_select": [{"name": tag}]
            },
            "メモ": {
                "rich_text": [
                    {"text": {"content": f"自動登録 ({datetime.now().strftime('%Y-%m-%d %H:%M')})"}}
                ]
            },
        },
        "children": [
            {
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [
                        {"text": {"content": f"📁 元ファイル: {image_path.name}"}}
                    ]
                }
            },
            {
                "object": "block",
                "type": "callout",
                "callout": {
                    "rich_text": [
                        {"text": {"content": "画像をここにドラッグ&ドロップしてください"}}
                    ],
                    "icon": {"emoji": "📸"},
                    "color": "yellow_background"
                }
            }
        ]
    }
    
    response = requests.post(url, headers=headers, json=payload)
    
    if response.status_code == 200:
        page_data = response.json()
        page_url = page_data.get("url", "")
        return True, page_url
    else:
        try:
            error_msg = response.json().get("message", "不明なエラー")
        except Exception:
            error_msg = response.text[:200]
        return False, f"HTTP {response.status_code}: {error_msg}"


def process_file(image_path):
    """1ファイルを処理"""
    title, tag = parse_filename(image_path.name)
    log_info(f"処理中: {image_path.name}")
    log_info(f"  タイトル: {title} / タグ: {tag}")
    
    success, result = create_notion_page(title, tag, image_path)
    
    if success:
        log_ok(f"登録完了: {title}")
        log_info(f"  URL: {result}")
        
        DONE_DIR.mkdir(exist_ok=True)
        dest = DONE_DIR / image_path.name
        counter = 1
        while dest.exists():
            stem = image_path.stem
            ext = image_path.suffix
            dest = DONE_DIR / f"{stem}_{counter}{ext}"
            counter += 1
        shutil.move(str(image_path), str(dest))
        log_info(f"  → {dest.name} に移動")
        return True
    else:
        log_error(f"登録失敗: {title}")
        log_error(f"  理由: {result}")
        return False


def scan_and_process():
    """フォルダをスキャンして全ファイルを処理"""
    if not WATCH_DIR.exists():
        WATCH_DIR.mkdir(parents=True, exist_ok=True)
        log_info(f"監視フォルダを作成: {WATCH_DIR}")
        return 0
    
    files = [
        f for f in WATCH_DIR.iterdir()
        if f.is_file() and f.suffix.lower() in SUPPORTED_EXTENSIONS
    ]
    
    if not files:
        return 0
    
    log_info(f"\n{len(files)}件の画像ファイルを検知")
    
    success_count = 0
    for f in files:
        if process_file(f):
            success_count += 1
        print()
    
    return success_count


def main():
    print(f"\n{BOLD}{'━' * 40}{RESET}")
    print(f"{BOLD}  📸 Stickerverse Auto Uploader{RESET}")
    print(f"{BOLD}{'━' * 40}{RESET}\n")
    
    check_requirements()
    
    log_info(f"監視フォルダ: {WATCH_DIR}")
    log_info(f"処理済み移動先: {DONE_DIR}")
    
    if "--watch" in sys.argv:
        log_info("常時監視モード（Ctrl+C で停止）\n")
        try:
            while True:
                count = scan_and_process()
                if count > 0:
                    log_ok(f"{count}件処理完了")
                time.sleep(5)
        except KeyboardInterrupt:
            print()
            log_info("監視を停止しました")
            sys.exit(0)
    else:
        count = scan_and_process()
        print(f"\n{BOLD}{'━' * 40}{RESET}")
        if count > 0:
            print(f"{GREEN}{BOLD}  ✓ {count}件 登録完了{RESET}")
        else:
            print(f"{GRAY}  処理対象のファイルなし{RESET}")
            log_info(f"  {WATCH_DIR} に画像を入れて再実行してください")
        print(f"{BOLD}{'━' * 40}{RESET}\n")


if __name__ == "__main__":
    main()
