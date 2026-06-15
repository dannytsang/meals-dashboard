"""Tests for sync-dashboard-data.py environment loading.

The canonical meals pipeline loads ~/.hermes/.env before spawning this script, but
manual/direct invocations of scripts/sync-dashboard-data.py should behave the same
way. This pins the long-term fix for the 018 T072 production-Blob gap: direct sync
must be able to pick up MEALS_DASHBOARD_DATA_SECRET from the Hermes env file.
"""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parent / "sync-dashboard-data.py"


def load_module():
    spec = importlib.util.spec_from_file_location("sync_dashboard_data", MODULE_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class DashboardEnvLoadingTests(unittest.TestCase):
    def test_load_dashboard_env_populates_missing_values_from_hermes_env_file(self):
        module = load_module()
        with tempfile.TemporaryDirectory() as tmp:
            env_file = Path(tmp) / ".env"
            env_file.write_text(
                "# comments are ignored\n"
                "MEALS_DASHBOARD_DATA_SECRET=secret-from-hermes\n"
                "BLOB_READ_WRITE_TOKEN=blob-token-from-hermes\n"
                "DASHBOARD_DATA_API_URL=https://example.test/api/dashboard-sync\n"
            )
            env = {}

            loaded = module.load_dashboard_env(env=env, env_path=env_file)

        self.assertIs(loaded, env)
        self.assertEqual(env["MEALS_DASHBOARD_DATA_SECRET"], "secret-from-hermes")
        self.assertEqual(env["BLOB_READ_WRITE_TOKEN"], "blob-token-from-hermes")
        self.assertEqual(env["DASHBOARD_DATA_API_URL"], "https://example.test/api/dashboard-sync")

    def test_load_dashboard_env_does_not_override_existing_process_values(self):
        module = load_module()
        with tempfile.TemporaryDirectory() as tmp:
            env_file = Path(tmp) / ".env"
            env_file.write_text(
                "MEALS_DASHBOARD_DATA_SECRET=secret-from-file\n"
                "BLOB_READ_WRITE_TOKEN=blob-token-from-file\n"
            )
            env = {"MEALS_DASHBOARD_DATA_SECRET": "secret-from-process"}

            module.load_dashboard_env(env=env, env_path=env_file)

        self.assertEqual(env["MEALS_DASHBOARD_DATA_SECRET"], "secret-from-process")
        self.assertEqual(env["BLOB_READ_WRITE_TOKEN"], "blob-token-from-file")

    def test_load_dashboard_env_ignores_missing_file(self):
        module = load_module()
        env = {}

        loaded = module.load_dashboard_env(env=env, env_path=Path("/tmp/does-not-exist-for-sync-test.env"))

        self.assertIs(loaded, env)
        self.assertEqual(env, {})


if __name__ == "__main__":
    unittest.main()
