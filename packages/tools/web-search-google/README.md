# @sisu-ai/tool-web-search-google

Search the web using [Google Programmable Search (CSE) JSON API](https://developers.google.com/custom-search/v1/overview) and return top results with title, URL, and snippet.

## Env / Flags
- `GOOGLE_API_KEY` (or `GOOGLE_CSE_API_KEY`, `CSE_API_KEY`)
- `GOOGLE_CSE_CX` (or `GOOGLE_CSE_ID`, `CSE_CX`)

CLI flags (kebab-cased) are also supported via core helpers, e.g. `--google-api-key=...`.

## Tool
- `googleSearch({ query, num=10, start=1, safe='active', lang='en' })`

## Notes
- Uses the official [Custom Search JSON API](https://developers.google.com/custom-search/v1/overview); ensure your CX is configured to search the domains you need or set to the broader web if allowed.
- API quotas and billing apply per Google terms.
- Please read official documentation; https://developers.google.com/custom-search/v1/overview
