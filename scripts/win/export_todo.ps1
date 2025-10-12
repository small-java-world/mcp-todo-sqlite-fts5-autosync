\
Param(
  [string]$OutPath = "TODO.export.md"
)
$env:MCP_URL = $env:MCP_URL ?? "ws://127.0.0.1:8765"
$env:MCP_TOKEN = $env:MCP_TOKEN ?? "devtoken"
node tools/export_todo.mjs $OutPath
