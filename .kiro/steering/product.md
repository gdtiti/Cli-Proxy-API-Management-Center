# CLI Proxy API Management Center

A single-file WebUI for managing and troubleshooting the CLI Proxy API service.

## Purpose

This is a management dashboard that connects to the CLI Proxy API's Management API (`/v0/management`) to:
- Configure proxy settings (debug, retry, quota fallback, logging)
- Manage API keys for proxy access
- Configure AI providers (Gemini, Claude, OpenAI, Codex, Ampcode)
- Upload/manage authentication credentials (JSON files)
- Handle OAuth flows for supported providers
- Monitor usage statistics (requests, tokens, costs)
- Edit server config.yaml in-browser
- View and search logs
- Check system status and available models

## Key Characteristics

- **Single HTML output**: Builds to one self-contained HTML file with all assets inlined
- **Management-only**: Does not proxy traffic; only manages the CLI Proxy API service
- **Requires backend**: Connects to a running CLI Proxy API instance (minimum v6.3.0)
- **Authentication**: Uses a management key (different from proxy API keys) sent via Bearer token

## Target Users

Administrators and operators of CLI Proxy API deployments who need a visual interface for configuration, monitoring, and troubleshooting.
