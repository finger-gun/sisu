# OpenAI + Google Programmable Search

Demonstrates using the Google Programmable Search (CSE) JSON API via `googleSearch`, then fetching and optionally summarizing pages.

## Setup
1. Copy `.env.example` to `.env` and set:
   - `OPENAI_API_KEY`
   - `GOOGLE_API_KEY`
   - `GOOGLE_CSE_CX`
2. Run:

```
npm run dev -w examples/openai-google-search -- -- "Find the latest NASA mission news from at least 3 domains."
```

The example registers `googleSearch`, `webFetch`, and `summarizeText` tools.
