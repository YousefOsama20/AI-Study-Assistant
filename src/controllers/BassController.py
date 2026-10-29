from helpers.config import get_settings, Settings
import os 
import random
import string

class BassController:

    def __init__(self):
        self.app_setting = get_settings()

        # ``Settings.data_dir`` prefers AISTUDY_DATA_DIR, then the legacy
        # MINIRAG_DATA_DIR, and falls back to a per-user directory when frozen.
        self.base_dir = self.app_setting.data_dir

        self.files_dir = os.path.join(
            self.base_dir,
            "assets/files"
        )
        self.database_dir = os.path.join(
            self.base_dir,
            "assets/database"
        )

    def generate_random_string(self, length: int = 8) -> str:
        return ''.join(random.choices(string.ascii_letters + string.digits, k=length))

    def normalize_language(self, language: str = None) -> str:
        default_language = self.app_setting.PRIMARY_LANG or self.app_setting.DEFAULT_LANG or "en"
        candidate = (language or "").strip().lower()
        if not candidate:
            return default_language

        locales_dir = os.path.join(
            os.path.dirname(__file__), "..", "stores", "llm", "templates", "locales"
        )
        if os.path.isdir(os.path.join(locales_dir, candidate)):
            return candidate
        return default_language

    def language_name(self, language: str) -> str:
        return {
            "ar": "العربية",
            "en": "English",
        }.get(language, language)

    def get_database_path(self, db_name: str):

        database_path = os.path.join(self.database_dir, db_name)

        if not os.path.exists(database_path):
            os.makedirs(database_path)

        return database_path
        