"""Contract-level adversarial tests for the destination governance surface."""
from pathlib import Path
import json, os, shutil, stat, subprocess, sys

import pytest

ROOT = Path(__file__).parents[2]
VERIFY = ROOT / ".specify/scripts/verify_migration.py"
SRC = "/home/hermes/workspace/Hermes-Skills"
SRCROOT = "data-science/meals-check/.specify/specs"
COMMIT = "e1cbe3dba90bbba92bbc1a0f26968381524c0ada"

def run(*args, cwd=ROOT):
    return subprocess.run([sys.executable, *map(str, args)], cwd=cwd, text=True, capture_output=True)

def verify(manifest, source_root=None):
    return run(VERIFY, "--manifest", manifest, "--source-repo", SRC,
               "--source-root", source_root or SRCROOT, "--source-commit", COMMIT,
               "--expected-feature-count", "31", "--json")

def test_manifest_and_inventory():
    r = verify(ROOT / ".specify/migration-manifest.json")
    assert r.returncode == 0, r.stdout + r.stderr
    assert json.loads(r.stdout)["valid"] is True

def test_governance_and_reciprocal_links():
    r = run(ROOT / ".specify/scripts/validate_governance_data.py", "--root", ROOT / ".specify", "--json")
    assert r.returncode == 0, r.stdout + r.stderr
    r = run(ROOT / ".specify/scripts/verify_ownership_links.py", "--hermes-repo", SRC,
            "--meal-planner-repo", "/home/hermes/workspace/meal-planner",
            "--expected-source-commit", COMMIT,
            "--expected-meal-planner-commit", "134d2099fcd4fa7d3e67b816b38573986b8eb61f", "--json")
    assert r.returncode == 0, r.stdout + r.stderr
    assert json.loads(r.stdout)["resolved"] is True

@pytest.fixture
def manifest_copy(tmp_path):
    m = json.loads((ROOT / ".specify/migration-manifest.json").read_text())
    p = tmp_path / "manifest.json"
    p.write_text(json.dumps(m))
    return m, p

@pytest.mark.parametrize("mutation", [
    lambda m: m["features"].pop(),
    lambda m: m["features"].append("999-extra"),
    lambda m: m["features"].__setitem__(0, m["features"][1]),
    lambda m: m["features"].reverse(),
    lambda m: m["entries"].__setitem__(0, {**m["entries"][0], "type": "unsupported"}),
    lambda m: m["entries"].__setitem__(2, {**m["entries"][2], "mode": 493}),
    lambda m: m["entries"].__setitem__(3, {**m["entries"][3], "sha256": "0" * 64}),
    lambda m: m["entries"].__setitem__(4, {**m["entries"][4], "size": 0}),
])
def test_manifest_rejects_inventory_and_metadata_drift(manifest_copy, mutation):
    m, p = manifest_copy
    mutation(m); p.write_text(json.dumps(m))
    assert verify(p).returncode != 0

def test_manifest_rejects_empty_directory_loss(tmp_path):
    m = json.loads((ROOT / ".specify/migration-manifest.json").read_text())
    # A directory entry removed from the manifest is invalid even when files remain.
    m["entries"] = [e for e in m["entries"] if e["path"] != "specs/004-dashboard-sync"]
    p = tmp_path / "manifest.json"; p.write_text(json.dumps(m))
    assert verify(p).returncode != 0

def test_manifest_rejects_duplicate_entry_path_and_id(tmp_path):
    original = json.loads((ROOT / ".specify/migration-manifest.json").read_text())
    mutations = (lambda m: m["entries"].append(dict(m["entries"][1])),
                 lambda m: m["features"].append(m["features"][0]))
    for number, mutation in enumerate(mutations):
        m = json.loads(json.dumps(original)); mutation(m)
        p = tmp_path / f"duplicate-{number}.json"; p.write_text(json.dumps(m))
        assert verify(p).returncode != 0

def test_manifest_rejects_actual_byte_drift():
    source = ROOT / ".specify/specs/004-dashboard-sync/spec.md"
    original = source.read_bytes(); source.write_bytes(original + b"\nbyte drift fixture\n")
    try:
        assert verify(ROOT / ".specify/migration-manifest.json").returncode != 0
    finally:
        source.write_bytes(original)

def test_manifest_rejects_executable_mode_drift():
    source = ROOT / ".specify/specs/004-dashboard-sync/spec.md"
    original = source.stat().st_mode; source.chmod(original | stat.S_IXUSR)
    try:
        assert verify(ROOT / ".specify/migration-manifest.json").returncode != 0
    finally:
        source.chmod(original)

def test_manifest_rejects_symlink_target_drift(tmp_path):
    m = json.loads((ROOT / ".specify/migration-manifest.json").read_text())
    symlinks = [e for e in m["entries"] if e["type"] == "symlink"]
    if symlinks:
        symlinks[0]["target_sha256"] = "0" * 64
    else:
        # Exercise the same fail-closed target-drift path even if this
        # historical tree contains no symlink entries.
        file_entry = next(e for e in m["entries"] if e["type"] == "file")
        file_entry.update(type="symlink", target="changed", target_sha256="0" * 64)
    p = tmp_path / "manifest.json"; p.write_text(json.dumps(m))
    assert verify(p).returncode != 0

