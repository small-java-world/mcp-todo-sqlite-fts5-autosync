# PR Patch — Agent Worktree Binding

このZIPには、リポジトリに適用するための unified diff (`patch.diff`) が入っています。

## 適用手順
```bash
git switch -c feat/agent-worktree-binding
# or worktree:
# git worktree add ../mcp-todo-feat feat/agent-worktree-binding && cd ../mcp-todo-feat

git apply --whitespace=fix patch.diff

GIT_WORKTREE_ROOT="$(pwd)" GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD)" MCP_TOKEN=devtoken pnpm dev
```
