from pathlib import Path
for name in '''.specify/specs/008-dashboard-order-items/scenarios.yaml
.specify/specs/008-dashboard-order-items/traceability.yaml
.specify/specs/015-dashboard-oidc-authentication/scenarios.yaml
.specify/specs/015-dashboard-oidc-authentication/traceability.yaml
.specify/specs/016-dashboard-blob-storage-layout/tasks.md
.specify/specs/018-dashboard-order-status-tracking/tasks.md
.specify/specs/027-dashboard-firecrawl-search-fallback/CHANGELOG.md'''.splitlines():
 p=Path(name); p.write_bytes(p.read_bytes().rstrip(b'\n')+b'\n')