def test_governance_rejects_unknown_and_empty_mappings(tmp_path):
    clone = tmp_path / ".specify"
    shutil.copytree(ROOT / ".specify", clone)
    index = clone / "specs/index.yaml"
    text = index.read_text().replace("id: 004-dashboard-sync", "id: 999-unknown", 1)
    index.write_text(text)
    r = run(ROOT / ".specify/scripts/validate_governance_data.py", "--root", clone, "--json")
    assert r.returncode != 0
    index.write_text(index.read_text().replace("id: 999-unknown", "id: 004-dashboard-sync", 1).replace("name: Dashboard Sync", "name: ''", 1))
    r = run(ROOT / ".specify/scripts/validate_governance_data.py", "--root", clone, "--json")
    assert r.returncode != 0

def test_ownership_rejects_unresolved_repository():
    r = run(ROOT / ".specify/scripts/verify_ownership_links.py", "--hermes-repo", "/does/not/exist",
            "--meal-planner-repo", "/does/not/exist", "--expected-source-commit", COMMIT,
            "--expected-meal-planner-commit", "134d2099fcd4fa7d3e67b816b38573986b8eb61f", "--json")
    assert r.returncode != 0

def test_ownership_rejects_wrong_link_at_expected_head(tmp_path):
    hermes = tmp_path / "Hermes-Skills"; meal_planner = tmp_path / "meal-planner"
    # Build real, independent repositories rather than copying a worktree's
    # .git file.  The expected HEADs are discovered from the commits created
    # here, so the fixture reaches reciprocal-content validation before the
    # wrong-link mutation is checked.
    hermes_pointer = hermes / 'data-science/meals-check/MEAL-PLANNER-OWNERSHIP.md'
    hermes_skill = hermes / 'data-science/meals-check/SKILL.md'
    hermes_pointer.parent.mkdir(parents=True)
    hermes_pointer.write_text('Current meal-planner repository: meal-planner.git\nDashboard Repo (meals-dashboard)\n')
    hermes_skill.write_text('Current dashboard repository: meals-dashboard\n')
    meal_readme = meal_planner / 'README.md'
    meal_index = meal_planner / '.specify/specs/index.yaml'
    meal_index.parent.mkdir(parents=True)
    meal_readme.write_text('Dashboard Repo (meals-dashboard)\n.specify/specs/index.yaml\n')
    meal_index.write_text('dashboard pointer: .specify/specs/index.yaml\n')
    for repo in (hermes, meal_planner):
        subprocess.run(['git', 'init', '-q', str(repo)], check=True)
        subprocess.run(['git', '-C', str(repo), 'add', '.'], check=True)
        subprocess.run(['git', '-C', str(repo), '-c', 'user.name=fixture',
                        '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture'], check=True)
    hermes_commit = subprocess.check_output(['git', '-C', str(hermes), 'rev-parse', 'HEAD'], text=True).strip()
    meal_commit = subprocess.check_output(['git', '-C', str(meal_planner), 'rev-parse', 'HEAD'], text=True).strip()
    # Mutate only the meal-planner reciprocal pointer after its commit, while
    # retaining valid .git metadata and both expected HEADs.
    meal_readme.write_text(meal_readme.read_text().replace(
        'Dashboard Repo (meals-dashboard)', 'Dashboard Repo (obsolete-dashboard)'))
    # The destination pointers must agree with the fixture's exact commits so
    # the repository-content assertion is reached, then are restored even if
    # the subprocess or assertion fails.
    own = ROOT / '.specify/OWNERSHIP.md'; index = ROOT / '.specify/specs/index.yaml'
    own_original, index_original = own.read_text(), index.read_text()
    own.write_text(own_original.replace(COMMIT, hermes_commit).replace(
        '134d2099fcd4fa7d3e67b816b38573986b8eb61f', meal_commit))
    index.write_text(index_original.replace(COMMIT, hermes_commit).replace(
        '134d2099fcd4fa7d3e67b816b38573986b8eb61f', meal_commit))
    try:
        r = run(ROOT / ".specify/scripts/verify_ownership_links.py", "--hermes-repo", hermes,
                "--meal-planner-repo", meal_planner, "--expected-source-commit", hermes_commit,
                "--expected-meal-planner-commit", meal_commit, "--json")
    finally:
        own.write_text(own_original); index.write_text(index_original)
    assert r.returncode != 0
    assert 'reciprocal dashboard pointer missing' in r.stdout

def test_staged_scope_rejects_outside_and_accepts_governance(tmp_path):
    scanner = "/home/hermes/.hermes/cache/scratch/scan_staged_diff_v1.py"
    repo = tmp_path / "repo"; repo.mkdir()
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    (repo / ".specify").mkdir(); (repo / ".specify/ok.md").write_text("governance")
    subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
    good = run(scanner, "--repo", repo, "--allow-prefix", ".specify")
    assert good.returncode == 0
    (repo / "package.json").write_text("{}"); subprocess.run(["git", "-C", str(repo), "add", "package.json"], check=True)
    bad = run(scanner, "--repo", repo, "--allow-prefix", ".specify")
    assert bad.returncode != 0


@pytest.mark.parametrize("bad_path", ["app/page.tsx", "requirements.txt", ".github/workflows/deploy.yml"])
def test_staged_scope_rejects_runtime_dependency_and_deployment_paths(tmp_path, bad_path):
    scanner = "/home/hermes/.hermes/cache/scratch/scan_staged_diff_v1.py"
    repo = tmp_path / "repo"; repo.mkdir()
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    (repo / ".specify").mkdir(); (repo / ".specify/ok.md").write_text("governance")
    target = repo / bad_path; target.parent.mkdir(parents=True, exist_ok=True); target.write_text("fixture")
    subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
    bad = run(scanner, "--repo", repo, "--allow-prefix", ".specify")
    assert bad.returncode != 0