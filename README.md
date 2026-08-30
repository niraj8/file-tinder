# file-tinder

Swipe through the loose files in a folder and decide, one keypress at a time, what to trash and what to keep.

![A galaxy photo fills the preview pane. Beside it a dossier names the file, the folder it sits in, its size, when it was last modified and last opened, and where it was downloaded from. Below that, the legend: Trash on the left arrow, Keep on the right, and Rename, Open and Undo under them.](demo.png)

## Install

```bash
brew install niraj8/tap/file-tinder
```

## Run it

```bash
file-tinder ~/Downloads
```

A browser tab opens. Files are served from a local server; nothing leaves your machine. Closing the tab stops the server (Ctrl-C works too).

macOS only — it leans on the system Trash, Spotlight's download provenance, and `sips` for HEIC previews.

The folder defaults to `~/Downloads`, and only loose files are shown — subfolders, symlinks, and dotfiles are skipped.

### Several folders at once

Pass as many as you like. There are no glob patterns to learn — let the shell expand one:

```bash
file-tinder ~/Downloads/Images/2026-*
```

They become a single queue rather than one queue per folder, sorted across all of them, and each card says which folder it came from. Sibling detection runs across the whole set too, so the same photo sitting in `2026-01` and `2026-03` shows up as a duplicate. Renaming still keeps a file where it is — it never moves anything between folders.

### Keys

| Key | Action |
| --- | --- |
| `←` | trash (macOS Trash, recoverable) |
| `→` | keep — leaves the file exactly where it is, untouched |
| `r` | rename, with the basename pre-selected (`Enter` commits, `Escape` cancels) |
| `o` | open in the default app |
| `u` | undo the last decision |

Every key also has a button in the legend at the bottom of the card, so a mouse works as well as the keyboard.

Everywhere else, `←` means back. Here it spends a file, so the first trash on a machine says so before it happens — that the arrows are the two verdicts rather than navigation, that this is the macOS Trash, and that `u` undoes — then waits for `Enter` (`Escape` backs out). Once, ever. After that `←` trashes straight away.

Renaming refuses to overwrite an existing file, so nothing is ever lost to a name clash. It isn't a verdict either — after renaming you still press `←` or `→`.

### Options

```bash
file-tinder [folder...] [--order size|mtime|name] [--port N]
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

## From source

```bash
bun install
bun run index.ts ~/Downloads
bun test
```

## License

MIT
