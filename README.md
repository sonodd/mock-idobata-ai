# idobata-ai（井戸端会議AI）

プロフィールから作った複数の代理AIが、質問について雑談する会話シミュレーターです。自分役のAI、参加者選定、SSEによる発言配信、発言を抜粋した帰還レポートを試せます。

**ローカル・単一ユーザー向けの実験用アプリです。** 認証・ユーザーごとのデータ分離はありません。標準起動は `127.0.0.1` のみを待ち受けます。共有サーバー、外部ネットワーク公開、複数workerでの運用はサポートしていません。リポジトリ名に `mock` とありますが、通常の会話生成には実際のAnthropic APIを使用し、料金が発生します。

## データとAIの出力について

- **送信先**: 会議開始・追加質問時に、質問、参加者のプロフィールから作ったプロンプト、会話履歴をAnthropicへ送信します。参加者選定が必要な場合は、候補者のニックネーム・専門領域・背景・エピソード先頭3件も送信します。選ばれなかった候補者の情報も対象になります。
- **入力する情報**: APIキー・秘密情報・業務上の機密をプロフィールや質問に入力しないでください。実在人物を参考にする場合は本人への配慮を行い、本名・連絡先や、体験談の組み合わせから特定できる情報を避けてください。
- **保存先**: プロフィール、質問、会話、レポートはローカルのSQLiteファイルに保存します。アプリ独自の暗号化や自動の期限付き削除はありません。ブラウザのlocalStorageには使い方ガイドの表示設定を保存します。外部Webフォントの読み込みは行いません。
- **費用**: 設定したAPIキーの所有者に課金されます。標準の参加者3人＋自分役1人なら、初回は通常5回の会話生成呼び出しです。候補者が多ければ選定呼び出しも加わり、追加質問・再試行で増えます。アプリに金額の予算上限はありません。料金・利用制限・データの取扱いは[Anthropic公式ドキュメント](https://docs.anthropic.com/)で確認してください。
- **意味と限界**: 生成発言は実在人物の発言・意見・経験を表すものではなく、事実確認や専門家の助言の代わりにはなりません。リアクションは**ランダムな演出**です。帰還レポートはリアクション数などのルールによる選択と発言の抜粋であり、別のAIによる検証や独立した賛同を意味しません。

## 構成

| 項目 | 内容 |
|---|---|
| バックエンド | Python 3.10+、FastAPI、Uvicorn |
| AI | Anthropic Claude。参加者選定はHaiku、会話はSonnet（設定で変更可能） |
| データベース | SQLite。起動時に作成・既存スキーマを補完 |
| フロントエンド | React 19、TypeScript、Vite 7。ビルド済み `dist/` をFastAPIから配信 |
| テスト | pytest、pytest-asyncio、httpx。AI呼び出しはモック |

## セットアップ

必要なものはPython 3.10以上とAnthropic APIキーです。フロントエンドを再ビルドする場合のみ、Node.js **20.19以上の20系、または22.12以上**が必要です。

```bash
git clone https://github.com/sonodd/mock-idobata-ai.git
cd mock-idobata-ai
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --require-hashes -r requirements.txt
cp .env.example .env
```

Windowsでは仮想環境の有効化に `.venv\Scripts\activate` を使用します。`.env` に自分の `ANTHROPIC_API_KEY` を記入し、リポジトリのルートで起動します。

```bash
python app.py
```

[http://localhost:8000](http://localhost:8000) を開いてください。既に配信可能な `dist/` が含まれるので、通常の起動にnpmは不要です。`--host 0.0.0.0` やトンネル等で外部公開しないでください。Hostヘッダーもlocalhost/ループバックに限定していますが、これは認証の代替ではありません。

### 既存環境の更新

サーバーを停止し、後述の方法でDBをバックアップしてから、更新コードと固定済み依存関係を適用します。

```bash
git pull
source .venv/bin/activate
python -m pip install --require-hashes -r requirements.txt
python app.py
```

以前の版で `.env` の `DATABASE_PATH` が反映されず `./data/idobata.db` に保存されていた場合があります。更新後は `.env` が正しく反映されるため、**実際の既存DBを指すパスに合わせてから起動**してください。誤ったパスでは空のDBが新規作成されます。更新による自動のデータ削除はありません。

## 使い方

1. 「代理AIを登録する」から、ニックネーム、性格、背景、得意分野、口調、エピソードを含むJSONを貼り付けて登録します。画面にはJSON作成用のプロンプトがあります。外部サービスでJSONを作る場合も、入力する設定を匿名化してください。詳細は[ペルソナ設定ガイド](docs/persona-guide.md)を参照してください。
2. 必要なら1人を「自分」に設定します。新しい自分役を指定すると、以前の指定が解除されます。
3. 質問を入力して会議を開始します。自分役がいる場合は最初の発言を担当し、他の参加者が応答してまとめます。
4. 完了後にレポートと会話を確認し、必要なら追加質問します。

生成はアプリ全体で一度に1件です。別の生成中に会議を開始・追加質問すると409を返します。複数タブは同じ会議を購読できます。入力質問は1回4,000文字まで、追加質問を含む質問履歴は約20,000文字まで、100発言に達した会議への追加質問は受け付けません。1ラウンド分は100発言を超える場合があります。これは金額上限ではありません。

生成がすべて失敗するとエラーになります。一部だけ成功した場合は、成功した発言を保存して完了します。サーバー停止で中断した会議は再起動時にエラーへ変更されます。永続ジョブや自動再開はありません。

## 設定

`.env` はリポジトリルートのファイルを読み込みます。同名のプロセス環境変数があればそちらを優先します。

| 変数 | 既定値 | 説明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | なし | 会話生成に必須。サーバー側だけで使用 |
| `DATABASE_PATH` | `./data/idobata.db` | SQLite保存先。相対パスは起動ディレクトリ基準。絶対パスも利用可能 |
| `MIN_PARTICIPANTS` | `2` | 選定時の目標最低人数。登録不足の場合は保証しない |
| `MAX_PARTICIPANTS` | `3` | 自分役以外の選定人数の上限 |
| `CONVERSATION_MODEL` | `claude-sonnet-4-6` | 会話生成モデル |
| `SCORING_MODEL` | `claude-haiku-4-5-20251001` | 参加者選定モデル |
| `PORT` | `8000` | `python app.py` の待ち受けポート |

参加人数は `1 <= MIN_PARTICIPANTS <= MAX_PARTICIPANTS <= 10` に設定してください。候補数がMAX以下なら選定APIを呼ばず全員が参加します。モデルの利用可否は契約・提供状況によります。

## 保存データの削除とバックアップ

個別の会議はAPIから削除できます。会議IDは履歴一覧APIまたは `/docs` で確認します。

```bash
curl http://localhost:8000/api/threads
# THREAD_IDを削除する会議のIDに置き換える。会話とレポートも削除されます。
curl -X DELETE http://localhost:8000/api/threads/THREAD_ID
```

生成中の会議は削除できません。会議履歴が参照する代理AIの削除は409になります。関連する会議を削除してから代理AIを削除してください。「自分」役は指定を解除してから削除します。削除UIは現在ありません。

バックアップする場合はサーバーを完全に停止し、設定されたDBファイルと、同じパスに `-wal`・`-shm` を付けたファイル（存在する場合）をまとめて非公開の場所にコピーします。全件を消去する場合もサーバーを停止し、保存先を確認したうえでそれらのファイルを削除して再起動してください。バックアップにも同じ個人情報が含まれるため別途管理します。

APIによる削除は論理的なレコードの削除です。SQLiteの空き領域、OSのバックアップ、外部サービスの保存まで安全に消去することを保証する機能ではありません。

## API

[対話型APIドキュメント](http://localhost:8000/docs)では入力制約も確認できます。

| Method | Path | 内容 |
|---|---|---|
| POST / GET | `/api/agents` | 代理AI登録 / 全プロフィール一覧 |
| PUT / DELETE | `/api/agents/{id}` | 更新 / 削除。履歴から参照中は削除不可 |
| POST / GET | `/api/threads` | 会議開始 / 履歴一覧 |
| GET / DELETE | `/api/threads/{id}` | 会話取得 / 会議・会話・レポート削除 |
| GET | `/api/threads/{id}/stream` | SSE。message / complete / errorイベント |
| GET | `/api/threads/{id}/report` | 保存された発言からレポートを再生成。生成中は409 |
| POST | `/api/threads/{id}/follow-up` | 追加質問。生成中は409 |

`GET /api/agents` は生成済みsystem promptを返しません。入力不正は422、存在しないIDは404、処理中・履歴参照等の競合は409です。

## 開発と検証

```bash
# 仮想環境を有効にしたリポジトリルートで
python -m pytest -q

# 別ターミナルでフロントエンド開発。バックエンドも起動しておく
cd frontend
npm ci
npm run dev
```

開発画面は [http://localhost:5173](http://localhost:5173)。`/api` はlocalhost:8000へ転送します。バックエンドのPORTを変更した場合は `frontend/vite.config.ts` のプロキシも合わせます。

```bash
cd frontend
npm run lint
npm run build
npm audit
```

ビルドはルートの `dist/` を置き換えます。フロントエンド更新時はソース・ロック・再ビルドしたdistを一緒にレビューしてください。旧 `static/` は参考用の旧UIで、通常起動では配信されません。スクリーンショットはまだ用意していません。

Pythonの直接依存は `requirements.in`、推移的依存とハッシュは `requirements.txt` で管理します。[uv](https://docs.astral.sh/uv/)がある環境で更新できます。

```bash
uv pip compile --python-version 3.10 --universal --generate-hashes --upgrade requirements.in -o requirements.txt
python -m pip install --require-hashes -r requirements.txt
python -m pytest -q
uv tool run --from pip-audit pip-audit --no-deps --disable-pip -r requirements.txt
```

テストは実APIを使用しません。実際のAPI疎通確認は別途必要です。既知脆弱性は公開情報の追加で変わるため、依存更新時に監査を繰り返してください。安全性の保証や公開サーバー向けの運用支援は提供していません。問題報告方法は[CONTRIBUTING.md](CONTRIBUTING.md)、機密性のある報告は[SECURITY.md](SECURITY.md)を参照してください。

## ライセンス

[MIT License](LICENSE)。変更履歴は[CHANGELOG.md](CHANGELOG.md)を参照してください。
