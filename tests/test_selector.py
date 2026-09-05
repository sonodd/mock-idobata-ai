"""
tests/test_selector.py — participant_selector.py 単体テスト

select_participants 関数をテストする。
Claude Haiku 呼び出しは unittest.mock.patch でモックし、実APIは叩かない。

実行: pytest tests/test_selector.py -v
"""

import json
import os
import uuid
from typing import List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ==============================================================
# ヘルパー
# ==============================================================

SEL_PATCH = "services.participant_selector.anthropic.AsyncAnthropic"


def make_agent(nickname: str, expertise: Optional[List[str]] = None) -> dict:
    """テスト用代理AIデータを生成する。"""
    return {
        "id": str(uuid.uuid4()),
        "nickname": nickname,
        "background": {"age_group": "30代", "occupation": "エンジニア"},
        "expertise": expertise or ["テスト分野"],
        "personality": "明るい",
        "values": ["誠実さ"],
        "tone": {"style": "friendly"},
        "episodes": ["エピソード1"],
        "system_prompt": f"あなたは{nickname}です。",
        "is_self": False,
    }


def make_mock_selector_anthropic(agent_ids: list[str], scores: list[int]) -> MagicMock:
    """
    select_participants 内の Claude 呼び出しをモックする。
    agent_ids と scores を対応させた JSON を返す AsyncMock を生成する。
    """
    mock_client = MagicMock()
    mock_response = MagicMock()
    scored = [{"id": aid, "score": s} for aid, s in zip(agent_ids, scores)]
    mock_response.content = [MagicMock(text=json.dumps(scored))]
    mock_client.messages.create = AsyncMock(return_value=mock_response)
    return mock_client


# ==============================================================
# フィクスチャ
# ==============================================================


@pytest.fixture(autouse=True)
def set_api_key(monkeypatch):
    """全テストに ANTHROPIC_API_KEY ダミー値を設定する（KeyError防止）。"""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-dummy-key")


# ==============================================================
# テスト 1: select_participants — list が返ること
# ==============================================================


async def test_select_participants_returns_list():
    """エージェントリストを渡すと list が返ること（2名 → Claude 呼び出しなし）。"""
    agents = [make_agent("Aさん"), make_agent("Bさん")]
    result = await select_participants_import("テスト質問", agents)
    assert isinstance(result, list)


# ==============================================================
# テスト 2: 3名以下 → 全員選定（Claude 呼び出しなし）
# ==============================================================


async def test_select_all_when_3_or_fewer():
    """エージェントが 3 名以下なら Claude を呼ばずに全員を返すこと。"""
    agents = [make_agent(f"エージェント{i}") for i in range(3)]

    with patch(SEL_PATCH) as mock_cls:
        result = await select_participants_import("テスト質問", agents)
        # Claude クライアントが生成されていないこと（API 呼び出しなし）
        mock_cls.assert_not_called()

    assert len(result) == 3
    assert result == agents


# ==============================================================
# テスト 3: 5名以上 → 最大5名まで返すこと
# ==============================================================


async def test_select_max_5():
    """エージェントが 6 名のとき、最大5名だけ返ること。"""
    agents = [make_agent(f"エージェント{i}") for i in range(6)]
    ids = [a["id"] for a in agents]
    # Claude がスコアを返す（全6名にスコアを付与）
    scores = [90 - i * 5 for i in range(6)]  # 90, 85, 80, 75, 70, 65

    with patch(SEL_PATCH, return_value=make_mock_selector_anthropic(ids, scores)):
        result = await select_participants_import("6人テスト", agents)

    assert len(result) <= 5


# ==============================================================
# テスト 4: 返ったリストに nickname フィールドがあること
# ==============================================================


async def test_select_includes_profiles():
    """返却されたエージェントリストに nickname フィールドが含まれること。"""
    agents = [make_agent("Cさん"), make_agent("Dさん")]
    result = await select_participants_import("プロフィールテスト", agents)

    assert len(result) > 0
    for agent in result:
        assert "nickname" in agent


