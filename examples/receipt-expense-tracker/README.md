# Receipt → Expense Tracker

A demo that converts receipt images into structured expenses and summaries using [Sisu](https://github.com/finger-gun/sisu).

## Features
- Parses receipt images with OpenAI vision.
- Validates output against a strict schema.
- Persists expenses locally via the Terminal tool or to AWS S3.
- Generates category summaries for each run.
- Runs on a schedule and writes a `trace.html` for observability.

## Usage
1. Install dependencies from repo root and build:
   ```bash
   npm install
   npm run build -ws
   ```
2. Run the example (local storage):
   ```bash
   TRACE_HTML=1 npm run dev -w examples/receipt-expense-tracker -- --trace
   ```

Environment variables:
- `MODEL` – OpenAI model (default `gpt-4o-mini`).
- `STORAGE_MODE` – `local` or `s3` (default `local`).
- `RECEIPTS_DIR` – folder of incoming receipts (default `sample`).
- `OUT_FILE` – local JSONL file to append expenses.
- `AWS_S3_BUCKET`, `AWS_S3_PREFIX` – destination for S3 mode.
- `INTERVAL_MS` – optional schedule interval in ms.

Sample inputs live in `sample/` with expected parsed JSON.
