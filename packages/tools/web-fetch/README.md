# @sisu-ai/tool-web-fetch

Fetch a web page by URL and return text, HTML, or JSON for LLM consumption.

Install
```bash
npm i @sisu-ai/tool-web-fetch
```

Environment / Flags
- `WEB_FETCH_USER_AGENT` or `HTTP_USER_AGENT` (flag: `--web-fetch-user-agent`)
- `WEB_FETCH_MAX_BYTES` (flag: `--web-fetch-max-bytes`) — default 500kB
- `WEB_FETCH_RESPECT_ROBOTS` (flag: `--web-fetch-respect-robots`) — `1`/`true` (default) to honor robots.txt; set `0`/`false` to disable

Tool
- Name: `webFetch`
- Args: `{ url: string; format?: 'text'|'html'|'json'; maxBytes?: number }`
- Returns: `{ url, finalUrl?, status, contentType?, title?, text?, html?, json? }`

Behavior
- Respects robots.txt by default for the provided User-Agent.
- Follows redirects and reads up to `maxBytes` to avoid huge pages.
- If `format: 'text'` (default) and page is HTML, strips tags (removes script/style) and decodes basic entities; includes `title`.
- If `format: 'html'`, returns raw HTML and `title`.
- If server returns JSON or `format: 'json'`, parses into `json`.
- Non-OK responses return status and a short text body snippet for debugging.

Notes
- This is a minimal fetcher to empower summarization / extraction workflows. For deeper crawling, add queueing, URL normalization, and robots.txt handling in upstream middleware.

# Community & Support
- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
