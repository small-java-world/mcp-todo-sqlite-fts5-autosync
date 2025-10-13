export function parseAttrs(s: string) {
  const out: Record<string, string> = {};
  s.split(',').forEach(kv => {
    const m = kv.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.+)$/);
    if (m) out[m[1]] = m[2].replace(/^\{|\}$/g,'').trim();
  });
  return out;
}

export function isoToEpoch(s: string) {
  const t = Date.parse(s);
  return isNaN(t) ? Date.now() : t;
}

const RE_TIMELINE_EVENT = /^- (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z) by (\S+): (.+)$/;

export function parseSections(lines: string[]) {
  let inTimeline = false;
  let inRelated = false;
  let inNotes = false;
  let inMeta = false;
  const timeline: any[] = [];
  const related: any[] = [];
  const notes: string[] = [];
  let metaText: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^###\s+Timeline:/i.test(trimmed)) { inTimeline=false; inRelated=false; inNotes=false; inMeta=false; inTimeline=true; continue; }
    if (/^###\s+Related:/i.test(trimmed)) { inTimeline=false; inRelated=false; inNotes=false; inMeta=false; inRelated=true; continue; }
    if (/^###\s+Notes:/i.test(trimmed)) { inTimeline=false; inRelated=false; inNotes=false; inMeta=false; inNotes=true; continue; }
    if (/^###\s+Meta:/i.test(trimmed) || /^Meta:$/i.test(trimmed)) { inTimeline=false; inRelated=false; inNotes=false; inMeta=false; inMeta=true; continue; }

    if (inTimeline) {
      if (line.startsWith('  ')) continue;
      const m = line.match(RE_TIMELINE_EVENT);
      if (m) timeline.push({ timestamp: m[1], actor: m[2], action: m[3] });
      continue;
    }
    if (inRelated) {
      if (line.startsWith('  ')) continue;
      const urlMatch = line.match(/^- \[([^\]]+)\]\s+([^:]+):\s*(https?:\/\/[^\s]+)$/);
      if (urlMatch) { related.push({ taskId: urlMatch[1], title: urlMatch[2], url: urlMatch[3] }); continue; }
      const descMatch = line.match(/^- \[([^\]]+)\]\s+([^:]+):\s*(.+)$/);
      if (descMatch) { related.push({ taskId: descMatch[1], title: descMatch[2], description: descMatch[3] }); continue; }
      const simpleMatch = line.match(/^- \[([^\]]+)\]\s+(.+)$/);
      if (simpleMatch) { related.push({ taskId: simpleMatch[1], title: simpleMatch[2] }); continue; }
      const urlOnlyMatch = line.match(/^- (https?:\/\/[^\s]+)$/);
      if (urlOnlyMatch) { related.push({ url: urlOnlyMatch[1] }); continue; }
      continue;
    }
    if (inNotes) {
      notes.push(line);
      continue;
    }
    if (inMeta) {
      metaText.push(line);
      continue;
    }
  }
  // finalize
  const notesJoined = notes.join('\n').replace(/\n+$/,'');
  let meta: any = {};
  const metaJoined = metaText.join('\n');
  const jsonMatch = metaJoined.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try { meta = JSON.parse(jsonMatch[1]); } catch {}
  }
  return { timeline, related, notes: notesJoined, meta };
}


