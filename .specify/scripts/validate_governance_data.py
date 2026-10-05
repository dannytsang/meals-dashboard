#!/usr/bin/env python3
"""Validate governance inventory and reject unsafe/empty required mappings."""
from __future__ import annotations
import argparse, json, re, sys
from pathlib import Path

def _yaml(path):
 try:
  import yaml
  return yaml.safe_load(path.read_text()) or {}
 except Exception:
  # The destination verifier is intentionally stdlib-only. Parse the stable
  # index shape when pytest/uv supplies an isolated interpreter without YAML.
  rows=[]; row=None
  for line in path.read_text().splitlines():
   m=re.match(r'^- id:\s*(\S+)', line)
   if m:
    row={}; rows.append(row); row['id']=m.group(1); continue
   m=re.match(r'^  ([A-Za-z_]+):\s*(.*)$', line)
   if row is not None and m:
    value=m.group(2).strip().strip("'").strip('"')
    row[m.group(1)] = [] if value == '[]' else value
  return {'features': rows}

def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--root',required=True); ap.add_argument('--json',action='store_true'); a=ap.parse_args(); root=Path(a.root); errors=[]
 idx=root/'specs/index.yaml'
 if not idx.exists(): errors.append('missing specs/index.yaml')
 features=sorted(p.name for p in (root/'specs').iterdir() if p.is_dir()) if (root/'specs').exists() else []
 if len(features)!=31: errors.append(f'expected 31 features, got {len(features)}')
 ownership=root/'OWNERSHIP.md'
 if not ownership.exists(): errors.append('missing OWNERSHIP.md')
 if not (root/'migration-manifest.json').exists(): errors.append('missing migration manifest')
 data=_yaml(idx) if idx.exists() else {}
 if '__parse_error__' in data: errors.append('index YAML parse error')
 rows=data.get('features', []) if isinstance(data, dict) else []
 ids=[r.get('id') for r in rows if isinstance(r,dict)]
 if ids != features: errors.append('index feature IDs differ from directory inventory')
 if len(ids) != len(set(ids)): errors.append('duplicate index feature IDs')
 required={'id','name','status','path','target_skill','readiness','depends_on','conflicts_with','supersedes','related_specs','last_reviewed_at'}
 for row in rows:
  if not isinstance(row,dict) or required - set(row): errors.append('index row missing required mapping')
  elif not all(row.get(k) not in (None,'',[]) for k in ('id','name','status','path','target_skill','readiness','last_reviewed_at')): errors.append(f"empty required mapping: {row.get('id')}")
  elif row['id'] not in features or row['path'] != f"{row['id']}/spec.md": errors.append(f"invalid index mapping: {row.get('id')}")
 if len(rows) != len(features): errors.append('index feature count mismatch')
 if ownership.exists():
  text=ownership.read_text()
  for needle in ('meals-dashboard.git','Hermes-Skills.git','meal-planner.git','e1cbe3dba90bbba92bbc1a0f26968381524c0ada','134d2099fcd4fa7d3e67b816b38573986b8eb61f'):
   if needle not in text: errors.append('ownership missing '+needle)
 for d in features:
  for f in ('spec.md','plan.md','tasks.md','scenarios.yaml','traceability.yaml','CHANGELOG.md'):
   if not (root/'specs'/d/f).exists(): errors.append(f'{d}/{f} missing')
 out={'errors':errors,'schema_version':1,'valid':not errors}; print(json.dumps(out,sort_keys=True)); return 0 if not errors else 1
if __name__=='__main__': sys.exit(main())
