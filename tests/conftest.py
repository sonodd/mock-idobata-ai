import os
import pytest
from httpx import AsyncClient, ASGITransport


@pytest.fixture
def test_db_path(tmp_path):
    return str(tmp_path / "test.db")


@pytest.fixture(autouse=False)
async def client(test_db_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", test_db_path)
    # database モジュールの DATABASE_PATH を直接上書き（モジュールキャッシュ対策）
    import database
    monkeypatch.setattr(database, "DATABASE_PATH", test_db_path)
    database.init_db()
    from app import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
