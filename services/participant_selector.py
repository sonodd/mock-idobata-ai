"""参加者選定サービス（§4.2.1） — Claude Haikuでスコアリング"""

import json
import os

import anthropic


async def select_participants(question: str, agents: list[dict]) -> list[dict]:
    """質問に対して関連度の高い代理AIを選定する。

    - Claude Haiku でスコアリング
    - スコア上位MAX_PARTICIPANTS名を選定
    - 登録済みがMAX_PARTICIPANTS名未満なら全員参加
    """
    min_p = int(os.getenv('MIN_PARTICIPANTS', '2'))
    max_p = int(os.getenv('MAX_PARTICIPANTS', '3'))
    if not 1 <= min_p <= max_p <= 10:
        raise ValueError('Participants must satisfy 1 <= MIN <= MAX <= 10')
    if len(agents) <= max_p:
        return agents

    client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"], timeout=30.0, max_retries=0)

    # 代理AIサマリー作成
    agent_summaries = []
    for agent in agents:
        bg_info = ""
        if agent.get("background") and isinstance(agent["background"], dict):
            bg_parts = [
                v
                for v in [
                    agent["background"].get("age_group"),
                    agent["background"].get("occupation"),
                    agent["background"].get("family"),
                    agent["background"].get("label"),
                ]
                if v
            ]
            if bg_parts:
                bg_info = f"背景: {'、'.join(bg_parts)}"

        expertise = "、".join(agent["expertise"]) if isinstance(agent["expertise"], list) else agent["expertise"]
        episodes = agent["episodes"] if isinstance(agent["episodes"], list) else []
        episodes_str = "、".join(episodes[:3])

        agent_summaries.append(
            f"- ID: {agent['id']}, ニックネーム: {agent['nickname']}, "
            f"得意分野: {expertise}, {bg_info}, "
            f"エピソード: {episodes_str}"
        )

    agents_text = "\n".join(agent_summaries)

    prompt = f"""以下の質問に対して、各代理AIの関連度を0〜100でスコアリングしてください。
関連度は「この人のバックグラウンドや経験が、この質問に有用な視点を提供できるか」で判断してください。

質問: {question}

代理AI一覧:
{agents_text}

JSON配列で返してください: [{{"id": "uuid", "score": 85}}, ...]"""

    try:
        response = await client.messages.create(
            model=os.getenv('SCORING_MODEL', 'claude-haiku-4-5-20251001'),
            max_tokens=500,
            temperature=0,
            messages=[{"role": "user", "content": prompt}],
        )
    finally:
        await client.close()

    response_text = response.content[0].text.strip()
    # JSON部分を抽出（マークダウンコードブロック対応）
    if "```" in response_text:
        start = response_text.index("```") + 3
        if response_text[start:].startswith("json"):
            start += 4
        end = response_text.index("```", start)
        response_text = response_text[start:end].strip()

    scores = json.loads(response_text)

    # スコアでソート（降順）
    scores.sort(key=lambda x: x["score"], reverse=True)

    # 上位max_p名を選定
    selected_ids = [s["id"] for s in scores[:max_p]]

    # 最低min_p名は確保（スコアが低くても）
    if len(selected_ids) < min_p:
        selected_ids = [s["id"] for s in scores[:min_p]]

    # IDからagentオブジェクトを取得
    agent_map = {a["id"]: a for a in agents}
    selected = [agent_map[aid] for aid in selected_ids if aid in agent_map]

    return selected
