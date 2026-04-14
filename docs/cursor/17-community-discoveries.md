# Community Discoveries

> **NON-NORMATIVE**: Everything on this page comes from **third-party sources**. These are **NOT** official Cursor features and may **break**, **violate Terms of Service**, or **change without notice**. Use at your own risk.

> Cursor **3.0.16** context.

Do **not** treat the items below as supported product behavior. Prefer [official-doc] pages in this reference and Cursor’s own documentation.

---

## RPC / Protobuf [community]

- **[everestmz/cursor-rpc](https://github.com/everestmz/cursor-rpc)** — Community **reverse-engineered RPC client** for Cursor-style backends (implementation detail; no stability guarantee).
- **[nhan665/cursor-opencode-auth](https://github.com/nhan665/cursor-opencode-auth)** — Research notes (**RESEARCH.md**) describing **Connect-RPC** + **protobuf** usage, hosts such as **`api2.cursor.sh`** / **`agentn.api5.cursor.sh`**, and headers like **`x-cursor-client-version`**. Third-party documentation only.

---

## Proxy techniques [community]

- **[tensorzero/tensorzero](https://github.com/tensorzero/tensorzero) (CursorZero)** — Proxy patterns discussed in that ecosystem include **CORS** handling, **OpenAI-compatible** base URLs, and **model naming** shims for Cursor-oriented setups (community project; verify license and safety).
- **[jacksonkasi1/copilot-for-cursor](https://github.com/jacksonkasi1/copilot-for-cursor)** — **MITM-style proxy** toward **GitHub Copilot**, **`cus-` model prefix** conventions, and **Anthropic → OpenAI** tool-schema adaptation (high risk; legal and ToS implications).

---

## Similar projects [community]

- **[tmcfarlane/oh-my-cursor](https://github.com/tmcfarlane/oh-my-cursor)** — Multi-agent orchestration patterns for Cursor (related ecosystem; distinct from this repo’s plugin).
- **[code-yeongyu/oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)** — **Upstream / sibling** project this work descends from (community coordination patterns).

---

## Forum tips [community]

- **Open files** are often reported to **improve Composer context** (heuristic; not a spec).
- **forum.cursor.com** threads — qualitative tips and workarounds; **not** contractual product docs.

---

## Traffic routing [community]

Reports (forums, blogs, proxies) commonly claim that:

- Cursor **routes traffic via Cursor-operated infrastructure** first; **localhost-only proxies** may need **exposure** (e.g. **ngrok**) and **CORS** awareness for browser or embedded clients.
- **Different model stacks** may apply to **Ask / Agent / Cmd+K** vs **Tab** (routing is **opaque** and **version-dependent**).

Treat all of the above as **anecdotal** until confirmed for your account, plan, and build.

---

## See also

- [Settings & Feature Flags](15-settings-and-flags.md) — documented vs binary-only vs official settings.
- [Known Sharp Edges](19-known-sharp-edges.md) — operational gotchas with evidence tags.
