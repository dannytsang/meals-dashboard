// Inspect actual Next production outputs, not source declarations.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const forbidden = /^(?:stage2[-_]|test_stage2_|check-stage2-artifacts)/;
function walk(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

export function checkArtifacts(root, standalone = false) {
  const build = path.join(root, '.next');
  assert.ok(fs.readFileSync(path.join(build, 'BUILD_ID'), 'utf8').trim(), 'Missing build identity');
  const route = path.join(build, 'server/app/api/manual-override/route.js');
  assert.ok(fs.statSync(route).size > 0, 'Missing built manual-override route');
  const traces = walk(path.join(build, 'server')).filter((file) => file.endsWith('.nft.json'));
  traces.push(path.join(build, 'next-server.js.nft.json'));
  assert.ok(traces.includes(`${route}.nft.json`), 'Missing manual-override dependency trace');
  const violations = [];
  for (const trace of traces) {
    const { files } = JSON.parse(fs.readFileSync(trace, 'utf8'));
    assert.ok(Array.isArray(files) && files.length > 0, `Empty/malformed trace: ${trace}`);
    for (const entry of files) {
      const dependency = path.resolve(path.dirname(trace), entry);
      if (forbidden.test(path.basename(dependency))) violations.push(path.relative(root, dependency));
      // Scoped excludes must not leave surviving runtime references broken.
      assert.ok(fs.existsSync(dependency), `Missing traced dependency: ${dependency}`);
    }
  }
  const output = path.join(build, 'standalone');
  if (standalone) assert.ok(fs.existsSync(path.join(output, 'server.js')), 'Missing standalone server');
  for (const file of walk(output)) {
    if (forbidden.test(path.basename(file))) violations.push(path.relative(root, file));
  }
  assert.deepEqual(violations, [], 'Stage2-only tooling is packaged in production artifacts');
  return { traces: traces.length, standalone: fs.existsSync(output), stage2Files: 0 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootArg = process.argv.find((arg) => arg.startsWith('--root='));
  console.log(JSON.stringify(checkArtifacts(rootArg ? rootArg.slice(7) : process.cwd(), process.argv.includes('--standalone'))));
}
