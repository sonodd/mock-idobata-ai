"""井戸端会議の会話生成サービス（§4.2.2, §4.2.3, §6.2, §6.3）"""

import asyncio
import json
import os
import random as _random
import uuid
from datetime import datetime, timezone
from typing import Any

import anthropic

from database import get_db
from services.participant_selector import select_participants

# スレッドごとのインメモリSSEキュー（LLM生成中のリアルタイム配信用）
_thread_queues: dict[str, asyncio.Queue] = {}


def get_thread_queue(thread_id: str) -> "asyncio.Queue | None":
    """スレッドのインメモリキューを取得（SSEエンドポイントから呼び出し）"""
    return _thread_queues.get(thread_id)


async def _call_claude_with_retry(client, **kwargs) -> str:
    """Claude API呼び出し（リトライ最大3回: 1s, 2s, 4s）"""
    delays = [1, 2, 4]
    last_error = None

    for attempt, delay in enumerate(delays):
        try:
            response = client.messages.create(**kwargs)
            return response.content[0].text
        except Exception as e:
            last_error = e
            if attempt < len(delays) - 1:
                await asyncio.sleep(delay)

    raise last_error


def _get_thread(db, thread_id: str) -> dict:
    """スレッド情報を取得"""
    row = db.execute(
        "SELECT id, question, status FROM threads WHERE id = ?", (thread_id,)
    ).fetchone()
    if not row:
        raise ValueError(f"スレッド {thread_id} が見つかりません")
    return {"id": row[0], "question": row[1], "status": row[2]}


def _get_all_agents(db) -> list[dict]:
    """全代理AIを取得"""
    rows = db.execute(
        'SELECT id, nickname, background, expertise, personality, "values", '
        "tone, episodes, system_prompt, is_self FROM agent_profiles"
    ).fetchall()
    agents = []
    for row in rows:
        agents.append({
            "id": row[0],
            "nickname": row[1],
            "background": json.loads(row[2]) if row[2] else None,
            "expertise": json.loads(row[3]),
            "personality": row[4],
            "values": json.loads(row[5]) if row[5] else None,
            "tone": json.loads(row[6]),
            "episodes": json.loads(row[7]),
            "system_prompt": row[8],
            "is_self": bool(row[9]),
        })
    return agents


def _get_existing_messages(db, thread_id: str) -> list[dict]:
    """既存の会話メッセージを取得"""
    rows = db.execute(
        "SELECT agent_profile_id, content, turn_order FROM messages "
        "WHERE thread_id = ? ORDER BY turn_order",
        (thread_id,),
    ).fetchall()
    return [
        {"agent_profile_id": r[0], "content": r[1], "turn_order": r[2]}
        for r in rows
    ]


def _build_conversation_history(messages: list[dict], agent_map: dict) -> str:
    """会話履歴テキストを組み立て"""
    if not messages:
        return ""
    lines = []
    for msg in messages:
        nickname = agent_map.get(msg["agent_profile_id"], {}).get("nickname", "不明")
        lines.append(f"{nickname}: {msg['content']}")
    return "\n".join(lines)


REACTION_EMOJIS = ['👍', '😊', '🤔', '💡', '❤️', '🙏', '✨']


def _add_reactions(conn, message_id: str, all_participant_nicknames: list, author_nickname: str):
    """メッセージにランダムリアクションを付ける（ルールベース）"""
    others = [n for n in all_participant_nicknames if n != author_nickname]
    if not others:
        return
    r = _random.random()
    if r < 0.10:
        reactors = []  # リアクションなし
    elif r < 0.70:
        reactors = _random.sample(others, min(1, len(others)))
    else:
        reactors = _random.sample(others, min(2, len(others)))
    reactions = [{"emoji": _random.choice(REACTION_EMOJIS), "agent_nickname": n} for n in reactors]
    conn.execute(
        "UPDATE messages SET reactions = ? WHERE id = ?",
        (json.dumps(reactions, ensure_ascii=False), message_id)
    )
    conn.commit()


def _compute_reactions(all_participant_nicknames: list, author_nickname: str) -> list:
    """リアクションをメモリ上で計算してリストを返す（DB書き込みなし）"""
    others = [n for n in all_participant_nicknames if n != author_nickname]
    if not others:
        return []
    r = _random.random()
    if r < 0.10:
        reactors = []
    elif r < 0.70:
        reactors = _random.sample(others, min(1, len(others)))
    else:
        reactors = _random.sample(others, min(2, len(others)))
    return [{"emoji": _random.choice(REACTION_EMOJIS), "agent_nickname": n} for n in reactors]


