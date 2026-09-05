"""
tests/test_threads.py — スレッドフロー統合テスト

POST /api/threads / GET /api/threads/{id} のエンドポイントをテストする。
Claude APIは unittest.mock.patch でモックし、実APIは叩かない。

実行: pytest tests/test_threads.py -v
"""

import os
import uuid

import pytest
from unittest.mock import MagicMock, patch


# ==============================================================
# ヘルパー
# ==============================================================

CONV_PATCH = "services.conversation.anthropic.Anthropic"


def make_mock_anthropic():
    """services.conversation.anthropic.Anthropic のモック客体を生成する。"""
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text="テスト発言です")]
    mock_client.messages.create.return_value = mock_response
    return mock_client


def _insert_agent(nickname: str, is_self: bool = False) -> str:
    """テスト用代理AIをDBに直接挿入する。DATABASE_PATHはmonkeypatched済み前提。"""
    import database

    agent_id = str(uuid.uuid4())
    conn = database.get_db()
    try:
        conn.execute(
            "INSERT INTO agent_profiles "
            "(id, nickname, background, expertise, personality, \"values\", "
            "tone, episodes, system_prompt, is_self, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                agent_id,
                nickname,
                None,
                '["テスト分野"]',
                "明るい性格",
                None,
                "{}",
                "[]",
                f"あなたは{nickname}です。簡潔に答えてください。",
                1 if is_self else 0,
                "2026-01-01T00:00:00",
            ),
        )
        conn.commit()
    finally:
        conn.close()
    return agent_id


# ==============================================================
# フィクスチャ
# ==============================================================


@pytest.fixture(autouse=True)
def set_api_key(monkeypatch):
    """全テストに ANTHROPIC_API_KEY ダミー値を設定する（KeyError防止）。"""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-dummy-key")


# ==============================================================
# テスト 1: POST /api/threads 正常系
# ==============================================================


async def test_create_thread_success(client):
    """POST /api/threads で {"question": "..."} → id と status が返る（201）。"""
    with patch(CONV_PATCH, return_value=make_mock_anthropic()):
        response = await client.post(
            "/api/threads", json={"question": "テストの質問でございます"}
        )

    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert "status" in data
    assert data["status"] == "in_progress"


# ==============================================================
# テスト 2: POST /api/threads — question なし → バリデーションエラー
# ==============================================================


async def test_create_thread_missing_question(client):
    """question フィールドなし → 422 (Unprocessable Entity) が返る。"""
    response = await client.post("/api/threads", json={})
    assert response.status_code in (400, 422)


# ==============================================================
# テスト 3: GET /api/threads/{id} — status フィールドが含まれる
# ==============================================================


async def test_get_thread_status(client):
    """POST 後に GET /api/threads/{id} → status フィールドが含まれる。"""
    with patch(CONV_PATCH, return_value=make_mock_anthropic()):
        post_resp = await client.post(
            "/api/threads", json={"question": "ステータス確認テスト"}
        )
    assert post_resp.status_code == 201
    thread_id = post_resp.json()["id"]

    get_resp = await client.get(f"/api/threads/{thread_id}")
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert "status" in data
    assert data["id"] == thread_id


# ==============================================================
# テスト 4: スレッド完了 — status == "completed"
# ==============================================================


