\
Param(
  [string]$InPath = "TODO.import.md"
)
$env:MCP_URL = $env:MCP_URL ?? "ws://127.0.0.1:8765"
$env:MCP_TOKEN = $env:MCP_TOKEN ?? "devtoken"
node tools/import_todo.mjs $InPath
