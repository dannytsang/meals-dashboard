#!/usr/bin/env python3
import hashlib,json,os,stat
from pathlib import Path
root=Path(__file__).parents[1]; specs=root/'specs'
def one(p):
 s=p.lstat(); rel=p.relative_to(root).as_posix(); mode=stat.S_IMODE(s.st_mode)
 if p.is_symlink():
  t=os.readlink(p); return {'path':rel,'type':'symlink','mode':mode,'target':t,'target_sha256':hashlib.sha256(t.encode()).hexdigest()}
 if p.is_dir(): return {'path':rel,'type':'directory','mode':mode}
 return {'path':rel,'type':'file','mode':mode,'size':s.st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
features=sorted(p.name for p in specs.iterdir() if p.is_dir())
paths=[specs]+sorted(specs.rglob('*'),key=lambda p:p.relative_to(root).as_posix())
manifest={'schema_version':1,'source':{'repository':'ssh://git@turk.ratfish-delta.ts.net:222/TsangHQ/Hermes-Skills.git','commit':'e1cbe3dba90bbba92bbc1a0f26968381524c0ada','root':'data-science/meals-check/.specify/specs'},'destination_root':'.specify/specs','features':features,'entries':[one(p) for p in paths]}
(root/'migration-manifest.json').write_text(json.dumps(manifest,indent=2,sort_keys=True)+'\n')