async def test_thread_completes(client):
    """
    代理AIを1名挿入し、run_idobata_kaigi をモック実行後に
    GET /api/threads/{id} で status="completed" になること。
    """
    # 代理AIを挿入（is_self=False → other_agents に入る、3名以下なので Claude 選定なし）
    _insert_agent("テスト太郎")

    with patch(CONV_PATCH, return_value=make_mock_anthropic()):
        post_resp = await client.post(
            "/api/threads", json={"question": "完了テストの質問"}
        )
    assert post_resp.status_code == 201
    thread_id = post_resp.json()["id"]

    get_resp = await client.get(f"/api/threads/{thread_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["status"] == "completed"


# ==============================================================
# テスト 5: 存在しない ID で GET → 404
# ==============================================================


async def test_get_thread_not_found(client):
    """存在しないスレッドID で GET /api/threads/{id} → 404 が返る。"""
    fake_id = str(uuid.uuid4())
    response = await client.get(f"/api/threads/{fake_id}")
    assert response.status_code == 404


# ==============================================================
# テスト 6: スレッド完了後 messages フィールドが含まれる（オプション）
# ==============================================================


async def test_thread_messages(client):
    """
    代理AIを挿入し、スレッド完了後に GET で messages フィールドが含まれること。
    会話ターンが保存されていれば messages は非空になる。
    """
    _insert_agent("テスト花子")

    with patch(CONV_PATCH, return_value=make_mock_anthropic()):
        post_resp = await client.post(
            "/api/threads", json={"question": "メッセージフィールドテスト"}
        )
    thread_id = post_resp.json()["id"]

    get_resp = await client.get(f"/api/threads/{thread_id}")
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert "messages" in data
    # 代理AIが1名の場合、発言 + まとめ発言が保存されること
    assert isinstance(data["messages"], list)


# ==============================================================
# テスト 7 (BUG-2-1): reactionのagent_nicknameフィールド確認
# ==============================================================


async def test_bug_2_1_reaction_has_agent_nickname(client):
    """
    BUG-2-1修正確認: スレッド完了後のメッセージに reactions が存在する場合、
    各 reaction に agent_nickname フィールドが含まれること。
    """
    import database
    import json

    # 複数エージェントを挿入してリアクションが生成される確率を高める
    _insert_agent("リアクション太郎")
    _insert_agent("リアクション花子")
    _insert_agent("リアクション次郎")

    with patch(CONV_PATCH, return_value=make_mock_anthropic()):
        post_resp = await client.post(
            "/api/threads", json={"question": "リアクション型テスト"}
        )
    assert post_resp.status_code == 201
    thread_id = post_resp.json()["id"]

    # DBからreactionsを直接取得して構造を確認
    conn = database.get_db()
    rows = conn.execute(
        "SELECT reactions FROM messages WHERE thread_id = ? AND reactions IS NOT NULL",
        (thread_id,)
    ).fetchall()
    conn.close()

    for row in rows:
        reactions_data = json.loads(row[0])
        for reaction in reactions_data:
            # agent_id ではなく agent_nickname であること
            assert "agent_nickname" in reaction, (
                f"reaction に agent_nickname がない: {reaction}"
            )
            assert "agent_id" not in reaction, (
                f"reaction に agent_id が存在する（BUG-2-1）: {reaction}"
            )


# ==============================================================
# テスト 8 (BUG-2-4): error状態スレッドのAPIレスポンス確認
# ==============================================================


async def test_bug_2_4_error_status_returned_in_api(client):
    """
    BUG-2-4修正確認: バックエンドが status='error' を返す場合、
    GET /api/threads/{id} レスポンスに error ステータスが含まれること。
    """
    import database

    # エラー状態のスレッドをDBに直接挿入
    thread_id = str(uuid.uuid4())
    conn = database.get_db()
    conn.execute(
        "INSERT INTO threads (id, question, status, created_at) VALUES (?, ?, ?, ?)",
        (thread_id, "エラーテスト質問", "error", "2026-01-01T00:00:00"),
    )
    conn.commit()
    conn.close()

    get_resp = await client.get(f"/api/threads/{thread_id}")
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert data["status"] == "error", (
        f"error状態スレッドのstatusが正しく返されない: {data['status']}"
    )


# ==============================================================
# テスト 9: GET /api/threads — スレッド一覧取得の成功ケース
# ==============================================================


async def test_list_threads_success(client):
    """
    スレッドを複数作成後、GET /api/threads で一覧が返ること。
    - status 200
    - threads フィールドがリスト
    - 各要素に id, question, status, created_at が含まれる
    - 最新順（created_at DESC）で返る
    """
    import database

    # DBに直接スレッドを2件挿入
    thread_id_1 = str(uuid.uuid4())
    thread_id_2 = str(uuid.uuid4())
    conn = database.get_db()
    conn.execute(
        "INSERT INTO threads (id, question, status, created_at) VALUES (?, ?, ?, ?)",
        (thread_id_1, "最初の質問", "completed", "2026-01-01T10:00:00"),
    )
    conn.execute(
        "INSERT INTO threads (id, question, status, created_at) VALUES (?, ?, ?, ?)",
        (thread_id_2, "2番目の質問", "in_progress", "2026-01-02T10:00:00"),
    )
    conn.commit()
    conn.close()

    response = await client.get("/api/threads")
    assert response.status_code == 200
    data = response.json()
    assert "threads" in data
    assert isinstance(data["threads"], list)
    assert len(data["threads"]) >= 2

    # 各要素に必須フィールドが含まれること
    for t in data["threads"]:
        assert "id" in t
        assert "question" in t
        assert "status" in t
        assert "created_at" in t

    # 最新順確認（thread_id_2 が先頭に来るはず）
    ids = [t["id"] for t in data["threads"]]
    assert ids.index(thread_id_2) < ids.index(thread_id_1), (
        "GET /api/threads は created_at DESC 順で返すべき"
    )


# ==============================================================
# テスト 10: GET /api/threads — 空リストのケース
# ==============================================================


async def test_list_threads_empty(client):
    """
    スレッドが1件もない状態で GET /api/threads → {"threads": []} が返ること。
    """
    response = await client.get("/api/threads")
    assert response.status_code == 200
    data = response.json()
    assert "threads" in data
    assert data["threads"] == []
