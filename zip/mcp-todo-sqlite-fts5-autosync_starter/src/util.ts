import crypto from 'crypto';

export function now(): number {
  return Date.now();
}

export function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function applyPatch<T extends object>(obj: any, ops: {op:'set'|'replace'|'delete', path:string, value?:any}): any {
  const path = ops.path.replace(/^\//,'').split('/').filter(Boolean);
  if (path.length === 0) return obj;
  let cursor: any = obj;
  for (let i=0; i<path.length-1; i++) {
    const k = path[i];
    if (typeof cursor[k] !== 'object' || cursor[k] === null) cursor[k] = {};
    cursor = cursor[k];
  }
  const last = path[path.length-1];
  if (ops.op === 'delete') {
    if (Array.isArray(cursor)) {
      const idx = Number(last);
      if (!Number.isNaN(idx)) cursor.splice(idx,1);
    } else {
      delete cursor[last];
    }
  } else {
    cursor[last] = ops.value;
  }
  return obj;
}
