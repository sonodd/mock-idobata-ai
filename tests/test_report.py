"""
tests/test_report.py — generate_and_save_report の単体テスト

実行: pytest tests/test_report.py -v
"""

import json
import uuid
from datetime import datetime, timezone
from typing import List, Optional

import pytest


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _insert_agent(db_path: str, nickname: str = "テスト花子", is_self: int = 0) -> str:
    """テスト用エージェントを DB に直接挿入して agent_id を返す。"""
    import database as db_mod
    conn = db_mod.get_db()
    agent_id = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO agent_profiles
           (id, nickname, background, expertise, personality, "values",
            tone, episodes, system_prompt, is_self, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            agent_id,
            nickname,
            "{}",
            '["会話"]',
            "フレンドリー",
            "[]",
            '{"characteristics": "普通"}',
            '[]',
            "システムプロンプト",
            is_self,
            _now(),
        ),
    )
    conn.commit()
    conn.close()
    return agent_id


def _insert_thread(db_path: str, question: str = "テスト質問") -> str:
    """テスト用スレッドを DB に直接挿入して thread_id を返す。"""
    import database as db_mod
    conn = db_mod.get_db()
    thread_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO threads (id, question, status, created_at) VALUES (?, ?, ?, ?)",
        (thread_id, question, "done", _now()),
    )
    conn.commit()
    conn.close()
    return thread_id


def _insert_message(
    thread_id: str,
    agent_id: str,
    content: str,
    turn_order: int,
    reactions: Optional[List] = None,
) -> str:
    """テスト用メッセージを DB に直接挿入して message_id を返す。"""
    import database as db_mod
    conn = db_mod.get_db()
    msg_id = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO messages
           (id, thread_id, agent_profile_id, content, turn_order, created_at, reactions)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            msg_id,
            thread_id,
            agent_id,
            content,
            turn_order,
            _now(),
            json.dumps(reactions or [], ensure_ascii=False),
        ),
    )
    conn.commit()
    conn.close()
    return msg_id


async def test_report_empty_messages(client):
    """メッセージなしのスレッド → total_turns=0, total_reactions=0。"""
    from services.report_generator import generate_and_save_report

    thread_id = _insert_thread("")
    report = generate_and_save_report(thread_id)

    assert report["total_turns"] == 0
    assert report["total_reactions"] == 0


async def test_report_single_message(client):
    """メッセージ1件 → highlight_quote が空でない。"""
    from services.report_generator import generate_and_save_report

    agent_id = _insert_agent("")
    thread_id = _insert_thread("")
    _insert_message(thread_id, agent_id, "今日の天気は晴れです。楽しいですね。", 1)

    report = generate_and_save_report(thread_id)

    assert report["total_turns"] == 1
    assert report["highlight_quote"] != ""


async def test_report_hints_max_3(client):
    """5件のメッセージがあっても hints は最大3件。"""
    from services.report_generator import generate_and_save_report

    agent_id = _insert_agent("")
    thread_id = _insert_thread("")
    for i in range(5):
        _insert_message(
            thread_id, agent_id, f"発言その{i+1}です。参考になれば幸いです。", i + 1
        )

    report = generate_and_save_report(thread_id)

    assert len(report["hints"]) <= 3


async def test_report_total_reactions(client):
    """reactions 付きメッセージ → total_reactions が正しく集計される。"""
    from services.report_generator import generate_and_save_report

    agent_id = _insert_agent("")
    thread_id = _insert_thread("")
    _insert_message(thread_id, agent_id, "リアクション付きメッセージ。", 1, reactions=["👍", "❤️"])
    _insert_message(thread_id, agent_id, "こちらもリアクションあり。", 2, reactions=["😊"])

    report = generate_and_save_report(thread_id)

    assert report["total_turns"] == 2
    assert report["total_reactions"] == 3  # 2 + 1


async def test_report_highlight_agent(client):
    """最多リアクションのエージェントが highlight_agent になる。"""
    from services.report_generator import generate_and_save_report

    agent_a_id = _insert_agent("", nickname="エージェントA")
    agent_b_id = _insert_agent("", nickname="エージェントB")
    thread_id = _insert_thread("")

    # エージェントBのメッセージにリアクションを多く付ける
    _insert_message(thread_id, agent_a_id, "普通の発言です。", 1, reactions=["👍"])
    _insert_message(
        thread_id, agent_b_id, "注目の発言！みんなに共感してもらえました。", 2,
        reactions=["👍", "❤️", "😊"]
    )

    report = generate_and_save_report(thread_id)

    assert report["highlight_agent"] == "エージェントB"
