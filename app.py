"""井戸端会議AI — FastAPIメインアプリケーション"""

import asyncio
import json
import os
import uuid
import sqlite3
from contextlib import asynccontextmanager
from typing import Annotated, Literal
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, StringConstraints
from starlette.middleware.trustedhost import TrustedHostMiddleware

from database import get_db, init_db
from services.agent_generator import build_system_prompt, validate_agent_data
from services.conversation import get_thread_queue, run_follow_up, run_idobata_kaigi
from services.report_generator import generate_and_save_report


@asynccontextmanager
async def lifespan(app):
    init_db()
    conn = get_db()
    try:
        # Single-process local app: interrupted jobs cannot survive a restart.
        conn.execute("UPDATE threads SET status = 'error' WHERE status = 'in_progress'")
        conn.commit()
    finally:
        conn.close()
    yield


app = FastAPI(title="井戸端会議AI", version="0.2.0", lifespan=lifespan)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "[::1]"])

import os as _os
_dist_assets = _os.path.join(_os.path.dirname(__file__), "dist", "assets")
if _os.path.isdir(_dist_assets):
    app.mount("/assets", StaticFiles(directory=_dist_assets), name="assets")

_dist_index = _os.path.join(_os.path.dirname(__file__), "dist", "index.html")


# --- リクエスト/レスポンスモデル ---


ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
ProfileText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
QuestionText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]


class Background(BaseModel):
    label: Optional[ShortText] = None
    age_group: Optional[ShortText] = None
    occupation: Optional[ShortText] = None
    family: Optional[ShortText] = None


class Tone(BaseModel):
    characteristics: ProfileText
    samples: List[ProfileText] = Field(min_length=1, max_length=5)


class CreateAgentRequest(BaseModel):
    nickname: ShortText
    background: Optional[Background] = None
    expertise: List[ShortText] = Field(min_length=1, max_length=10)
    personality: Literal["共感型", "分析型", "実践型", "理想型"]
    values: Optional[List[ShortText]] = Field(default=None, max_length=10)
    tone: Tone
    episodes: List[ProfileText] = Field(min_length=1, max_length=10)
    is_self: bool = False


class CreateThreadRequest(BaseModel):
    question: QuestionText


class FollowUpRequest(BaseModel):
    question: QuestionText


def require_idle(conn):
    """Call inside BEGIN IMMEDIATE to atomically reserve one generation slot."""
    if conn.execute("SELECT 1 FROM threads WHERE status = 'in_progress' LIMIT 1").fetchone():
        raise HTTPException(status_code=409, detail="会議を生成中です。完了後にお試しください")


# --- エンドポイント ---


@app.get("/")
def serve_spa():
    """フロントエンド（React SPA）を配信する"""
    if _os.path.exists(_dist_index):
        return FileResponse(_dist_index)
    return {"message": "フロントエンドビルドが見つかりません。frontend/ で npm run build を実行してください。"}


