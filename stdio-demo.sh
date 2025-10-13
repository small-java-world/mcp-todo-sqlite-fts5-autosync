#!/bin/bash
# Stdio Server Interactive Demo

echo "=== MCP Stdio Server Demo ==="
echo ""
echo "Starting stdio-server..."
echo ""

# Start the server
node dist/stdio-server.js <<EOF
{"jsonrpc":"2.0","id":1,"method":"upsert_task","params":{"id":"T-DEMO-001","title":"Demo Task from Terminal","text":"This task was created via stdio!"}}
{"jsonrpc":"2.0","id":2,"method":"get_task","params":{"id":"T-DEMO-001"}}
{"jsonrpc":"2.0","id":3,"method":"list_recent","params":{"limit":3}}
{"jsonrpc":"2.0","id":4,"method":"exportTodoMd","params":{}}
EOF

echo ""
echo "=== Demo Complete ==="
