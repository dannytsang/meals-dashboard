#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const staticRoot = join(process.cwd(), '.next', 'static');
const sentinels = [
  '5421-8594-00',
  'Tesco Blueberries 500G',
  'Tesco Fire Pit 4 Sweet',
  'BBQ Salmon Skewers',
  'Costco sausages (lunch - frozen)',
  'Tony and Barbara cooking',
];

function walk(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) entries.push(...walk(path));
    else entries.push(path);
  }
  return entries;
}

let hits = [];
try {
  for (const file of walk(staticRoot)) {
    const content = readFileSync(file, 'utf8');
    for (const sentinel of sentinels) {
      if (content.includes(sentinel)) hits.push(`${sentinel} :: ${file}`);
    }
  }
} catch (error) {
  console.error(`Static scan failed: ${error.message}`);
  process.exit(1);
}

if (hits.length) {
  console.error('Private dashboard data found in public static assets:');
  for (const hit of hits) console.error(`- ${hit}`);
  process.exit(1);
}

console.log('No configured private dashboard sentinels found in .next/static.');
