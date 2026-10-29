import os
import unittest
from pathlib import Path
from unittest.mock import patch

from helpers.config import Settings


class TestSettings(unittest.TestCase):
    def test_default_values(self):
        # Isolate environment variables so local developer .env in os.environ doesn't override defaults
        with patch.dict(os.environ, {}, clear=True):
            settings = Settings(_env_file=None)
            self.assertEqual(settings.APP_NAME, "AI-Study-Assistant")
            self.assertEqual(settings.POSTGRES_USERNAME, "postgres")
            self.assertEqual(settings.POSTGRES_PORT, 5432)
            self.assertEqual(settings.POSTGRES_HOST, "127.0.0.1")
            self.assertEqual(settings.POSTGRES_MAIN_DATABASE, "ai_study_assistant")
            self.assertEqual(settings.GENERATION_BACKEND, "OPENAI")
            self.assertEqual(settings.EMBEDDING_BACKEND, "OPENAI")
            self.assertIn("application/pdf", settings.FILE_UPLOAD_TYPES)

    def test_provider_key_detection(self):
        with patch.dict(os.environ, {}, clear=True):
            settings = Settings(
                _env_file=None,
                GENERATION_BACKEND="OPENAI",
                OPENAI_API_KEY="sk-test-real-key-12345",
                EMBEDDING_BACKEND="COHERE",
                COHERE_API_KEY="dummy_key",
            )
            self.assertTrue(settings.generation_configured)
            self.assertFalse(settings.embedding_configured)

    def test_aistudy_env_precedence(self):
        with patch.dict(
            os.environ,
            {
                "AISTUDY_DATA_DIR": "/tmp/aistudy_custom",
                "MINIRAG_DATA_DIR": "/tmp/minirag_legacy",
            },
            clear=True,
        ):
            settings = Settings(_env_file=None)
            self.assertEqual(Path(settings.data_dir), Path("/tmp/aistudy_custom"))

    def test_minirag_fallback(self):
        with patch.dict(
            os.environ,
            {
                "MINIRAG_DATA_DIR": "/tmp/minirag_fallback",
            },
            clear=True,
        ):
            settings = Settings(_env_file=None)
            self.assertEqual(Path(settings.data_dir), Path("/tmp/minirag_fallback"))


if __name__ == "__main__":
    unittest.main()