@app.post("/api/agents", status_code=201)
def create_agent(req: CreateAgentRequest):
    """人格データから代理AIを登録する（§3.2）"""
    data = req.model_dump()
    validate_agent_data(data)

    system_prompt = build_system_prompt(data)
    agent_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    is_self = 1 if data.get("is_self") else 0

    conn = get_db()
    try:
        # is_self=true の場合、既存の is_self をリセット
        if is_self:
            conn.execute("UPDATE agent_profiles SET is_self = 0 WHERE is_self = 1")
        conn.execute(
            """INSERT INTO agent_profiles
               (id, nickname, background, expertise, personality, "values",
                tone, episodes, system_prompt, is_self, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                agent_id,
                data["nickname"],
                json.dumps(data.get("background"), ensure_ascii=False),
                json.dumps(data["expertise"], ensure_ascii=False),
                data["personality"],
                json.dumps(data.get("values"), ensure_ascii=False),
                json.dumps(data["tone"], ensure_ascii=False),
                json.dumps(data["episodes"], ensure_ascii=False),
                system_prompt,
                is_self,
                now,
            ),
        )
        conn.commit()
    finally:
        conn.close()

    tone_sample = ""
    if data.get("tone", {}).get("samples"):
        tone_sample = data["tone"]["samples"][0]

    return {
        "id": agent_id,
        "nickname": data["nickname"],
        "expertise": data["expertise"],
        "personality": data["personality"],
        "tone_sample": tone_sample,
    }


@app.get("/api/agents")
def list_agents():
    """登録済み代理AI一覧を返す（詳細フィールド含む）"""
    conn = get_db()
    try:
        rows = conn.execute(
            'SELECT id, nickname, background, expertise, personality, "values",'
            " tone, episodes, is_self FROM agent_profiles"
        ).fetchall()
    finally:
        conn.close()

    agents = []
    for row in rows:
        agents.append(
            {
                "id": row["id"],
                "nickname": row["nickname"],
                "background": json.loads(row["background"]) if row["background"] else None,
                "expertise": json.loads(row["expertise"]),
                "personality": row["personality"],
                "values": json.loads(row["values"]) if row["values"] else None,
                "tone": json.loads(row["tone"]) if row["tone"] else {},
                "episodes": json.loads(row["episodes"]) if row["episodes"] else [],
                "is_self": bool(row["is_self"]),
            }
        )
    return {"agents": agents}


@app.put("/api/agents/{agent_id}")
def update_agent(agent_id: str, req: CreateAgentRequest):
    """代理AIプロファイルを更新する"""
    conn = get_db()
    try:
        existing = conn.execute(
            "SELECT id FROM agent_profiles WHERE id = ?", (agent_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Agent not found")

        data = req.model_dump()
        validate_agent_data(data)
        system_prompt = build_system_prompt(data)
        is_self = 1 if data.get("is_self") else 0

        if is_self:
            conn.execute(
                "UPDATE agent_profiles SET is_self = 0 WHERE is_self = 1 AND id != ?",
                (agent_id,),
            )
        conn.execute(
            """UPDATE agent_profiles
               SET nickname=?, background=?, expertise=?, personality=?,
                   "values"=?, tone=?, episodes=?, system_prompt=?, is_self=?
               WHERE id=?""",
            (
                data["nickname"],
                json.dumps(data.get("background"), ensure_ascii=False),
                json.dumps(data["expertise"], ensure_ascii=False),
                data["personality"],
                json.dumps(data.get("values"), ensure_ascii=False),
                json.dumps(data["tone"], ensure_ascii=False),
                json.dumps(data["episodes"], ensure_ascii=False),
                system_prompt,
                is_self,
                agent_id,
            ),
        )
        conn.commit()
    finally:
        conn.close()

    return {
        "id": agent_id,
        "nickname": data["nickname"],
        "background": data.get("background"),
        "expertise": data["expertise"],
        "personality": data["personality"],
        "values": data.get("values"),
        "tone": data["tone"],
        "episodes": data["episodes"],
        "is_self": bool(is_self),
    }


@app.delete("/api/agents/{agent_id}", status_code=200)
def delete_agent(agent_id: str):
    """代理AIを削除する。is_self=True のエージェントは削除不可（403）。"""
    conn = get_db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        require_idle(conn)
        row = conn.execute(
            "SELECT id, is_self FROM agent_profiles WHERE id = ?", (agent_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Agent not found")
        if row["is_self"]:
            raise HTTPException(status_code=403, detail="自分自身のエージェントは削除できません")
        try:
            conn.execute("DELETE FROM agent_profiles WHERE id = ?", (agent_id,))
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="会議履歴で使用中の代理AIです。関連する会議を削除してからお試しください") from None
        conn.commit()
    finally:
        conn.close()

    return {"deleted": True, "id": agent_id}


@app.post("/api/threads", status_code=201)
def create_thread(req: CreateThreadRequest, bg: BackgroundTasks):
    """質問投稿 → 井戸端会議を非同期開始（§6.1）"""
    thread_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    conn = get_db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        require_idle(conn)
        conn.execute(
            "INSERT INTO threads (id, question, status, created_at) VALUES (?, ?, ?, ?)",
            (thread_id, req.question, "in_progress", now),
        )
        conn.commit()
    finally:
        conn.close()

    bg.add_task(run_idobata_kaigi, thread_id)

    return {"id": thread_id, "question": req.question, "status": "in_progress"}


@app.get("/api/threads")
def list_threads():
    """スレッド履歴一覧を返す（最新順）"""
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT id, question, status, created_at FROM threads ORDER BY created_at DESC"
        ).fetchall()
    finally:
        conn.close()

    return {
        "threads": [
            {
                "id": row["id"],
                "question": row["question"],
                "status": row["status"],
                "created_at": row["created_at"],
            }
            for row in rows
        ]
    }


@app.get("/api/threads/{thread_id}")
def get_thread(thread_id: str):
    """スレッド詳細+会話結果を返す"""
    conn = get_db()
    try:
        thread = conn.execute(
            "SELECT id, question, status FROM threads WHERE id = ?", (thread_id,)
        ).fetchone()
        if not thread:
            raise HTTPException(status_code=404, detail="Thread not found")

        rows = conn.execute(
            """SELECT m.content, m.turn_order, m.reactions, ap.nickname AS agent_nickname
               FROM messages m
               JOIN agent_profiles ap ON m.agent_profile_id = ap.id
               WHERE m.thread_id = ?
               ORDER BY m.turn_order""",
            (thread_id,),
        ).fetchall()
    finally:
        conn.close()

    messages = [
        {
            "agent_nickname": row["agent_nickname"],
            "content": row["content"],
            "turn_order": row["turn_order"],
            "reactions": json.loads(row["reactions"] or "[]"),
        }
        for row in rows
    ]

    return {
        "id": thread["id"],
        "question": thread["question"],
        "status": thread["status"],
        "messages": messages,
    }


@app.get("/api/threads/{thread_id}/stream")
async def stream_thread(thread_id: str):
    """スレッドの進捗をSSEでリアルタイム配信する"""

    async def event_generator():
        # インメモリキューが存在する場合: LLM生成中 → キューからリアルタイム配信
        seen_turns = set()
        q = get_thread_queue(thread_id)
        if q is not None:
            async for item in q.events():
                if item is None:
                    # Noneセンチネル = 生成完了。DBポーリングに移行
                    break
                seen_turns.add(item["turn_order"])
                yield f"event: message\ndata: {json.dumps(item, ensure_ascii=False)}\n\n"

        # DBポーリング（再接続・完了済みスレッド・キュー枯渇後の最終状態取得）
        prev_count = 0
        while True:
            conn = get_db()
            try:
                thread = conn.execute(
                    "SELECT id, question, status FROM threads WHERE id = ?", (thread_id,)
                ).fetchone()
                if not thread:
                    yield f"event: error\ndata: {json.dumps({'detail': 'Thread not found'})}\n\n"
                    return

                rows = conn.execute(
                    """SELECT m.content, m.turn_order, m.reactions, ap.nickname AS agent_nickname
                       FROM messages m
                       JOIN agent_profiles ap ON m.agent_profile_id = ap.id
                       WHERE m.thread_id = ?
                       ORDER BY m.turn_order""",
                    (thread_id,),
                ).fetchall()
            finally:
                conn.close()

            messages = [
                {
                    "agent_nickname": row["agent_nickname"],
                    "content": row["content"],
                    "turn_order": row["turn_order"],
                    "reactions": json.loads(row["reactions"] or "[]"),
                }
                for row in rows
            ]

            if len(messages) > prev_count:
                for msg in messages[prev_count:]:
                    if msg["turn_order"] not in seen_turns:
                        seen_turns.add(msg["turn_order"])
                        yield f"event: message\ndata: {json.dumps(msg, ensure_ascii=False)}\n\n"
                prev_count = len(messages)

            status = thread["status"]
            if status == "completed":
                payload = {
                    "id": thread["id"],
                    "question": thread["question"],
                    "status": status,
                    "messages": messages,
                }
                yield f"event: complete\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                return
            elif status == "error":
                yield f"event: error\ndata: {json.dumps({'status': 'error'})}\n\n"
                return

            await asyncio.sleep(2)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/threads/{thread_id}/report")
def get_thread_report(thread_id: str):
    """保存済み発言から帰還レポートを再生成する"""
    try:
        return generate_and_save_report(thread_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Thread not found") from None
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None


@app.post("/api/threads/{thread_id}/follow-up")
def follow_up(thread_id: str, req: FollowUpRequest, bg: BackgroundTasks):
    """追加質問 → 同じ参加者で追加ラウンド"""
    conn = get_db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        thread = conn.execute(
            "SELECT id, status FROM threads WHERE id = ?", (thread_id,)
        ).fetchone()
        if not thread:
            raise HTTPException(status_code=404, detail="Thread not found")

        require_idle(conn)
        existing_question = conn.execute("SELECT question FROM threads WHERE id = ?", (thread_id,)).fetchone()[0]
        if len(existing_question) + len(req.question) > 20000:
            raise HTTPException(status_code=422, detail="会議の質問履歴が上限に達しました。新しい会議を作成してください")
        message_count = conn.execute("SELECT COUNT(*) FROM messages WHERE thread_id = ?", (thread_id,)).fetchone()[0]
        if message_count >= 100:
            raise HTTPException(status_code=422, detail="会議の発言数が上限に達しました。新しい会議を作成してください")
        conn.execute("DELETE FROM return_reports WHERE thread_id = ?", (thread_id,))
        conn.execute(
            "UPDATE threads SET status = ?, question = question || ? WHERE id = ?",
            ("in_progress", "\n\n【追加質問】" + req.question, thread_id),
        )
        conn.commit()
    finally:
        conn.close()

    bg.add_task(run_follow_up, thread_id, req.question)

    return {"status": "in_progress"}


@app.delete("/api/threads/{thread_id}")
def delete_thread(thread_id: str):
    conn = get_db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        thread = conn.execute("SELECT status FROM threads WHERE id = ?", (thread_id,)).fetchone()
        if not thread:
            raise HTTPException(status_code=404, detail="Thread not found")
        if thread["status"] == "in_progress":
            raise HTTPException(status_code=409, detail="生成中の会議は削除できません")
        conn.execute("DELETE FROM return_reports WHERE thread_id = ?", (thread_id,))
        conn.execute("DELETE FROM messages WHERE thread_id = ?", (thread_id,))
        conn.execute("DELETE FROM threads WHERE id = ?", (thread_id,))
        conn.commit()
    finally:
        conn.close()
    return {"deleted": True, "id": thread_id}


# --- 起動 ---

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="127.0.0.1", port=port)
