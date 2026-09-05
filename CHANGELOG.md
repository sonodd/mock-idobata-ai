# 変更履歴

## 2026-02-16

### バグ修正: 会話生成時のSQLエラー (`conversation.py`)

`_get_all_agents` 関数内のSQLで `values` が SQLite の予約語であるにもかかわらずクォートされておらず、`sqlite3.OperationalError: near "values": syntax error` が発生していた。

- **原因**: `SELECT ... personality, values, tone ...` の `values` が未クォート
- **修正**: `"values"` にダブルクォートを付与
- **影響**: スレッド作成後の会話生成が全件 `status: error` になっていた

### 機能追加: 「自分」の代理AIによる会話開始

会話の起点を「人間が投稿した質問文をそのまま提示」から「自分の代理AIが自分の言葉でお題を投げかける」形に変更。

#### 変更ファイルと内容

| ファイル | 変更内容 |
|---------|---------|
| `database.py` | `agent_profiles` テーブルに `is_self INTEGER NOT NULL DEFAULT 0` カラムを追加。既存DBへのマイグレーション処理も追加 |
| `app.py` | `CreateAgentRequest` に `is_self: bool` フィールド追加。登録時に `is_self=true` は1人だけに排他制御。一覧APIのレスポンスに `is_self` を含める |
| `services/conversation.py` | 会話フローを変更（後述） |
| `static/index.html` | エージェント登録フォームに「この代理AIは「自分」として登録する」チェックボックスを追加 |
| `static/app.js` | `is_self` をAPI送信。エージェントカードに「自分」バッジを表示 |
| `static/style.css` | 自分バッジ (`.self-badge`)、自分カードのハイライト (`.agent-card--self`)、チェックボックスラベルのスタイルを追加 |

#### 会話フローの変更 (`run_idobata_kaigi`)

**変更前:**
1. 全エージェントから参加者を選定
2. 各参加者が順番に発言（人間の質問文をそのまま提示）
3. 最初の発言者がまとめ

**変更後:**
1. `is_self=true` のエージェントを「自分」として特定
2. 自分以外のエージェントから参加者を選定
3. **自分の代理AIが、質問を自分の状況・背景を交えて自然に切り出す**
4. 他の参加者が順番に応答
5. **自分以外の最初の発言者**がまとめ
