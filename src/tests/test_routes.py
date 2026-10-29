import os
import unittest
from unittest.mock import patch

from starlette.testclient import TestClient

from main import app


class TestRoutes(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app, raise_server_exceptions=False)

    def test_health_check_structure(self):
        response = self.client.get("/api/v1/health")
        # May be 200 (if DB is live) or 503 (if degraded without DB)
        self.assertIn(response.status_code, [200, 503])
        data = response.json()
        self.assertIn("status", data)
        self.assertIn("app", data)
        self.assertEqual(data["app"]["name"], "AI-Study-Assistant")
        self.assertIn("database", data)
        self.assertIn("configured", data["database"])
        self.assertIn("migration", data)
        self.assertIn("vectordb", data)
        self.assertIn("generation", data)
        self.assertIn("embedding", data)

    def test_system_info(self):
        response = self.client.get("/api/v1/system/info")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["app_name"], "AI-Study-Assistant")
        self.assertIn("upload", data)
        self.assertIn("providers", data)
        self.assertIn("vectordb", data)
        self.assertIn("preview", data)
        self.assertIn("chunking", data)

    def test_setup_status(self):
        response = self.client.get("/api/v1/setup/status")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("configured", data)
        self.assertIn("database", data)
        self.assertIn("generation", data)
        self.assertIn("embedding", data)
        # Verify secrets are omitted
        self.assertNotIn("password", data["database"])
        self.assertIn("password_set", data["database"])

    def test_setup_test_db_validation(self):
        # Invalid payload should be rejected with 400 and safe error message
        response = self.client.post(
            "/api/v1/setup/test-db",
            json={
                "host": "invalid host with spaces",
                "port": 5400,
                "database": "ai_study_assistant",
                "username": "postgres",
                "password": "",
            },
        )
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertFalse(data["ok"])
        self.assertEqual(data["code"], "invalid_host")

    def test_token_auth_middleware(self):
        test_token = "test-secret-bearer-token-12345"
        with patch.dict(os.environ, {"AISTUDY_API_TOKEN": test_token}):
            # Request without token should be 401
            unauth = self.client.get("/api/v1/system/info")
            self.assertEqual(unauth.status_code, 401)
            self.assertEqual(unauth.json(), {"detail": "Unauthorized"})

            # Request with wrong token should be 401
            wrong = self.client.get(
                "/api/v1/system/info",
                headers={"Authorization": "Bearer wrong-token"},
            )
            self.assertEqual(wrong.status_code, 401)

            # Request with correct token should succeed
            authorized = self.client.get(
                "/api/v1/system/info",
                headers={"Authorization": f"Bearer {test_token}"},
            )
            self.assertEqual(authorized.status_code, 200)

            # OPTIONS request is exempt
            options = self.client.options("/api/v1/system/info")
            self.assertNotEqual(options.status_code, 401)


if __name__ == "__main__":
    unittest.main()
