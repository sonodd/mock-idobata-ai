# idobata-ai (井戸端会議AI)

> AI agents hold casual group discussions on your behalf — just post a question and watch your "digital self" and friends talk it through.

**井戸端会議** (idobata kaigi) is a Japanese term for casual watercooler-style conversations. This app simulates those discussions among AI agents representing real people.

---

## Overview

idobata-ai is an AI agent chat simulator. You register AI agents with personality profiles, then post a question or topic — the agents automatically hold a multi-turn group discussion, streamed in real time. One special "self" agent represents *you*, opening the conversation in your own voice.

**Typical flow:**
1. Register AI agents with personality, expertise, tone, and background
2. Designate one as your "self" agent
3. Post a question or topic
4. Watch the agents discuss it in real time (SSE streaming)
5. Read the auto-generated conversation report with highlights and recommendations

---

## Features

- **AI Agent Profiles** — Create agents with nickname, background, expertise areas, personality, tone, and characteristic episodes
- **"Self" Agent** — Designate one agent as yourself; it opens every discussion in your voice
- **Group Discussions** — 2–3 participants automatically selected per topic via Claude Haiku
- **Real-time Streaming** — Conversation messages streamed via Server-Sent Events (SSE)
- **Follow-up Questions** — Continue any discussion with additional questions
- **Conversation Reports** — Auto-generated summaries with highlights, notable quotes, and actionable hints
- **Full Agent CRUD** — Create, list, update, and delete agent profiles

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.10+ · FastAPI · Uvicorn |
| AI | Anthropic Claude (Haiku for selection · Sonnet for conversation) |
| Database | SQLite (via `database.py`, auto-created at startup) |
| Frontend | React 18 · Vite (served from `/dist`) |
| Config | python-dotenv |
| Testing | pytest · httpx · anyio |

---

## Setup

### Prerequisites

- Python 3.10+
- Node.js 18+ (only if you want to rebuild the frontend)
- An [Anthropic API key](https://console.anthropic.com/)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-username/idobata-ai.git
cd idobata-ai

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Configure environment variables
cp .env.example .env
# Open .env and set your ANTHROPIC_API_KEY
```

### Start the server

```bash
python app.py
```

Then open **http://localhost:8000** in your browser.

> The React frontend is pre-built in `/dist` and served automatically by FastAPI. No separate `npm` command is needed to run the app.

### (Optional) Rebuild the frontend

```bash
cd frontend
npm install
npm run build
```

---

## Usage

### 1. Register agents

Click **"エージェント追加"** and fill in the profile form:

- **ニックネーム** — Display name
- **バックグラウンド** — Background / life context
- **専門領域** — Areas of expertise (e.g. `engineering`, `parenting`)
- **人格** — Personality description
- **口調** — Tone settings (formal/casual, verbose/concise, etc.)
- **エピソード** — Characteristic anecdotes that shape the agent's voice
- **「自分」として登録** — Check this box for exactly one agent to designate it as *you*

### 2. Start a discussion

Click **"質問する"**, type your question or topic, and submit. The "self" agent opens the thread, then 2–3 other agents respond in turn.

### 3. Watch in real time

Messages appear as they are generated. A spinner indicates the discussion is in progress.

### 4. Read the report

Once the discussion ends, click **"レポートを見る"** to view the auto-generated summary: key highlights, memorable quotes, and actionable hints.

### 5. Ask a follow-up

Click **"追加質問"** on any thread to continue the discussion with a new question.

---

## Screenshots

> Screenshots will be added before the first public release.

<!-- Placeholder: add images to docs/screenshots/ and reference them here -->
<!-- Example: ![Home screen](docs/screenshots/home.png) -->

---

## Environment Variables

Copy `.env.example` to `.env` and set the values:

```
ANTHROPIC_API_KEY=your_anthropic_api_key_here
DATABASE_PATH=./data/idobata.db
MIN_PARTICIPANTS=2
MAX_PARTICIPANTS=3
PORT=8000
```

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | **Required.** Your Anthropic API key | — |
| `DATABASE_PATH` | Path to the SQLite database file | `./data/idobata.db` |
| `MIN_PARTICIPANTS` | Minimum number of agents per discussion | `2` |
| `MAX_PARTICIPANTS` | Maximum number of agents per discussion | `3` |
| `PORT` | Server listening port | `8000` |

See [`.env.example`](.env.example) for the full template.

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/agents` | Create a new agent profile |
| `GET` | `/api/agents` | List all registered agents |
| `PUT` | `/api/agents/{agent_id}` | Update an agent profile |
| `DELETE` | `/api/agents/{agent_id}` | Delete an agent (self-agents are protected) |
| `POST` | `/api/threads` | Post a question and start a discussion |
| `GET` | `/api/threads/{thread_id}` | Get thread details and full message history |
| `GET` | `/api/threads/{thread_id}/stream` | Real-time SSE stream of discussion progress |
| `GET` | `/api/threads/{thread_id}/report` | Get (or generate) the conversation report |
| `POST` | `/api/threads/{thread_id}/follow-up` | Add a follow-up question to a thread |

Interactive API docs are available at **http://localhost:8000/docs** when the server is running.

---

## Project Structure

```
idobata-ai/
├── app.py                       # FastAPI main — all HTTP endpoints
├── database.py                  # SQLite initialization and connection pooling
├── services/
│   ├── agent_generator.py       # Personality validation and system prompt generation
│   ├── participant_selector.py  # Participant selection logic (Claude Haiku)
│   ├── conversation.py          # Multi-turn conversation generation (Claude Sonnet)
│   └── report_generator.py      # Conversation report generation
├── frontend/                    # React + Vite source
├── dist/                        # Pre-built frontend (served by FastAPI)
├── tests/                       # pytest test suite
├── data/                        # SQLite database (auto-created)
├── .env.example                 # Environment variable template
├── requirements.txt             # Python dependencies
└── CHANGELOG.md                 # Version history
```

---

## License

MIT — see [LICENSE](LICENSE) for details.
