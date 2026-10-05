from pathlib import Path
p=Path('.specify/specs/index.yaml')
ids={x.name for x in Path('.specify/specs').iterdir() if x.is_dir()}
lines=p.read_text().splitlines(True)
out=[]; skip=False
for line in lines:
    if line.startswith('- id: '): skip=line.split(': ',1)[1].strip() not in ids
    if not skip: out.append(line)
p.write_text(''.join(out))
