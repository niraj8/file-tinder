import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, writeFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { pickTrashedPath, trashFile, restoreFile, nextAvailableName, moveToTrashDirectly } from "./trash";

const TRASH = join(homedir(), ".Trash");

describe("pickTrashedPath", () => {
  const trash = "/Users/x/.Trash";

  test("picks the single new entry", () => {
    expect(pickTrashedPath(trash, ["old.txt"], ["old.txt", "report.pdf"], "report.pdf"))
      .toEqual({ path: "/Users/x/.Trash/report.pdf", certain: true, putBack: true });
  });

  test("picks the renamed entry when macOS resolved a collision", () => {
    const after = ["report.pdf", "report.pdf 14-41-57-146.pdf"];
    expect(pickTrashedPath(trash, ["report.pdf"], after, "report.pdf"))
      .toEqual({ path: "/Users/x/.Trash/report.pdf 14-41-57-146.pdf", certain: true, putBack: true });
  });

  test("falls back to the original name, flagged uncertain, when nothing appeared", () => {
    expect(pickTrashedPath(trash, ["a.txt"], ["a.txt"], "report.pdf"))
      .toEqual({ path: "/Users/x/.Trash/report.pdf", certain: false, putBack: true });
  });

  test("picks by name when another session trashes something at the same moment", () => {
    const after = ["a.txt", "report.pdf", "unrelated.dmg"];
    expect(pickTrashedPath(trash, ["a.txt"], after, "report.pdf"))
      .toEqual({ path: "/Users/x/.Trash/report.pdf", certain: true, putBack: true });
  });

  test("picks the collision-renamed entry even amid concurrent trashing", () => {
    const after = ["report.pdf", "report.pdf 14-41-57-146.pdf", "unrelated.dmg"];
    expect(pickTrashedPath(trash, ["report.pdf"], after, "report.pdf"))
      .toEqual({ path: "/Users/x/.Trash/report.pdf 14-41-57-146.pdf", certain: true, putBack: true });
  });

  test("is uncertain when several appeared and none bears the original name", () => {
    const after = ["a.txt", "other.dmg", "unrelated.zip"];
    expect(pickTrashedPath(trash, ["a.txt"], after, "report.pdf"))
      .toEqual({ path: "/Users/x/.Trash/report.pdf", certain: false, putBack: true });
  });

  test("prefers an exact name match over a collision-renamed sibling", () => {
    const after = ["report.pdf", "report.pdf 14-41-57-146.pdf"];
    expect(pickTrashedPath(trash, [], after, "report.pdf"))
      .toEqual({ path: "/Users/x/.Trash/report.pdf", certain: true, putBack: true });
  });

  test("ignores entries that disappeared between the two listings", () => {
    expect(pickTrashedPath(trash, ["gone.txt"], ["report.pdf"], "report.pdf"))
      .toEqual({ path: "/Users/x/.Trash/report.pdf", certain: true, putBack: true });
  });
});

describe("trashFile / restoreFile (touches the real Trash)", () => {
  const stray: string[] = [];
  afterAll(async () => {
    for (const p of stray) await rm(p, { force: true });
  });

  test("moves a file to the Trash and puts it back", async () => {
    const dir = await mkdtemp(join(tmpdir(), "file-tinder-test-"));
    const name = `__file_tinder_test_${Date.now()}__.txt`;
    const original = join(dir, name);
    await writeFile(original, "probe");

    const trashed = await trashFile(original);
    stray.push(trashed.path);

    expect(trashed.certain).toBe(true);
    expect(trashed.putBack).toBe(true);
    expect(trashed.path.startsWith(TRASH)).toBe(true);
    expect(await readdir(TRASH)).toContain(name);
    expect(await stat(original).catch(() => null)).toBeNull();

    await restoreFile(trashed.path, original);
    expect((await stat(original)).size).toBe(5);
    expect(await readdir(TRASH)).not.toContain(name);

    await rm(dir, { recursive: true, force: true });
  });

  test("rejects a file that does not exist", async () => {
    await expect(trashFile(join(tmpdir(), "__file_tinder_absent__"))).rejects.toThrow();
  });
});

describe("nextAvailableName", () => {
  test("keeps the name when nothing is in the way", () => {
    expect(nextAvailableName(new Set(), "report.pdf")).toBe("report.pdf");
  });
  test("appends 2 on the first collision", () => {
    expect(nextAvailableName(new Set(["report.pdf"]), "report.pdf")).toBe("report 2.pdf");
  });
  test("counts past a run of collisions", () => {
    const taken = new Set(["report.pdf", "report 2.pdf", "report 3.pdf"]);
    expect(nextAvailableName(taken, "report.pdf")).toBe("report 4.pdf");
  });
  test("handles a name with no extension", () => {
    expect(nextAvailableName(new Set(["Makefile"]), "Makefile")).toBe("Makefile 2");
  });
  test("keeps a multi-dot stem intact", () => {
    expect(nextAvailableName(new Set(["a.tar.gz"]), "a.tar.gz")).toBe("a.tar 2.gz");
  });
});

describe("moveToTrashDirectly (fallback when JXA is unavailable)", () => {
  const stray: string[] = [];
  afterAll(async () => {
    for (const p of stray) await rm(p, { force: true });
  });

  test("moves the file and reports that Put Back will not work", async () => {
    const dir = await mkdtemp(join(tmpdir(), "file-tinder-fb-"));
    const name = `__file_tinder_fb_${Date.now()}__.txt`;
    const original = join(dir, name);
    await writeFile(original, "probe");

    const result = await moveToTrashDirectly(original);
    stray.push(result.path);

    expect(result.certain).toBe(true);
    expect(result.putBack).toBe(false);
    expect(await readdir(TRASH)).toContain(name);
    expect(await stat(original).catch(() => null)).toBeNull();

    await rm(dir, { recursive: true, force: true });
  });
});
