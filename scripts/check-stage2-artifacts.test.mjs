import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { checkArtifacts } from './check-stage2-artifacts.mjs';

let root;
const route = '.next/server/app/api/manual-override/route.js';
function put(file, value) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
}
function trace(dependencies) {
  put(`${route}.nft.json`, JSON.stringify({ files: dependencies }));
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'stage2-artifact-check-'));
  put('.next/BUILD_ID', 'synthetic-build');
  put(route, 'synthetic route');
  put('.next/next-server.js.nft.json', JSON.stringify({ files: ['server/app/api/manual-override/route.js'] }));
  trace(['route.js']);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('accepts a complete clean build and retained runtime dependencies', () => {
  assert.deepEqual(checkArtifacts(root), { traces: 2, standalone: false, stage2Files: 0 });
});
test('fails closed on missing build, route, trace, or dependencies', () => {
  for (const file of ['.next/BUILD_ID', route, `${route}.nft.json`]) {
    const value = fs.readFileSync(path.join(root, file));
    fs.unlinkSync(path.join(root, file));
    assert.throws(() => checkArtifacts(root));
    put(file, value);
  }
  trace([]);
  assert.throws(() => checkArtifacts(root), /Empty\/malformed trace/);
  trace(['missing.py']);
  assert.throws(() => checkArtifacts(root), /Missing traced dependency/);
});
test('rejects controller, wrapper, regression tooling and compiled Python trace entries', () => {
  for (const file of ['stage2_controller.py', 'test_stage2_controller.py', 'stage2-remote-suite.ts', 'stage2-remote-suite.test.ts', 'stage2_controller.cpython-311.pyc', 'check-stage2-artifacts.mjs']) {
    put(`scripts/${file}`, 'synthetic test-only source');
    trace(['route.js', `../../../../../scripts/${file}`]);
    assert.throws(() => checkArtifacts(root), /Stage2-only tooling/);
  }
});
test('requires standalone output and rejects leftover untraced test tooling there', () => {
  assert.throws(() => checkArtifacts(root, true), /Missing standalone server/);
  put('.next/standalone/server.js', 'synthetic server');
  assert.equal(checkArtifacts(root, true).standalone, true);
  put('.next/standalone/scripts/stage2_controller.py', 'stale copy');
  assert.throws(() => checkArtifacts(root, true), /Stage2-only tooling/);
});
