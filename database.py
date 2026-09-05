"""井戸端会議AI — データベース接続・テーブル作成"""

import os
import sqlite3

DATABASE_PATH = os.environ.get("DATABASE_PATH", "./data/idobata.db")


def get_db() -> sqlite3.Connection:
    """SQLiteコネクションを取得する。Row factoryを設定済み。"""
    os.makedirs(os.path.dirname(os.path.abspath(DATABASE_PATH)), exist_ok=True)
    conn = sqlite3.connect(DATABASE_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def init_db() -> None:
    """テーブルとインデックスを作成する。"""
    conn = get_db()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS agent_profiles (
                id TEXT PRIMARY KEY,
                nickname TEXT NOT NULL,
                background TEXT,
                expertise TEXT NOT NULL,
                personality TEXT NOT NULL,
                "values" TEXT,
                tone TEXT NOT NULL,
                episodes TEXT NOT NULL,
                system_prompt TEXT NOT NULL,
                is_self INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS threads (
                id TEXT PRIMARY KEY,
                question TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL REFERENCES threads(id),
                agent_profile_id TEXT NOT NULL REFERENCES agent_profiles(id),
                content TEXT NOT NULL,
                turn_order INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                reactions TEXT DEFAULT '[]',
                reply_to TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_messages_thread
                ON messages(thread_id, turn_order);

            CREATE TABLE IF NOT EXISTS return_reports (
                id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL,
                total_turns INTEGER DEFAULT 0,
                total_reactions INTEGER DEFAULT 0,
                highlight_quote TEXT DEFAULT '',
                highlight_agent TEXT DEFAULT '',
                hints TEXT DEFAULT '[]',
                created_at TEXT
            );
        """)
        # マイグレーション: is_self カラムが無い場合に追加
        columns = [
            row[1]
            for row in conn.execute("PRAGMA table_info(agent_profiles)").fetchall()
        ]
        if "is_self" not in columns:
            conn.execute(
                "ALTER TABLE agent_profiles ADD COLUMN is_self INTEGER NOT NULL DEFAULT 0"
            )
        # マイグレーション: messages の reactions / reply_to カラムが無い場合に追加
        msg_columns = [
            row[1]
            for row in conn.execute("PRAGMA table_info(messages)").fetchall()
        ]
        if "reactions" not in msg_columns:
            conn.execute("ALTER TABLE messages ADD COLUMN reactions TEXT DEFAULT '[]'")
        if "reply_to" not in msg_columns:
            conn.execute("ALTER TABLE messages ADD COLUMN reply_to TEXT")
        conn.commit()
    finally:
        conn.close()
