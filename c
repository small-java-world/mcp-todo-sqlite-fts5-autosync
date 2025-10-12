[1mdiff --git a/AGENT_BINDING.md b/AGENT_BINDING.md[m
[1mnew file mode 100644[m
[1mindex 0000000..6dad192[m
[1m--- /dev/null[m
[1m+++ b/AGENT_BINDING.md[m
[36m@@ -0,0 +1,38 @@[m
[32m+[m[32m# Agent Binding for Git Worktree[m
[32m+[m
[32m+[m[32m## 目的[m
[32m+[m[32m`TODO.md` から参照されるファイル（例: `docs/specs/...`）は、**現在の worktree が束縛する Git ブランチ**にコミットされるべきです。[m[41m  [m
[32m+[m[32mMCP サーバはエージェントに以下のバインディング情報を提供し、AI/エージェントが「どのブランチへコミットすべきか」を機械的に理解できるようにします。[m
[32m+[m
[32m+[m[32m## 提供情報（RPC: `get_repo_binding`）[m
[32m+[m[32m- `repoRoot`: 作業ルート（絶対パス；worktree のルート）[m
[32m+[m[32m- `branch`: 現在のブランチ名（例: `feature/search-bm25`）[m
[32m+[m[32m- `remote`: push 先（例: `origin`）[m
[32m+[m[32m- `policy`:[m
[32m+[m[32m  - `commitOnWrite: boolean` … ファイル生成/更新時に即コミットするか[m
[32m+[m[32m  - `safeGlobs: string[]` … 生成/更新を許可するパスのグロブ[m
[32m+[m[32m  - `messageTemplate: string` … コミットメッセージのテンプレート[m
[32m+[m[32m  - `signoff: boolean` … `--signoff` を付けるか[m
[32m+[m
[32m+[m[32m## ファイル参照規約[m
[32m+[m[32m- `TODO.md` 内の相対パスは **常に `repoRoot` からの相対パス**として解決する。[m
[32m+[m[32m- 明示的に `repo://path/to/file` というスキーム指定も許可（これも `repoRoot` 基準）。[m
[32m+[m[32m- 生成・更新対象は `policy.safeGlobs` に合致している必要がある。[m
[32m+[m
[32m+[m[32m## コミット規約[m
[32m+[m[32m1. 変更が生じたら `git add` → `git commit -m "<template適用>"`（`policy.commitOnWrite` が true の場合）[m
[32m+[m[32m2. コミットメッセージは `messageTemplate` を適用する。[m[41m  [m
[32m+[m[32m   例: `"chore(todos): {summary}[m
[32m+[m
[32m+[m[32mRefs: {taskIds}[m
[32m+[m
[32m+[m[32m{signoff}"`[m
[32m+[m[32m   - `{summary}`: タスク要約[m
[32m+[m[32m   - `{taskIds}`: `TODO.md` のタスクID（例: `T-20251012-001`）の列挙[m
[32m+[m[32m   - `{signoff}`: `Signed-off-by: ...`（`signoff` が true の場合）[m
[32m+[m
[32m+[m[32m## 最低限のエージェント実装フロー[m
[32m+[m[32m1. `get_repo_binding` を呼んで repo/branch/policy を取得[m
[32m+[m[32m2. `TODO.md` に記載の参照ファイル（相対 or `repo://`）を `repoRoot` 配下に生成/更新[m
[32m+[m[32m3. `policy.commitOnWrite` が true なら即コミット（必要に応じて push）[m
[32m+[m[32m4. すべてのコミットには `{taskIds}`（`TODO.md` の一意ID）を含める[m
[1mdiff --git a/AGENT_PROTOCOL.md b/AGENT_PROTOCOL.md[m
[1mnew file mode 100644[m
[1mindex 0000000..025605d[m
[1m--- /dev/null[m
[1m+++ b/AGENT_PROTOCOL.md[m
[36m@@ -0,0 +1,19 @@[m
[32m+[m[32m# MCP Agent Protocol (Promptable Rules)[m
[32m+[m
[32m+[m[32m本書は、MCP エージェント（およびそれを利用するAIツール）が `TODO.md` を中核に作業する際の**明文化された運用規約**です。[m
[32m+[m
[32m+[m[32m## Golden Rules[m
[32m+[m[32m1. 起動時に **必ず** `get_repo_binding` を実行して `repoRoot/branch/policy` を取得すること。[m
[32m+[m[32m2. `TODO.md` からのファイル参照（相対/`repo://`）は **`repoRoot` 基準**で解決すること。[m
[32m+[m[32m3. ファイル生成・更新後、`policy.commitOnWrite=true` の場合は **同一ブランチ**へ即時コミットすること。[m
[32m+[m[32m4. コミットメッセージは `messageTemplate` を用い、`{taskIds}` に `TODO.md` のタスクIDを必ず含めること。[m
[32m+[m[32m5. 変更が無いコミットは禁止。push は任意（CI 連動時は推奨）。[m
[32m+[m
[32m+[m[32m## `TODO.md` のタスク行の書式（抜粋）[m
[32m+[m[32m- `- [ ] [T-YYYYMMDD-###] 要約 ...  :: state:open; prio:1; owner:you`[m
[32m+[m[32m- 1行1タスク・IDは不変。末尾の `:: key:val; ...` は機械可読メタ。[m
[32m+[m
[32m+[m[32m## エージェントが使う主な RPC（例）[m
[32m+[m[32m- `get_repo_binding() -> { repoRoot, branch, remote, policy }`[m
[32m+[m[32m- `reserve_ids(n) -> { ids: string[] }` … 中央採番（オンライン）[m
[32m+[m[32m- `patch_todo_section({ section, base_sha256, ops[] }) -> { vclock, sha256 }` … 行単位パッチ[m
[1mdiff --git a/README.md b/README.md[m
[1mindex 1a58a98..ea09721 100644[m
[1m--- a/README.md[m
[1m+++ b/README.md[m
[36m@@ -47,6 +47,11 @@[m [mMCP_TOKEN=devtoken pnpm start[m
 - `importTodoMd({content}) -> {ok}` - TODO.md形式のインポート[m
 - `exportTodoMd() -> {content}` - TODO.md形式のエクスポート[m
 [m
[32m+[m[32m### Git Worktree バインディングAPI[m
[32m+[m[32m- `get_repo_binding()` → **Git worktree バインディング**（repoRoot/branch/policy）[m
[32m+[m[32m- `reserve_ids({n})` → **TODO用IDの中央採番**（例: `T-YYYYMMDD-###`）[m
[32m+[m[32m- `patch_todo_section({section, base_sha256, ops[]})` → **TODO.mdの行パッチ**（3階層＋1行1タスク前提）[m
[32m+[m
 vclock はタスクごとの単調増加バージョン（楽観ロック）。`if_vclock` 不一致なら 409 を返します。[m
 [m
 ## 3) クライアント例[m
[36m@@ -167,9 +172,24 @@[m [mnpm test test/integration/[m
 - TODO.md インポート/エクスポート機能[m
 - メタ構造化、タイムライン、関連、ノート機能[m
 [m
[31m-## 12) MCP設定（Cursor / Claude Desktop / Codex CLI）[m
[32m+[m[32m## 12) 追加ドキュメント[m
[32m+[m
[32m+[m[32m### エージェント向けドキュメント[m
[32m+[m[32m- `AGENT_BINDING.md` … エージェントが **「TODO由来のファイルは紐づくブランチにコミット」** を理解するための仕様[m
[32m+[m[32m- `AGENT_PROTOCOL.md` … エージェント/AI向けの運用プロトコル（Golden Rules と使用RPC）[m
[32m+[m
[32m+[m[32m### 環境変数（worktree）[m
[32m+[m[32m- `GIT_WORKTREE_ROOT`（必須推奨）[m
[32m+[m[32m- `GIT_BRANCH`（必須推奨）[m
[32m+[m[32m- `GIT_REMOTE=origin`[m
[32m+[m[32m- `GIT_COMMIT_ON_WRITE=true`[m
[32m+[m[32m- `GIT_SAFE_GLOBS=docs/**,src/**,.github/**`[m
[32m+[m[32m- `GIT_COMMIT_TEMPLATE="chore(todos): {summary}\n\nRefs: {taskIds}\n\n{signoff}"`[m
[32m+[m[32m- `GIT_SIGNOFF=true`[m
[32m+[m
[32m+[m[32m## 13) MCP設定（Cursor / Claude Desktop / Codex CLI）[m
 [m
[31m-### 12.1 Cursor設定[m
[32m+[m[32m### 13.1 Cursor設定[m
 [m
 #### ローカル接続[m
 ```json[m
[36m@@ -209,7 +229,7 @@[m [mnpm test test/integration/[m
 - macOS: `~/Library/Application Support/Cursor/User/settings.json`[m
 - Linux: `~/.config/Cursor/User/settings.json`[m
 [m
[31m-### 12.2 Claude Desktop設定[m
[32m+[m[32m### 13.2 Claude Desktop設定[m
 [m
 #### ローカル接続[m
 ```json[m
[36m@@ -249,7 +269,7 @@[m [mnpm test test/integration/[m
 - macOS: `~/Library/Application Support/Claude/claude_desktop_config/mcp_servers/mcp-todo-server.json`[m
 - Linux: `~/.config/claude/claude_desktop_config/mcp_servers/mcp-todo-server.json`[m
 [m
[31m-### 12.3 Codex CLI設定[m
[32m+[m[32m### 13.3 Codex CLI設定[m
 [m
 #### ローカル接続[m
 ```bash[m
[36m@@ -271,7 +291,7 @@[m [mexport MCP_TOKEN="devtoken"[m
 codex --mcp-server-url $MCP_SERVER_URL --mcp-token $MCP_TOKEN[m
 ```[m
 [m
[31m-### 12.4 リモート接続のための設定[m
[32m+[m[32m### 13.4 リモート接続のための設定[m
 [m
 #### サーバー側（MCP TODO Server）[m
 ```bash[m
[36m@@ -293,7 +313,7 @@[m [m$env:MCP_SERVER_IP="192.168.1.9"; node remote_client.js[m
 2. **IPアドレス確認**: `ipconfig` (Windows) / `ifconfig` (macOS/Linux)[m
 3. **ネットワーク確認**: 同一ネットワーク内であることを確認[m
 [m
[31m-### 12.5 トラブルシューティング[m
[32m+[m[32m### 13.5 トラブルシューティング[m
 [m
 #### 接続エラーの場合[m
 1. **ファイアウォール確認**: ポート8765が開放されているか[m
[1mdiff --git a/src/config.ts b/src/config.ts[m
[1mnew file mode 100644[m
[1mindex 0000000..54b3f59[m
[1m--- /dev/null[m
[1m+++ b/src/config.ts[m
[36m@@ -0,0 +1,16 @@[m
[32m+[m[32mexport const CONFIG = {[m
[32m+[m[32m  port: parseInt(process.env.PORT || "8787", 10),[m
[32m+[m[32m  token: process.env.MCP_TOKEN || "changeme",[m
[32m+[m[32m  dataDir: process.env.DATA_DIR || "./data",[m
[32m+[m[32m  git: {[m
[32m+[m[32m    worktreeRoot: process.env.GIT_WORKTREE_ROOT || process.cwd(),[m
[32m+[m[32m    branch: process.env.GIT_BRANCH || "unknown",[m
[32m+[m[32m    remote: process.env.GIT_REMOTE || "origin",[m
[32m+[m[32m    policy: {[m
[32m+[m[32m      commitOnWrite: (process.env.GIT_COMMIT_ON_WRITE || "true") === "true",[m
[32m+[m[32m      safeGlobs: (process.env.GIT_SAFE_GLOBS || "docs/**,src/**,.github/**").split(","),[m
[32m+[m[32m      messageTemplate: process.env.GIT_COMMIT_TEMPLATE || "chore(todos): {summary}\n\nRefs: {taskIds}\n\n{signoff}",[m
[32m+[m[32m      signoff: (process.env.GIT_SIGNOFF || "true") === "true",[m
[32m+[m[32m    }[m
[32m+[m[32m  }[m
[32m+[m[32m};[m
[1mdiff --git a/src/server.ts b/src/server.ts[m
[1mindex 3c17eb7..ca8adf3 100644[m
[1m--- a/src/server.ts[m
[1m+++ b/src/server.ts[m
[36m@@ -7,6 +7,7 @@[m [mimport bonjour from 'bonjour-service';[m
 import stringify from 'fast-json-stable-stringify';[m
 import { DB } from './utils/db.js';[m
 import { ReviewIssuesManager } from './utils/review-issues.js';[m
[32m+[m[32mimport { CONFIG } from './config.js';[m
 [m
 const PORT = parseInt(process.env.PORT || '8765', 10);[m
 const TOKEN = process.env.MCP_TOKEN || null; // optional shared token[m
[36m@@ -316,6 +317,74 @@[m [mcase 'list_archived': {[m
           } catch (e: any) { send(err(500, e.message || 'error', id)); }[m
           break;[m
         }[m
[32m+[m[32m        case 'get_repo_binding': {[m
[32m+[m[32m          return send(ok({[m
[32m+[m[32m            repoRoot: CONFIG.git.worktreeRoot,[m
[32m+[m[32m            branch: CONFIG.git.branch,[m
[32m+[m[32m            remote: CONFIG.git.remote,[m
[32m+[m[32m            policy: CONFIG.git.policy,[m
[32m+[m[32m          }, id));[m
[32m+[m[32m        }[m
[32m+[m[32m        case 'reserve_ids': {[m
[32m+[m[32m          const n = Math.max(1, Math.min(100, (params?.n ?? 1)));[m
[32m+[m[32m          const ymd = new Date().toISOString().slice(0,10).replace(/-/g,'');[m
[32m+[m[32m          const ids: string[] = [];[m
[32m+[m[32m          for (let i=0;i<n;i++){[m
[32m+[m[32m            const tail = String((Date.now()%100000)+i).padStart(3,'0');[m
[32m+[m[32m            ids.push(`T-${ymd}-${tail}`);[m
[32m+[m[32m          }[m
[32m+[m[32m          return send(ok({ ids }, id));[m
[32m+[m[32m        }[m
[32m+[m[32m        case 'patch_todo_section': {[m
[32m+[m[32m          const section = params?.section;[m
[32m+[m[32m          const base_sha256 = params?.base_sha256 || '';[m
[32m+[m[32m          const ops = params?.ops || [];[m
[32m+[m[41m          [m
[32m+[m[32m          if (!['PLAN','CONTRACT','TEST','TASKS'].includes(section)) {[m
[32m+[m[32m            return send(err(400, 'invalid_section', id));[m
[32m+[m[32m          }[m
[32m+[m[41m          [m
[32m+[m[32m          // @ts-ignore[m
[32m+[m[32m          global.__TODO_STATE__ = global.__TODO_STATE__ || {[m
[32m+[m[32m            vclock: 0,[m
[32m+[m[32m            sha256: '',[m
[32m+[m[32m            sections: new Map<string,string[]>([['PLAN',[]],['CONTRACT',[]],['TEST',[]],['TASKS',[]]]),[m
[32m+[m[32m          };[m
[32m+[m[41m          [m
[32m+[m[32m          // @ts-ignore[m
[32m+[m[32m          const state = global.__TODO_STATE__;[m
[32m+[m[32m          if (base_sha256 && base_sha256 !== state.sha256) {[m
[32m+[m[32m            return send(err(409, 'conflict', id));[m
[32m+[m[32m          }[m
[32m+[m[41m          [m
[32m+[m[32m          const lines: string[] = (state.sections.get(section) || []).slice();[m
[32m+[m[32m          for (const op of ops) {[m
[32m+[m[32m            if (op.op === 'replaceLines') {[m
[32m+[m[32m              lines.splice(op.start, op.end - op.start, ...op.text.split(/\r?\n/));[m
[32m+[m[32m            }[m
[32m+[m[32m          }[m
[32m+[m[41m          [m
[32m+[m[32m          if (section === 'TASKS') {[m
[32m+[m[32m            for (const L of lines) {[m
[32m+[m[32m              if (!/^(\s{2}){0,2}- \[( |x)\] \[T-[A-Z0-9\-]+\]/.test(L)) {[m
[32m+[m[32m                return send(err(400, 'TASKS format error', id));[m
[32m+[m[32m              }[m
[32m+[m[32m            }[m
[32m+[m[32m          }[m
[32m+[m[41m          [m
[32m+[m[32m          state.sections.set(section, lines);[m
[32m+[m[32m          state.vclock += 1;[m
[32m+[m[32m          const nextSha = crypto.createHash('sha256').update([m
[32m+[m[32m            ['PLAN','CONTRACT','TEST','TASKS'].map(s => (state.sections.get(s)||[]).join('\n')).join('\n#--\n')[m
[32m+[m[32m          ).digest('hex');[m
[32m+[m[32m          state.sha256 = nextSha;[m
[32m+[m[41m          [m
[32m+[m[32m          const now = Date.now();[m
[32m+[m[32m          // 変更フィードに記録[m
[32m+[m[32m          db.insertChange('todo', section, 'update', state.vclock);[m
[32m+[m[41m          [m
[32m+[m[32m          return send(ok({ vclock: state.vclock, sha256: nextSha }, id));[m
[32m+[m[32m        }[m
         default:[m
           send(err(-32601,'method_not_found', id));[m
       }[m
