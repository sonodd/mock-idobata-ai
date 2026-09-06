"""ルールベース帰還レポート生成サービス"""

import json
import uuid
from datetime import datetime, timezone
from database import get_db


def generate_and_save_report(thread_id: str) -> dict:
    """
    thread_id のメッセージ履歴からルールベースで帰還レポートを生成し、
    return_reports テーブルに保存して返す。
    """
    conn = get_db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        thread = conn.execute("SELECT status FROM threads WHERE id = ?", (thread_id,)).fetchone()
        if not thread:
            raise LookupError("Thread not found")
        if thread["status"] == "in_progress":
            raise ValueError("会議の完了後にレポートを取得してください")
        # メッセージ取得
        rows = conn.execute(
            """SELECT m.content, m.turn_order, m.reactions,
                      ap.nickname AS agent_nickname, ap.is_self
               FROM messages m
               JOIN agent_profiles ap ON m.agent_profile_id = ap.id
               WHERE m.thread_id = ?
               ORDER BY m.turn_order""",
            (thread_id,),
        ).fetchall()
        report_data = _build_report(rows)
        now = datetime.now(timezone.utc).isoformat()
        conn.execute("DELETE FROM return_reports WHERE thread_id = ?", (thread_id,))
        conn.execute(
            """INSERT INTO return_reports
               (id, thread_id, total_turns, total_reactions,
                highlight_quote, highlight_agent, hints, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                str(uuid.uuid4()),
                thread_id,
                report_data["total_turns"],
                report_data["total_reactions"],
                report_data["highlight_quote"],
                report_data["highlight_agent"],
                json.dumps(report_data["hints"], ensure_ascii=False),
                now,
            ),
        )
        conn.commit()
    finally:
        conn.close()

    return report_data


def _build_report(rows):
    messages = [
        {
            "content": r["content"],
            "turn_order": r["turn_order"],
            "reactions": json.loads(r["reactions"] or "[]"),
            "agent_nickname": r["agent_nickname"],
            "is_self": bool(r["is_self"]),
        }
        for r in rows
    ]

    total_turns = len(messages)
    total_reactions = sum(len(m["reactions"]) for m in messages)

    # 自分以外のエージェントのメッセージ
    other_messages = [m for m in messages if not m["is_self"]]

    # highlight: リアクションが最も多いメッセージ、なければ最後のメッセージ
    if other_messages:
        highlight_msg = max(
            reversed(other_messages), key=lambda m: len(m["reactions"])
        )
    else:
        highlight_msg = messages[-1] if messages else None

    highlight_quote = ""
    highlight_agent = ""
    if highlight_msg:
        content = highlight_msg["content"]
        # 最初の句読点までを抜粋（最大60文字）
        for sep in ["。", "！", "？", "、\n", "\n"]:
            idx = content.find(sep)
            if 0 < idx <= 60:
                highlight_quote = content[:idx + 1]
                break
        else:
            highlight_quote = content[:60] + ("…" if len(content) > 60 else "")
        highlight_agent = highlight_msg["agent_nickname"]

    # hints: 他エージェントの発言から最大3件の要点を抽出
    hints = []
    for msg in other_messages[-4:]:
        content = msg["content"]
        # 最初の文（句点まで）を抜粋
        for sep in ["。", "！", "？"]:
            idx = content.find(sep)
            if 0 < idx <= 50:
                hints.append(content[:idx + 1])
                break
        else:
            hints.append(content[:40] + ("…" if len(content) > 40 else ""))
        if len(hints) >= 3:
            break

    report_data = {
        "total_turns": total_turns,
        "total_reactions": total_reactions,
        "highlight_quote": highlight_quote,
        "highlight_agent": highlight_agent,
        "hints": hints,
    }

    return report_data