# ==============================================================
# テスト 5: Claude のレスポンスをモックして特定エージェントが選ばれること
# ==============================================================


async def test_select_with_mock_claude():
    """
    Claude のレスポンスをモックして、高スコアの特定エージェントが
    結果の先頭に含まれること。
    """
    agents = [make_agent(f"エージェント{i}") for i in range(5)]
    ids = [a["id"] for a in agents]
    # エージェント2 が最高スコア
    scores = [60, 70, 99, 55, 45]

    with patch(SEL_PATCH, return_value=make_mock_selector_anthropic(ids, scores)):
        result = await select_participants_import("特定選定テスト", agents)

    assert len(result) > 0
    # 最高スコア（エージェント2）が含まれること
    result_ids = [a["id"] for a in result]
    assert agents[2]["id"] in result_ids


# ==============================================================
# テスト 6: フォールバック — Claude が無効な JSON を返した場合（オプション）
# ==============================================================


async def test_select_fallback_invalid_json():
    """
    Claude が JSON でないテキストを返した場合、json.JSONDecodeError が
    発生すること（フォールバックは未実装のため例外が伝播する）。
    """
    agents = [make_agent(f"エージェント{i}") for i in range(5)]

    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text="これはJSONではありません")]
    mock_client.messages.create = AsyncMock(return_value=mock_response)

    with patch(SEL_PATCH, return_value=mock_client):
        with pytest.raises((json.JSONDecodeError, ValueError)):
            await select_participants_import("フォールバックテスト", agents)


# ==============================================================
# テスト 7 (BUG-2-2): background.label が Claude プロンプトに含まれること
# ==============================================================


async def test_bug_2_2_label_included_in_prompt():
    """
    BUG-2-2修正確認: background.label が設定されている場合、
    Claude へのプロンプトに label の値が含まれること。
    """
    label_value = "子育て中の共働き世帯"
    agents = [
        {
            "id": str(uuid.uuid4()),
            "nickname": f"エージェント{i}",
            "background": {
                "age_group": "40代",
                "occupation": "会社員",
                "family": "既婚",
                "label": label_value,
            },
            "expertise": ["育児"],
            "personality": "温かい",
            "values": ["家族"],
            "tone": {"style": "friendly"},
            "episodes": [],
            "system_prompt": f"あなたはエージェント{i}です。",
            "is_self": False,
        }
        for i in range(5)
    ]
    ids = [a["id"] for a in agents]
    scores = [80, 70, 60, 50, 40]

    captured_prompt = []

    async def capture_create(**kwargs):
        captured_prompt.append(kwargs["messages"][0]["content"])
        mock_response = MagicMock()
        scored = [{"id": aid, "score": s} for aid, s in zip(ids, scores)]
        mock_response.content = [MagicMock(text=json.dumps(scored))]
        return mock_response

    mock_client = MagicMock()
    mock_client.messages.create = capture_create

    with patch(SEL_PATCH, return_value=mock_client):
        await select_participants_import("labelテスト", agents)

    assert len(captured_prompt) > 0
    assert label_value in captured_prompt[0]


# ==============================================================
# テスト 8 (BUG-2-3): select_participants がコルーチン関数であること
# ==============================================================


def test_bug_2_3_select_participants_is_coroutine():
    """
    BUG-2-3修正確認: select_participants が async def (コルーチン関数) であること。
    """
    import inspect
    from services.participant_selector import select_participants

    assert inspect.iscoroutinefunction(select_participants), (
        "select_participants は async def でなければならない（BUG-2-3）"
    )


# ==============================================================
# インポートヘルパー（テスト本体の import は後回しにして conftest 後に実行）
# ==============================================================


async def select_participants_import(question: str, agents: list[dict]) -> list[dict]:
    """select_participants を実行時インポートして呼び出す。"""
    from services.participant_selector import select_participants

    return await select_participants(question, agents)
