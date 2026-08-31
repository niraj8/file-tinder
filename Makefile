.PHONY: up release

FOLDER ?= ~/Downloads
V ?= patch

# Run the dev server on a folder: make up FOLDER=~/Desktop
up:
	bun run index.ts $(FOLDER)

# Cut a release: make release V=minor (or major, or an exact 0.1.3). Bumps package.json,
# commits it, tags that commit, pushes both — the workflow does the rest.
release:
	bun pm version $(V)
	git push origin main --follow-tags
