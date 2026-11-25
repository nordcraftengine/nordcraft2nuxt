# Examples

This directory is for local Nordcraft exports and generated apps. Its JSON
exports (`examples/*.json`) and generated app folders (`examples/*-app/`) are
ignored by git because they can be large, contain third-party content, or
contain private project data.

Use `tests/fixtures` for minimal reproducible compiler inputs. To try the
compiler, place a Nordcraft **Download branch** JSON export here and run:

```bash
bun run build
node dist/cli.js examples/your-export.json --out examples/your-app --force
```
