"""
tests/test_agents.py — エージェントCRUD APIの統合テスト

実行: pytest tests/test_agents.py -v
"""

import pytest

SAMPLE_AGENT = {
    "nickname": "テスト太郎",
    "expertise": ["料理", "育児"],
    "personality": "共感型",
    "tone": {
        "characteristics": "優しい口調",
        "samples": ["そうですね〜", "わかります！"],
    },
    "episodes": ["子育て経験あり"],
    "background": {"label": "30代主婦"},
    "values": ["家族を大切にする"],
}


async def test_create_agent_success(client):
    """POST /api/agents で正常なエージェント作成。201/200 が返り nickname が含まれる。"""
    resp = await client.post("/api/agents", json=SAMPLE_AGENT)
    assert resp.status_code in (200, 201)
    body = resp.json()
    assert "id" in body
    assert body["nickname"] == SAMPLE_AGENT["nickname"]


async def test_create_agent_missing_field(client):
    """nickname 欠落リクエストは 422 または 400 が返る。"""
    payload = {k: v for k, v in SAMPLE_AGENT.items() if k != "nickname"}
    resp = await client.post("/api/agents", json=payload)
    assert resp.status_code in (400, 422)


async def test_list_agents_empty(client):
    """エージェントが一件も存在しない状態で GET /api/agents → 空リスト。"""
    resp = await client.get("/api/agents")
    assert resp.status_code == 200
    body = resp.json()
    assert "agents" in body
    assert body["agents"] == []


async def test_list_agents_after_create(client):
    """エージェントを作成後に GET /api/agents → 1件以上含まれる。"""
    await client.post("/api/agents", json=SAMPLE_AGENT)
    resp = await client.get("/api/agents")
    assert resp.status_code == 200
    agents = resp.json()["agents"]
    assert len(agents) >= 1
    assert any(a["nickname"] == SAMPLE_AGENT["nickname"] for a in agents)


async def test_get_agent_by_id(client):
    """POST で作成したエージェントを ID で GET → 同じ nickname が返る。"""
    create_resp = await client.post("/api/agents", json=SAMPLE_AGENT)
    agent_id = create_resp.json()["id"]

    resp = await client.get("/api/agents")
    assert resp.status_code == 200
    agents = resp.json()["agents"]
    matched = [a for a in agents if a["id"] == agent_id]
    assert len(matched) == 1
    assert matched[0]["nickname"] == SAMPLE_AGENT["nickname"]


async def test_get_agent_not_found(client):
    """存在しない ID で PUT /api/agents/{id} → 404。

    app.py には GET /api/agents/{id} が存在しないため、
    404 を返すエンドポイントとして PUT /api/agents/{id} を使用する。
    """
    resp = await client.put("/api/agents/nonexistent-id-00000000", json=SAMPLE_AGENT)
    assert resp.status_code == 404


async def test_update_agent(client):
    """PUT /api/agents/{id} で nickname を更新 → 更新後の値が返る。"""
    create_resp = await client.post("/api/agents", json=SAMPLE_AGENT)
    agent_id = create_resp.json()["id"]

    updated = {**SAMPLE_AGENT, "nickname": "更新後の名前"}
    resp = await client.put(f"/api/agents/{agent_id}", json=updated)
    assert resp.status_code == 200
    assert resp.json()["nickname"] == "更新後の名前"


async def test_delete_agent_success(client):
    """DELETE /api/agents/{id} で正常削除 → 200 と deleted:true が返り、一覧から消える。"""
    create_resp = await client.post("/api/agents", json=SAMPLE_AGENT)
    agent_id = create_resp.json()["id"]

    resp = await client.delete(f"/api/agents/{agent_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["deleted"] is True
    assert body["id"] == agent_id

    list_resp = await client.get("/api/agents")
    agents = list_resp.json()["agents"]
    assert not any(a["id"] == agent_id for a in agents)


async def test_delete_agent_is_self_forbidden(client):
    """is_self=True のエージェントへの DELETE → 403。"""
    payload = {**SAMPLE_AGENT, "is_self": True}
    create_resp = await client.post("/api/agents", json=payload)
    agent_id = create_resp.json()["id"]

    resp = await client.delete(f"/api/agents/{agent_id}")
    assert resp.status_code == 403


async def test_delete_agent_not_found(client):
    """存在しない ID への DELETE → 404。"""
    resp = await client.delete("/api/agents/nonexistent-id-00000000")
    assert resp.status_code == 404
