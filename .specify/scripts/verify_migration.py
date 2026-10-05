#!/usr/bin/env python3
"""Verify a deterministic dashboard feature migration manifest."""
from __future__ import annotations
import argparse, hashlib, json, os, stat, sys
from pathlib import Path

def entry(path: Path, root: Path) -> dict:
    rel=path.relative_to(root).as_posix(); s=path.lstat(); mode=stat.S_IMODE(s.st_mode)
    if path.is_symlink():
        target=os.readlink(path); return {'path':rel,'type':'symlink','mode':mode,'target':target,'target_sha256':hashlib.sha256(target.encode()).hexdigest()}
    if path.is_dir(): return {'path':rel,'type':'directory','mode':mode}
    if path.is_file(): return {'path':rel,'type':'file','mode':mode,'size':s.st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    return {'path':rel,'type':'other','mode':mode}

def tree(root: Path) -> list[dict]:
    if not root.exists(): return []
    paths=[root]+sorted(root.rglob('*'), key=lambda p:p.relative_to(root.parent).as_posix())
    return [entry(p,root.parent) for p in paths]

def main() -> int:
    ap=argparse.ArgumentParser(); ap.add_argument('--manifest',required=True); ap.add_argument('--source-repo',required=True); ap.add_argument('--source-root',required=True); ap.add_argument('--source-commit',required=True); ap.add_argument('--expected-feature-count',type=int,required=True); ap.add_argument('--json',action='store_true'); a=ap.parse_args()
    errors=[]; m=json.loads(Path(a.manifest).read_text()); dest=Path(a.manifest).parent/'specs'; src=Path(a.source_repo)/a.source_root
    features=sorted(p.name for p in dest.iterdir() if p.is_dir()) if dest.exists() else []
    expected=sorted(p.name for p in src.iterdir() if p.is_dir() and p.name not in {'040-meal-planner-repository-separation','041-gmail-order-message-selection'}) if src.exists() else []
    if len(features)!=a.expected_feature_count or features!=expected: errors.append(f'feature IDs differ: {len(features)} vs {a.expected_feature_count}')
    if m.get('schema_version')!=1 or m.get('source',{}).get('commit')!=a.source_commit: errors.append('manifest identity mismatch')
    if m.get('features')!=features: errors.append('manifest feature list mismatch')
    actual=tree(dest); entries=m.get('entries',[])
    if entries!=actual: errors.append('manifest entries differ from destination tree')
    result={'errors':errors,'schema_version':1,'valid':not errors}
    print(json.dumps(result,sort_keys=True)); return 0 if not errors else 1
if __name__=='__main__': sys.exit(main())
