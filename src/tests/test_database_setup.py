import unittest

from helpers.database_setup import (
    DatabaseConfig,
    DatabaseSetupError,
    _friendly_error,
)


class TestDatabaseSetup(unittest.TestCase):
    def test_valid_config(self):
        config = DatabaseConfig(
            host="127.0.0.1",
            port=5400,
            database="ai_study_assistant",
            username="postgres",
            password="secret_password",
        )
        validated = config.validated()
        self.assertEqual(validated.host, "127.0.0.1")
        self.assertEqual(validated.port, 5400)
        self.assertEqual(validated.database, "ai_study_assistant")
        self.assertEqual(validated.username, "postgres")
        self.assertEqual(validated.password, "secret_password")

    def test_invalid_database_name(self):
        invalid_names = ["123db", "my-database", "ai study assistant", "drop table;"]
        for name in invalid_names:
            with self.subTest(name=name):
                config = DatabaseConfig(database=name)
                with self.assertRaises(DatabaseSetupError) as ctx:
                    config.validated()
                self.assertEqual(ctx.exception.code, "invalid_database")

    def test_invalid_port(self):
        invalid_ports = [-1, 0, 70000, "not_a_port"]
        for port in invalid_ports:
            with self.subTest(port=port):
                config = DatabaseConfig(port=port)  # type: ignore
                with self.assertRaises(DatabaseSetupError) as ctx:
                    config.validated()
                self.assertEqual(ctx.exception.code, "invalid_port")

    def test_invalid_host(self):
        invalid_hosts = ["http://localhost", "host with spaces", "host/path"]
        for host in invalid_hosts:
            with self.subTest(host=host):
                config = DatabaseConfig(host=host)
                with self.assertRaises(DatabaseSetupError) as ctx:
                    config.validated()
                self.assertEqual(ctx.exception.code, "invalid_host")

    def test_friendly_error_mapping(self):
        code, msg = _friendly_error(Exception("password authentication failed for user 'postgres'"))
        self.assertEqual(code, "auth_failed")
        self.assertNotIn("postgres", msg)  # does not leak database details

        code, msg = _friendly_error(Exception("connection refused to 127.0.0.1:5432"))
        self.assertEqual(code, "connection_refused")

        code, msg = _friendly_error(Exception("extension 'vector' is not available"))
        self.assertEqual(code, "vector_extension_failed")


if __name__ == "__main__":
    unittest.main()

