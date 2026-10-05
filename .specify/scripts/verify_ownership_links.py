#!/usr/bin/env python3
"""Resolve reciprocal ownership pointers without touching other repositories."""
from __future__ import annotations
import argparse, json, subprocess, sys
from pathlib import Path

def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--hermes-repo',required=True); ap.add_argument('--meal-planner-repo',required=True); ap.add_argument('--expected-source-commit',required=True); ap.add_argument('--expected-meal-planner-commit',required=True); ap.add_argument('--json',action='store_true'); a=ap.parse_args()
 root=Path(__file__).parents[1]; own=(root/'OWNERSHIP.md').read_text(); idx=(root/'specs/index.yaml').read_text(); errors=[]; stale=[]
 for label, repo, expected in [('Hermes-Skills',Path(a.hermes_repo),a.expected_source_commit),('meal-planner',Path(a.meal_planner_repo),a.expected_meal_planner_commit)]:
  if not (repo/'.git').exists() and not (repo/'HEAD').exists(): errors.append(f'{label} repository missing')
  else:
   try: actual=subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True,stderr=subprocess.STDOUT).strip()
   except subprocess.CalledProcessError: actual=''
   if actual != expected: errors.append(f'{label} HEAD mismatch: {actual}')
   # Resolve reciprocal pointers from repository content, not destination
   # substring checks. A stale checkout at the expected HEAD must fail.
   if label == 'Hermes-Skills':
    pointer = repo/'data-science/meals-check/MEAL-PLANNER-OWNERSHIP.md'
    skill = repo/'data-science/meals-check/SKILL.md'
    if not pointer.exists() or not skill.exists():
     errors.append('Hermes-Skills reciprocal ownership files missing')
    else:
     text = pointer.read_text() + '\n' + skill.read_text()
     if 'meal-planner.git' not in text or 'meals-dashboard' not in text:
      errors.append('Hermes-Skills reciprocal ownership target missing')
   else:
    readme = repo/'README.md'
    index = repo/'.specify/specs/index.yaml'
    if not readme.exists() or not index.exists():
     errors.append('meal-planner reciprocal ownership files missing')
    else:
     text = readme.read_text() + '\n' + index.read_text()
     if 'Dashboard Repo (meals-dashboard)' not in text or '.specify/specs/index.yaml' not in text:
      errors.append('meal-planner reciprocal dashboard pointer missing')
 for needle in ['Hermes-Skills','meal-planner',a.expected_source_commit,a.expected_meal_planner_commit,'meals-dashboard']:
  if needle not in own+idx: errors.append('missing ownership pointer: '+needle)
 if (root/'hermes-integration').exists(): stale.append('.specify/hermes-integration')
 if 'data-science/meals-check/.specify/specs' in own or 'data-science/meals-check/.specify/specs' in idx: stale.append('obsolete active source path')
 if a.expected_meal_planner_commit in own and 'current' not in own.lower(): errors.append('meal-planner pointer is not labelled current')
 out={'errors':errors,'resolved':not errors and not stale,'stale_links':stale,'schema_version':1}; print(json.dumps(out,sort_keys=True)); return 0 if out['resolved'] else 1
if __name__=='__main__': sys.exit(main())
