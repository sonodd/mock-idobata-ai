"""Regression checks for the public-release review; no real AI requests."""
import asyncio
import os
import subprocess
import sys
import threading
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from tests.test_agents import SAMPLE_AGENT
from tests.test_threads import make_mock_anthropic, CONV_PATCH


@pytest.fixture(autouse=True)
def dummy_key(monkeypatch):
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'dummy-test-key')


@pytest.mark.parametrize('change', [
    {'personality': 'invalid'}, {'nickname': '  '},
    {'tone': {'samples': ['hello']}}, {'background': {'label': 123}},
    {'episodes': []}, {'nickname': 'x' * 201},
])
async def test_invalid_profiles_return_422(client, change):
    assert (await client.post('/api/agents', json={**SAMPLE_AGENT, **change})).status_code == 422


@pytest.mark.parametrize('question', ['', '  ', 'x' * 4001])
async def test_invalid_question_does_not_start_generation(client, question):
    assert (await client.post('/api/threads', json={'question': question})).status_code == 422
    assert (await client.get('/api/threads')).json()['threads'] == []


async def create_conversation(client):
    agent = (await client.post('/api/agents', json=SAMPLE_AGENT)).json()['id']
    with patch(CONV_PATCH, return_value=make_mock_anthropic()):
        thread = (await client.post('/api/threads', json={'question': 'test'})).json()['id']
    return agent, thread


async def test_delete_requires_removing_history_first(client):
    agent, thread = await create_conversation(client)
    await client.get(f'/api/threads/{thread}/report')
    assert (await client.delete(f'/api/agents/{agent}')).status_code == 409
    assert (await client.delete(f'/api/threads/{thread}')).status_code == 200
    assert (await client.get(f'/api/threads/{thread}')).status_code == 404
    assert (await client.get(f'/api/threads/{thread}/report')).status_code == 404
    assert (await client.delete(f'/api/agents/{agent}')).status_code == 200
    import database
    conn = database.get_db()
    try:
        assert conn.execute('SELECT COUNT(*) FROM return_reports').fetchone()[0] == 0
        assert conn.execute('SELECT COUNT(*) FROM messages').fetchone()[0] == 0
    finally:
        conn.close()


async def test_follow_up_refreshes_report(client):
    _, thread = await create_conversation(client)
    before = (await client.get(f'/api/threads/{thread}/report')).json()
    mock = make_mock_anthropic()
    with patch(CONV_PATCH, return_value=mock):
        assert (await client.post(f'/api/threads/{thread}/follow-up', json={'question': 'extra'})).status_code == 200
    after = (await client.get(f'/api/threads/{thread}/report')).json()
    assert after['total_turns'] > before['total_turns']
    assert after['total_turns'] == len((await client.get(f'/api/threads/{thread}')).json()['messages'])
    prompt = mock.messages.create.call_args_list[0].kwargs['messages'][0]['content']
    assert prompt.count('【追加質問】') == 1


async def test_generation_failures_are_errors(client):
    await client.post('/api/agents', json=SAMPLE_AGENT)
    with patch(CONV_PATCH, return_value=make_mock_anthropic()), patch(
        'services.conversation._call_claude_with_retry', side_effect=RuntimeError('mock failure')
    ):
        thread = (await client.post('/api/threads', json={'question': 'test'})).json()['id']
    result = (await client.get(f'/api/threads/{thread}')).json()
    assert result['status'] == 'error'
    assert result['messages'] == []


async def test_missing_key_cleans_up_job(client, monkeypatch):
    monkeypatch.delenv('ANTHROPIC_API_KEY')
    thread = (await client.post('/api/threads', json={'question': 'test'})).json()['id']
    assert (await client.get(f'/api/threads/{thread}')).json()['status'] == 'error'
    from services.conversation import get_thread_queue
    assert get_thread_queue(thread) is None


async def test_reject_overlapping_jobs_and_active_delete(client):
    from app import app
    async def no_generation(*args):
        pass
    with patch('app.run_idobata_kaigi', side_effect=no_generation):
        thread = (await client.post('/api/threads', json={'question': 'test'})).json()['id']
    assert (await client.post('/api/threads', json={'question': 'second'})).status_code == 409
    assert (await client.post(f'/api/threads/{thread}/follow-up', json={'question': 'extra'})).status_code == 409
    assert (await client.delete(f'/api/threads/{thread}')).status_code == 409
    assert (await client.get(f'/api/threads/{thread}/report')).status_code == 409
    async with app.router.lifespan_context(app):
        assert (await client.get(f'/api/threads/{thread}')).json()['status'] == 'error'


async def test_stream_replays_to_multiple_subscribers(client):
    from app import stream_thread
    from services.conversation import ConversationStream, _thread_queues
    _, thread = await create_conversation(client)
    original = (await client.get(f'/api/threads/{thread}')).json()['messages']
    q = ConversationStream()
    _thread_queues[thread] = q
    try:
        for msg in original:
            await q.put(msg)
        await q.put(None)
        async def collect():
            response = await stream_thread(thread)
            return ''.join([chunk async for chunk in response.body_iterator])
        one, two = await asyncio.wait_for(asyncio.gather(collect(), collect()), timeout=2)
        assert one == two
        assert one.count('event: message\n') == len(original)
        assert one.count('event: complete\n') == 1
    finally:
        _thread_queues.pop(thread, None)


async def test_slow_sdk_does_not_block_event_loop():
    from services.conversation import _call_claude_with_retry
    entered, released = threading.Event(), threading.Event()
    def slow(**kwargs):
        entered.set()
        assert released.wait(timeout=2), 'event loop was blocked'
        return MagicMock(content=[MagicMock(text='ok')])
    mock = MagicMock()
    mock.messages.create.side_effect = slow
    async def release():
        await asyncio.to_thread(entered.wait, 2)
        released.set()
    result, _ = await asyncio.gather(_call_claude_with_retry(mock), release())
    assert result == 'ok'


async def test_untrusted_host_rejected(client):
    assert (await client.get('/api/agents', headers={'host': 'attacker.invalid'})).status_code == 400


def test_dotenv_database_path_loaded_before_database_import(tmp_path):
    # Copy only the module so no developer .env or real DB can be touched.
    import database
    (tmp_path / 'database.py').write_text(Path(database.__file__).read_text())
    expected = str(tmp_path / 'custom.db')
    (tmp_path / '.env').write_text(f'DATABASE_PATH={expected}\n')
    env = {k: v for k, v in os.environ.items() if k not in ('DATABASE_PATH', 'PYTHONPATH')}
    result = subprocess.check_output([sys.executable, '-c', 'import database; print(database.DATABASE_PATH)'], cwd=tmp_path, env=env, text=True)
    assert result.strip() == expected
