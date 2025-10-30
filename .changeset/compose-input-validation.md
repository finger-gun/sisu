---
"@sisu-ai/core": patch
---

Add input validation to compose function to ensure middleware stack is a valid array of functions. The compose function now throws TypeError with descriptive messages when:
- The stack parameter is not an array
- The stack contains non-function elements

This improves error detection and provides clearer error messages when the compose function is used incorrectly.