import pytest


@pytest.fixture(autouse=True)
def _isolated_home(tmp_path, monkeypatch):
    """Keep every test away from the real %APPDATA%/~ folders."""
    monkeypatch.setenv("MINDSETFOREST_HOME", str(tmp_path / "home"))
