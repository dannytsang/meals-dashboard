from pathlib import Path
import json, subprocess, sys
ROOT=Path(__file__).parents[2]

def run(*args):
 return subprocess.run([sys.executable,*args],cwd=ROOT,text=True,capture_output=True)

def test_manifest_and_inventory():
 r=run('.specify/scripts/verify_migration.py','--manifest','.specify/migration-manifest.json','--source-repo','/home/hermes/workspace/Hermes-Skills','--source-root','data-science/meals-check/.specify/specs','--source-commit','e1cbe3dba90bbba92bbc1a0f26968381524c0ada','--expected-feature-count','31','--json')
 assert r.returncode==0, r.stdout+r.stderr
 assert json.loads(r.stdout)['valid'] is True

def test_governance():
 r=run('.specify/scripts/validate_governance_data.py','--root','.specify','--json')
 assert r.returncode==0, r.stdout+r.stderr

def test_manifest_rejects_mutated_copy(tmp_path):
 m=json.loads((ROOT/'.specify/migration-manifest.json').read_text()); m['features']=list(reversed(m['features']))
 p=tmp_path/'bad.json'; p.write_text(json.dumps(m))
 r=run('.specify/scripts/verify_migration.py','--manifest',str(p),'--source-repo','/home/hermes/workspace/Hermes-Skills','--source-root','data-science/meals-check/.specify/specs','--source-commit','e1cbe3dba90bbba92bbc1a0f26968381524c0ada','--expected-feature-count','31','--json')
 assert r.returncode==1
