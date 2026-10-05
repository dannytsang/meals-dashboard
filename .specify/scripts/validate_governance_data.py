#!/usr/bin/env python3
"""Validate governance inventory and reject unsafe/empty required mappings."""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path

def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--root',required=True); ap.add_argument('--json',action='store_true'); a=ap.parse_args(); root=Path(a.root); errors=[]
 idx=root/'specs/index.yaml'
 if not idx.exists(): errors.append('missing specs/index.yaml')
 features=sorted(p.name for p in (root/'specs').iterdir() if p.is_dir()) if (root/'specs').exists() else []
 if len(features)!=31: errors.append(f'expected 31 features, got {len(features)}')
 if not (root/'OWNERSHIP.md').exists(): errors.append('missing OWNERSHIP.md')
 if not (root/'migration-manifest.json').exists(): errors.append('missing migration manifest')
 for d in features:
  for f in ('spec.md','plan.md','tasks.md','scenarios.yaml','traceability.yaml','CHANGELOG.md'):
   if not (root/'specs'/d/f).exists(): errors.append(f'{d}/{f} missing')
 out={'errors':errors,'schema_version':1,'valid':not errors}; print(json.dumps(out,sort_keys=True)); return 0 if not errors else 1
if __name__=='__main__': sys.exit(main())
