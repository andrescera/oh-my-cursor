# Cloud Agents API

> Cursor 3.0.16. Evidence tags per claim.

Evidence tags: `[official-doc]`, `[changelog]`, `[repro-local]`, `[binary-only]`, `[community]`.

## Base URL and authentication

Cursor documents an **HTTP REST** API hosted at **`api.cursor.com`**, authenticated with **HTTP Basic** auth (API key as username; password empty per docs). [official-doc]

## Endpoints (as documented)

| Method | Path | Evidence |
|--------|------|----------|
| GET | `/agents` | [official-doc] |
| GET | `/agents/:id` | [official-doc] |
| GET | `/agents/:id/conversation` | [official-doc] |
| GET | `/agents/:id/artifacts` | [official-doc] |
| POST | `/agents` | [official-doc] |
| POST | `/agents/:id/followup` | [official-doc] |
| POST | `/agents/:id/stop` | [official-doc] |
| DELETE | `/agents/:id` | [official-doc] |
| GET | `/me` | [official-doc] |
| GET | `/models` | [official-doc] |
| GET | `/repositories` | [official-doc] |

## Product context (3.0+)

**Cursor 3.0+** release notes cover cloud agent features, including **handoff** between surfaces and **self-hosted** options (noted around **March 2026** in changelog material). [changelog 3.0]

## Limits and policy

- **MCP** is **not** supported for cloud agents in Cursor’s documented limitations. [official-doc]
- **429** rate limiting applies per API policy. [official-doc]
- Availability and quotas are tied to **Enterprise** / **Teams** (and related) offerings as described in docs. [official-doc]

## oh-my-cursor

Cloud agents are **experimental** in this project (`/cloud-agents` command family). [repro-local]
