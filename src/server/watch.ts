import stringify from 'fast-json-stable-stringify';

export type WatchSubscription = {
  ws: any;
  filters?: { entity?: string; id?: string };
};

export const watchers = new Set<WatchSubscription>();

export function broadcastChange(entity: string, entityId: string, op: string, data?: any) {
  const event = { jsonrpc: '2.0', method: 'todo.change', params: { entity, id: entityId, op, ts: Date.now(), data } };
  watchers.forEach((watcher) => {
    if (watcher.filters) {
      if (watcher.filters.entity && watcher.filters.entity !== entity) return;
      if (watcher.filters.id && watcher.filters.id !== entityId) return;
    }
    try { if (watcher.ws.readyState === 1) watcher.ws.send(stringify(event)); } catch {}
  });
}


