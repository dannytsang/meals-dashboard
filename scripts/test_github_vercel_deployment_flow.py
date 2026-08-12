"""Regression tests for the GitHub -> Vercel deployment boundary."""

from pathlib import Path
import unittest


SYNC_SOURCE = (Path(__file__).resolve().parent / "sync-dashboard-data.py").read_text()


class GitHubVercelDeploymentFlowTests(unittest.TestCase):
    def test_sync_does_not_invoke_legacy_vercel_cli(self):
        self.assertNotIn("def trigger_vercel_deploy", SYNC_SOURCE)
        self.assertNotIn("npx vercel --prod --yes", SYNC_SOURCE)
        self.assertIn("Code deployment delegated to GitHub -> Vercel", SYNC_SOURCE)

    def test_data_sync_entrypoint_remains_present(self):
        self.assertIn("post_dashboard_data_to_api", SYNC_SOURCE)
        self.assertIn("DASHBOARD DATA SYNC", SYNC_SOURCE)


if __name__ == "__main__":
    unittest.main()
