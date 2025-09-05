# OpenAI AWS S3 Example

Demonstrates using the `@sisu-ai/tool-aws-s3` tools with the OpenAI adapter.

Run with:
```bash
npm run dev -w examples/openai-aws-s3 -- --trace
```

Environment (optional)
- `AWS_REGION` to auto-instantiate an S3 client for the example
- `AWS_S3_BUCKET`, `AWS_S3_PREFIX` to pick a bucket/prefix
- `AWS_S3_ALLOW_WRITE=true` to allow deletes/puts

