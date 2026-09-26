// Strict parser adapted from Meal Planner lib/inventory-json.ts (offline inventory).
// Keep duplicate-key, UTF-8, finite-number and depth checks aligned with that reader.
export function parseExportJson(bytes: Uint8Array): unknown {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    let i = 0;
    const ws = () => { while (i < text.length && /[\t\n\r ]/.test(text[i])) i++; };
    const string = (): string => {
      const start = i++;
      while (i < text.length) {
        const c = text[i++];
        if (c === '\\') i++;
        else if (c === '"') return JSON.parse(text.slice(start, i));
      }
      throw new Error();
    };
    const value = (depth: number): unknown => {
      if (depth > 64) throw new Error();
      ws(); const c = text[i];
      if (c === '"') return string();
      if (c === '{') {
        i++; ws(); const out: Record<string, unknown> = Object.create(null); const keys = new Set<string>();
        if (text[i] === '}') { i++; return out; }
        while (i < text.length) {
          ws(); if (text[i] !== '"') throw new Error();
          const key = string(); if (keys.has(key)) throw new Error(); keys.add(key);
          ws(); if (text[i++] !== ':') throw new Error(); out[key] = value(depth + 1);
          ws(); const end = text[i++]; if (end === '}') return out; if (end !== ',') throw new Error();
        }
        throw new Error();
      }
      if (c === '[') {
        i++; ws(); const out: unknown[] = []; if (text[i] === ']') { i++; return out; }
        while (i < text.length) {
          out.push(value(depth + 1)); ws(); const end = text[i++];
          if (end === ']') return out; if (end !== ',') throw new Error();
        }
        throw new Error();
      }
      const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i));
      if (!match) throw new Error(); i += match[0].length;
      const out = JSON.parse(match[0]); if (typeof out === 'number' && !Number.isFinite(out)) throw new Error(); return out;
    };
    const out = value(0); ws(); if (i !== text.length) throw new Error();
    JSON.parse(text); return out;
  } catch { throw new Error('invalid_json'); }
}
