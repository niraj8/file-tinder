# file-tinder

Swipe through the loose files in a folder and decide, one keypress at a time, what to trash and what to keep.

## Run it

```bash
bun install
bun run index.ts ~/Downloads
```

A browser tab opens. Files are served from a local server; nothing leaves your machine. Closing the tab stops the server (Ctrl-C works too).

The folder defaults to `~/Downloads`, and only loose files are shown — subfolders, symlinks, and dotfiles are skipped.

### Keys

| Key | Action |
| --- | --- |
| `←` | trash (macOS Trash, recoverable) |
| `→` | keep |
| `↓` | skip for now |
| `o` | open in the default app |
| `u` | undo the last decision |

### Options

```bash
bun run index.ts [folder] [--order size|mtime|name] [--port N]
```

- `--order size` — largest first (default). `mtime` is oldest first, `name` is alphabetical.
- `--port` — defaults to `8777`, moves to the next free port if taken.

## Tip: pair it with `organize`

file-tinder answers *"is this worth keeping?"*. It deliberately does not answer *"where should it live?"* — everything you keep stays put in the folder.

So do the triage first, then let [organize](https://organize.readthedocs.io) file the survivors:

```yaml
# ~/.config/organize/config.yaml
rules:
  - locations: ~/Downloads
    filters:
      - extension: [pdf, epub]
    actions:
      - move: ~/Documents/Reading/

  - locations: ~/Downloads
    filters:
      - extension: [png, jpg, jpeg, heic]
    actions:
      - move: ~/Pictures/Downloads/
```

```bash
organize sim   # dry run — shows what would move
organize run
```

Trash the junk by hand, sort the rest by rule.
