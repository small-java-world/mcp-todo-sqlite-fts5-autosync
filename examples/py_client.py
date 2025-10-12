
import os, asyncio, websockets, json

WS_URL = os.environ.get("MCP_URL", "ws://127.0.0.1:8765")
TOKEN = os.environ.get("MCP_TOKEN", "devtoken")

async def call(ws, i, m, p):
    await ws.send(json.dumps({ "jsonrpc":"2.0","id":i,"method":m,"params":p }))
    return json.loads(await ws.recv())

async def main():
    async with websockets.connect(WS_URL) as ws:
        print(await call(ws, 1, "register", {"worker_id":"py-client","authToken":TOKEN}))
        print(await call(ws, 2, "upsert_task", {"id":"T-2","title":"FTS5 test","text":"This is a quick brown fox task","meta":{"prio":"P2"}}))
        print(await call(ws, 3, "search", {"q":"quick NEAR/1 brown", "highlight": True}))
        print(await call(ws, 4, "get_task", {"id":"T-2"}))

if __name__ == "__main__":
    asyncio.run(main())

        # await call(ws, 5, 'archive_task', {'id':'T-2','reason':'done'})
        # print(await call(ws, 6, 'list_archived', {}))
        # await call(ws, 7, 'restore_task', {'id':'T-2'})
