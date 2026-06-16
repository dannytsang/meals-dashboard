import { list } from '@vercel/blob';

async function main() {
  console.log('--- list ALL (no prefix) ---');
  const r = await list({ limit: 1000 });
  console.log(`Total: ${r.blobs.length}`);
  for (const b of r.blobs) {
    console.log(`  ${b.pathname}  (${b.size} bytes)`);
  }
}
main().catch(e => console.error('ERR:', e.message));
