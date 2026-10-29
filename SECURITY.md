# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.1.x   | :white_check_mark: |
| 1.0.x   | :x:                |

## Architecture & Security Boundary

AI-Study-Assistant is designed as a single-user, local-first desktop application:

1. **Local IPC Isolation**: The renderer process has no Node.js integration and cannot access the filesystem or network directly. All communication with the FastAPI backend flows through an Electron IPC bridge with strict route, payload size, and filename allowlists.
2. **Packaged Token Authentication**: In packaged mode, the backend requires a per-launch 64-hex bearer token (`AISTUDY_API_TOKEN`) passed from the Electron main process via HTTP headers. The renderer never sees this token.
3. **No Credential Exposure**:
   - Provider API keys (OpenAI, Cohere, Gemini) and database passwords are stored in `%APPDATA%\AI-Study-Assistant\.env` with user-only permissions.
   - Non-secret configurations are separated into `config.json`.
   - Setup and health endpoints never return credentials or secrets in JSON responses.
   - Backend logs automatically redact API keys, tokens, and passwords.
4. **Content Security Policy (CSP)**: The renderer is locked to local script execution and denies unauthorized inline scripts or remote content loading.

## Reporting a Vulnerability

If you discover a security vulnerability in AI-Study-Assistant, please report it privately:

- **Do NOT open a public GitHub issue** for undisclosed security vulnerabilities.
- Please email the maintainers or report via GitHub Security Advisories if enabled.
- Include detailed steps to reproduce the vulnerability, including platform information and affected versions.
- We aim to acknowledge receipt of vulnerability reports within 48 hours and provide a timeline for fixes.