def _save_message(db, thread_id: str, agent_id: str, content: str, turn_order: int):
    """発言をDBに保存"""
    msg_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        "INSERT INTO messages (id, thread_id, agent_profile_id, content, turn_order, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (msg_id, thread_id, agent_id, content, turn_order, now),
    )
    db.commit()
    return msg_id


async def run_idobata_kaigi(thread_id: str):
    """井戸端会議メイン処理（§6.2）

    1. スレッド情報取得
    2. 全代理AI取得
    3. Haikuで参加者選定
    4. 各参加者が順番に発言（Sonnet）—— メモリバッファに蓄積、DB書き込みなし
    5. 最初の発言者がまとめ発言
    6. 生成完了後に一括コミット（案B: LLM生成中のDBロック取得をゼロに）
    """
    # インメモリSSEキューを作成（SSEエンドポイントがリアルタイム配信に使用）
    queue: asyncio.Queue = asyncio.Queue()
    _thread_queues[thread_id] = queue

    db = get_db()
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    # DB一括コミット用バッファ
    messages_to_insert: list[tuple] = []
    reactions_to_update: list[tuple] = []

    try:
        # 1. スレッド情報取得
        thread = _get_thread(db, thread_id)
        question = thread["question"]

        # 2. 全代理AI取得
        agents = _get_all_agents(db)
        if not agents:
            db.execute(
                "UPDATE threads SET status = ? WHERE id = ?", ("error", thread_id)
            )
            db.commit()
            return

        # 3. 参加者選定（Haiku）
        agent_map = {a["id"]: a for a in agents}

        # 「自分」の代理AIを特定
        self_agent = next((a for a in agents if a.get("is_self")), None)
        other_agents = [a for a in agents if not a.get("is_self")]

        # 自分以外から参加者を選定
        participants = await select_participants(question, other_agents)

        # 参加者ニックネーム一覧（リアクション生成用）
        all_nicknames = [p["nickname"] for p in participants]
        if self_agent:
            all_nicknames.append(self_agent["nickname"])

        # 既存メッセージの最大turn_order取得（追加質問対応）
        existing = _get_existing_messages(db, thread_id)
        next_turn = max((m["turn_order"] for m in existing), default=-1) + 1
        all_messages = list(existing)
        turn_counter = next_turn

        # 4a. 自分の代理AIがお題を自分の言葉で投げかける
        if self_agent:
            opener_content = (
                f"【あなたへの指示】\n"
                f"あなたは井戸端会議の場で、以下の悩み・疑問をみんなに相談したいと思っています。\n"
                f"自分の言葉で、自分の状況や背景を交えながら、他の参加者に話しかけてください。\n"
                f"堅い質問文ではなく、雑談の中で自然に切り出す感じで話してください。\n\n"
                f"【相談したいこと】\n{question}\n\n"
                f"1〜3段落程度で簡潔に。"
            )

            try:
                content = await _call_claude_with_retry(
                    client,
                    model=os.getenv('CONVERSATION_MODEL', 'claude-sonnet-4-6'),
                    max_tokens=500,
                    temperature=0.8,
                    system=self_agent["system_prompt"],
                    messages=[{"role": "user", "content": opener_content}],
                )
                msg_id = str(uuid.uuid4())
                now = datetime.now(timezone.utc).isoformat()
                reactions = _compute_reactions(all_nicknames, self_agent["nickname"])

                # バッファに蓄積（DB書き込みはしない）
                messages_to_insert.append(
                    (msg_id, thread_id, self_agent["id"], content, turn_counter, now)
                )
                if reactions:
                    reactions_to_update.append(
                        (json.dumps(reactions, ensure_ascii=False), msg_id)
                    )

                # SSEキューにプッシュ（フロントにリアルタイム配信）
                await queue.put({
                    "agent_nickname": self_agent["nickname"],
                    "content": content,
                    "turn_order": turn_counter,
                    "reactions": reactions,
                })

                all_messages.append({
                    "agent_profile_id": self_agent["id"],
                    "content": content,
                    "turn_order": turn_counter,
                })
                turn_counter += 1
            except Exception:
                pass  # 自分の発言失敗でも続行

        # 4b. 他の参加者が順番に発言
        for participant in participants:
            history_text = _build_conversation_history(all_messages, agent_map)

            user_content = f"【井戸端会議のお題】\n{question}\n"
            if history_text:
                user_content += f"\n【これまでの会話】\n{history_text}\n"
            user_content += (
                "\nあなたの番です。上記の会話を踏まえて、自分の経験や考えに基づいた意見を述べてください。"
                "\n前の人の意見への同意・補足・別視点の提供など、自然な井戸端会議の流れを意識してください。"
                "\n1〜3段落程度で簡潔に。"
            )

            try:
                content = await _call_claude_with_retry(
                    client,
                    model=os.getenv('CONVERSATION_MODEL', 'claude-sonnet-4-6'),
                    max_tokens=500,
                    temperature=0.8,
                    system=participant["system_prompt"],
                    messages=[{"role": "user", "content": user_content}],
                )
                msg_id = str(uuid.uuid4())
                now = datetime.now(timezone.utc).isoformat()
                reactions = _compute_reactions(all_nicknames, participant["nickname"])

                messages_to_insert.append(
                    (msg_id, thread_id, participant["id"], content, turn_counter, now)
                )
                if reactions:
                    reactions_to_update.append(
                        (json.dumps(reactions, ensure_ascii=False), msg_id)
                    )

                await queue.put({
                    "agent_nickname": participant["nickname"],
                    "content": content,
                    "turn_order": turn_counter,
                    "reactions": reactions,
                })

                all_messages.append({
                    "agent_profile_id": participant["id"],
                    "content": content,
                    "turn_order": turn_counter,
                })
                turn_counter += 1
            except Exception:
                continue

        # 5. 自分以外の最初の発言者がまとめ
        if participants and len(all_messages) > len(existing):
            summarizer = participants[0]
            history_text = _build_conversation_history(all_messages, agent_map)

            summary_content = (
                f"【井戸端会議のお題】\n{question}\n"
                f"\n【これまでの会話】\n{history_text}\n"
                "\nみなさんの意見が出揃いました。"
                "全体を踏まえたまとめをお願いします。"
                "\n各参加者の意見のポイントを整理し、相談者に役立つ形でまとめてください。"
                "\n1〜3段落程度で簡潔に。"
            )

            try:
                content = await _call_claude_with_retry(
                    client,
                    model=os.getenv('CONVERSATION_MODEL', 'claude-sonnet-4-6'),
                    max_tokens=500,
                    temperature=0.8,
                    system=summarizer["system_prompt"],
                    messages=[{"role": "user", "content": summary_content}],
                )
                msg_id = str(uuid.uuid4())
                now = datetime.now(timezone.utc).isoformat()
                reactions = _compute_reactions(all_nicknames, summarizer["nickname"])

                messages_to_insert.append(
                    (msg_id, thread_id, summarizer["id"], content, turn_counter, now)
                )
                if reactions:
                    reactions_to_update.append(
                        (json.dumps(reactions, ensure_ascii=False), msg_id)
                    )

                await queue.put({
                    "agent_nickname": summarizer["nickname"],
                    "content": content,
                    "turn_order": turn_counter,
                    "reactions": reactions,
                })
            except Exception:
                pass

        # 6. 生成完了後に一括コミット（DBロック保持は一瞬のみ）
        for row in messages_to_insert:
            db.execute(
                "INSERT INTO messages (id, thread_id, agent_profile_id, content, turn_order, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                row,
            )
        for row in reactions_to_update:
            db.execute(
                "UPDATE messages SET reactions = ? WHERE id = ?",
                row,
            )
        db.execute(
            "UPDATE threads SET status = ? WHERE id = ?", ("completed", thread_id)
        )
        db.commit()

    except Exception:
        # §6.3: 全リトライ失敗等でstatus=error
        try:
            db.execute(
                "UPDATE threads SET status = ? WHERE id = ?", ("error", thread_id)
            )
            db.commit()
        except Exception:
            pass
    finally:
        # SSEにNoneセンチネルを送信して生成完了を通知し、キューを解放
        await queue.put(None)
        _thread_queues.pop(thread_id, None)
        db.close()


