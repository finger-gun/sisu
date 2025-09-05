# Summarize Text Tool

A utility tool that asks the active model to summarize large text bodies into concise outputs. Designed for use alongside `webFetch` or other content tools.

## Tool
- `summarizeText` — Summarize a given `text` with optional controls for length and style.

## Args
- `text` (string, required): The input to summarize.
- `target` ("short"|"medium"|"long", optional): Coarse target length. Default `medium`.
- `maxChars` (number, optional): Hard cap for output characters.
- `bullets` (boolean, optional): Prefer bullet-point output.
- `includeCitations` (boolean, optional): Keep/collect URLs in the summary when present.
- `focus` (string, optional): Guidance on what to emphasize.

## Notes
- Uses `ctx.model.generate` internally with `toolChoice:'none'` to avoid nested tool calls.
- For very long inputs, applies a simple map-reduce (chunk→summary→combine) approach.

# Community & Support
- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
