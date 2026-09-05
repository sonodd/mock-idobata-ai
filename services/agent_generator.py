"""代理AI人格データのバリデーションとsystem_prompt生成（§4.1）"""


def validate_agent_data(data: dict) -> dict:
    """リクエストJSONバリデーション。

    必須: nickname, expertise, personality, tone(characteristics+samples), episodes
    任意: background, values（nullの場合テンプレートで省略）
    """
    required_fields = ["nickname", "expertise", "personality", "tone", "episodes"]
    for field in required_fields:
        if field not in data or data[field] is None:
            raise ValueError(f"必須フィールド '{field}' がありません")

    if not isinstance(data["nickname"], str) or not data["nickname"].strip():
        raise ValueError("nickname は空でない文字列が必要です")

    if not isinstance(data["expertise"], list) or len(data["expertise"]) == 0:
        raise ValueError("expertise は1つ以上の要素を持つ配列が必要です")

    if data["personality"] not in ("共感型", "分析型", "実践型", "理想型"):
        raise ValueError("personality は 共感型/分析型/実践型/理想型 のいずれかが必要です")

    tone = data["tone"]
    if not isinstance(tone, dict):
        raise ValueError("tone はオブジェクトが必要です")
    if not tone.get("characteristics"):
        raise ValueError("tone.characteristics は必須です")
    if not isinstance(tone.get("samples"), list) or len(tone["samples"]) == 0:
        raise ValueError("tone.samples は1つ以上の要素を持つ配列が必要です")

    if not isinstance(data["episodes"], list) or len(data["episodes"]) == 0:
        raise ValueError("episodes は1つ以上の要素を持つ配列が必要です")

    # 任意フィールドのデフォルト
    if "background" not in data:
        data["background"] = None
    if "values" not in data:
        data["values"] = None

    return data


def build_system_prompt(profile: dict) -> str:
    """§4.1.3のテンプレートでsystem_promptを生成。

    backgroundのnullフィールドは省略する。
    """
    # background処理（nullフィールド省略）
    bg_line = ""
    bg = profile.get("background")
    if bg and isinstance(bg, dict):
        bg_parts = [
            v
            for v in [bg.get("label"), bg.get("age_group"), bg.get("occupation"), bg.get("family")]
            if v
        ]
        if bg_parts:
            bg_line = f"- {'、'.join(bg_parts)}\n"

    # values処理（nullの場合省略）
    values_line = ""
    values = profile.get("values")
    if values and isinstance(values, list) and len(values) > 0:
        values_line = f"- 大切にしていること: {'、'.join(values)}\n"

    samples = "\n".join(f"- 「{s}」" for s in profile["tone"]["samples"])
    episodes = "\n".join(f"- {e}" for e in profile["episodes"])

    return f"""あなたは「{profile["nickname"]}」として、井戸端会議に参加しています。

【あなたのプロフィール】
{bg_line}- 得意な話題: {"、".join(profile["expertise"])}
- 性格タイプ: {profile["personality"]}
{values_line}
【あなたの口調】
{profile["tone"]["characteristics"]}

口調の例:
{samples}

【あなたの経験・エピソード】
{episodes}

【会話のルール】
- 専門家の助言ではなく、あくまで自分の経験に基づいた意見として話してください
- 上記のエピソードを自然に会話に織り込んでください
- 他の参加者の発言に対して、同意・補足・別の視点など自然な会話の流れを意識してください
- 具体的な体験談を交えると説得力が出ます
- 1〜3段落程度で簡潔に"""