async def run_follow_up(thread_id: str, follow_up_question: str):
    """追加質問対応（§4.2.3）

    既存の会話履歴 + 追加質問で同じ参加者が追加ラウンド。
    LLM生成中はDBに書き込まない（案B: バッファ方式）。
    """
    # インメモリSSEキューを作成
    queue: asyncio.Queue = asyncio.Queue()
    _thread_queues[thread_id] = queue

    db = get_db()
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    # DB一括コミット用バッファ
    messages_to_insert: list[tuple] = []
    reactions_to_update: list[tuple] = []

    try:
        thread = _get_thread(db, thread_id)
        original_question = thread["question"]

        # statusをin_progressに更新（LLMループ前の単独コミット）
        db.execute(
            "UPDATE threads SET status = ? WHERE id = ?", ("in_progress", thread_id)
        )
        db.commit()

        agents = _get_all_agents(db)
        agent_map = {a["id"]: a for a in agents}

        # 既存メッセージから参加者を特定
        existing = _get_existing_messages(db, thread_id)
        participant_ids = list(dict.fromkeys(
            m["agent_profile_id"] for m in existing
        ))
        participants = [agent_map[pid] for pid in participant_ids if pid in agent_map]

        if not participants:
            participants = await select_participants(follow_up_question, agents)

        all_nicknames = [p["nickname"] for p in participants]
        next_turn = max((m["turn_order"] for m in existing), default=-1) + 1
        all_messages = list(existing)

        combined_question = (
            f"{original_question}\n\n【追加質問】\n{follow_up_question}"
        )

        # 各参加者が追加ラウンド
        for i, participant in enumerate(participants):
            history_text = _build_conversation_history(all_messages, agent_map)

            user_content = (
                f"【井戸端会議のお題】\n{combined_question}\n"
                f"\n【これまでの会話】\n{history_text}\n"
                "\n追加の質問が来ました。これまでの会話を踏まえて、追加質問に対する意見を述べてください。"
                "\n1〜3段落程度で簡潔に。"
            )

            try:
                content = await _call_claude_with_retry(
                    client,
                    model=os.getenv('CONVERSATION_MODEL', 'claude-sonnet-4-6'),
                    max_tokens=500,
                    temperature=0.8,
                    system=participant["system_prompt"],
                    messages=[{"role": "user", "content": user_content}],
                )
                turn_order = next_turn + i
                msg_id = str(uuid.uuid4())
                now = datetime.now(timezone.utc).isoformat()
                reactions = _compute_reactions(all_nicknames, participant["nickname"])

                messages_to_insert.append(
                    (msg_id, thread_id, participant["id"], content, turn_order, now)
                )
                if reactions:
                    reactions_to_update.append(
                        (json.dumps(reactions, ensure_ascii=False), msg_id)
                    )

                await queue.put({
                    "agent_nickname": participant["nickname"],
                    "content": content,
                    "turn_order": turn_order,
                    "reactions": reactions,
                })

                all_messages.append({
                    "agent_profile_id": participant["id"],
                    "content": content,
                    "turn_order": turn_order,
                })
            except Exception:
                continue

        # まとめ発言
        if participants and len(all_messages) > len(existing):
            first_participant = participants[0]
            history_text = _build_conversation_history(all_messages, agent_map)

            summary_content = (
                f"【井戸端会議のお題】\n{combined_question}\n"
                f"\n【これまでの会話】\n{history_text}\n"
                "\n追加質問への意見が出揃いました。全体を踏まえてまとめてください。"
                "\n1〜3段落程度で簡潔に。"
            )

            try:
                content = await _call_claude_with_retry(
                    client,
                    model=os.getenv('CONVERSATION_MODEL', 'claude-sonnet-4-6'),
                    max_tokens=500,
                    temperature=0.8,
                    system=first_participant["system_prompt"],
                    messages=[{"role": "user", "content": summary_content}],
                )
                summary_turn = next_turn + len(participants)
                msg_id = str(uuid.uuid4())
                now = datetime.now(timezone.utc).isoformat()
                reactions = _compute_reactions(all_nicknames, first_participant["nickname"])

                messages_to_insert.append(
                    (msg_id, thread_id, first_participant["id"], content, summary_turn, now)
                )
                if reactions:
                    reactions_to_update.append(
                        (json.dumps(reactions, ensure_ascii=False), msg_id)
                    )

                await queue.put({
                    "agent_nickname": first_participant["nickname"],
                    "content": content,
                    "turn_order": summary_turn,
                    "reactions": reactions,
                })
            except Exception:
                pass

        # 生成完了後に一括コミット（DBロック保持は一瞬のみ）
        for row in messages_to_insert:
            db.execute(
                "INSERT INTO messages (id, thread_id, agent_profile_id, content, turn_order, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                row,
            )
        for row in reactions_to_update:
            db.execute(
                "UPDATE messages SET reactions = ? WHERE id = ?",
                row,
            )
        db.execute(
            "UPDATE threads SET status = ? WHERE id = ?", ("completed", thread_id)
        )
        db.commit()

    except Exception:
        try:
            db.execute(
                "UPDATE threads SET status = ? WHERE id = ?", ("error", thread_id)
            )
            db.commit()
        except Exception:
            pass
    finally:
        # SSEにNoneセンチネルを送信して生成完了を通知し、キューを解放
        await queue.put(None)
        _thread_queues.pop(thread_id, None)
        db.close()
