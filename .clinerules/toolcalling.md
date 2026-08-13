# Tool Call Integrity (Hard Rules)

## 1. One complete, well-formed tool call per message
Every tool call is a single XML block. All required parameters are present,
each with a value, and the closing tag is written before you send. Never send
a partial call expecting the harness to "figure it out."

## 2. Parameters never contain tag fragments
- The `path` parameter contains ONLY the file path. Never put file content,
  `<content>` tags, or closing tags inside `path`.
- The `content` parameter contains ONLY the file content. Never put `</write_to_file>`
  or any other tool tag inside it.
- If you catch yourself writing `</...>` or `<...>` inside a parameter value,
  stop. You are malforming the call. Re-emit it cleanly.

## 3. Pre-send checklist (every tool call)
- [ ] Every required parameter has a non-empty value
- [ ] The closing tag for the tool is present
- [ ] No tag fragments leaked into any parameter value
- [ ] `path` is a real path, not a path with content appended

## 4. On tool failure, do not retry the same malformed call
If a write fails with "content parameter was empty" or a path error, the call
was malformed. Do NOT re-send the identical call. Re-emit it as a clean,
complete call in the next message, or switch strategy (see below).

## 5. Keep single writes small enough to complete
Large files are where truncation happens. If a file will exceed ~200 lines:
- Write a skeleton first, then fill sections with replace_in_file, OR
- Split the file into smaller cohesive files.
A complete small file beats a truncated large one.

## 6. Choose the right tool
- New file or full rewrite -> write_to_file (complete content, no placeholders)
- Targeted edit -> replace_in_file with exact SEARCH/REPLACE blocks
- replace_in_file blocks MUST include the `=======` separator and the
  `+++++++ REPLACE` marker. Never invent parameters (e.g. no `diff2`).

## 7. One tool per message
Send one tool call, wait for the result, then continue. Never batch multiple
tool calls in a single message.
