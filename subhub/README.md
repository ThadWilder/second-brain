# SubHub

Two-sided marketplace connecting fencing franchise operators with the subcontractors they need to complete work.

**Status**: Blueprint / pre-build  
**Beachhead market**: Fencing franchise brands (Stand Strong Fence, Top Rail Fence, etc.)

See `CLAUDE.md` for the full product spec.

---

## Migrating this to its own repository

When you're ready to move SubHub into a dedicated repo, tell Claude:

> "Migrate the subhub directory to its own repo at `<github-url>`"

Or run it yourself:

```bash
# 1. Split the subhub/ prefix into its own branch
git subtree split --prefix=subhub -b subhub-main

# 2. Create the new repo on GitHub (github.com/new), then push
git push git@github.com:ThadWilder/subhub.git subhub-main:main

# 3. Clean up the local split branch
git branch -d subhub-main

# 4. Optionally remove the subhub/ folder from this repo
git rm -r subhub/
git commit -m "chore: extract subhub to its own repo"
```

Everything under `subhub/` will land at the root of the new repo with full git history preserved.
