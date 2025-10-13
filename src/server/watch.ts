/**
 * WebSocket watch/broadcast functionality
 */
import type { WebSocket } from 'ws';

export type WatchSubscription = {
  ws: WebSocket;
  filters?: {
    entity?: string;
    id?: string;
  };
};

export const watchers = new Set<WatchSubscription>();

/**
 * Broadcast change events to watchers
 */
export function broadcastChange(entity: string, entityId: string, op: string, data?: any) {
  const message = JSON.stringify({
    jsonrpc: '2.0',
    method: 'todo.change',
    params: {
      entity,
      id: entityId,
      op,
      data
    }
  });

  watchers.forEach(w => {
    if (w.ws.readyState === 1) { // OPEN
      if (!w.filters) {
        w.ws.send(message);
      } else if (w.filters.entity === entity && (!w.filters.id || w.filters.id === entityId)) {
        w.ws.send(message);
      }
    }
  });
}
