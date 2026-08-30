import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renameFile, validateName } from "./rename";

describe("validateName", () => {
  const refused: [string, string][] = [
    ["", "empty"],
    ["   ", "whitespace only"],
    ["a/b.txt", "contains a separator"],
    ["../escape.txt", "contains a separator"],
    [".", "the current directory"],
    ["..", "the parent directory"],
    [".hidden", "a leading dot"],
    ["bad\0name", "a null byte"],
    [`${"n".repeat(256)}.txt`, "over the length limit"],
  ];
  for (const [name, why] of refused) {
    test(`refuses ${why}`, () => expect(validateName(name)).toBeString());
  }

  test("accepts an ordinary name", () => expect(validateName("report.pdf")).toBeNull());
  test("accepts a name with dots inside it", () => expect(validateName("v1.2.tar.gz")).toBeNull());
  test("accepts a name that is padded with spaces", () =>
    expect(validateName("  report.pdf  ")).toBeNull());
});

describe("renameFile", () => {
  const folders: string[] = [];

  async function folderWith(...names: string[]): Promise<string> {
    const folder = await mkdtemp(join(tmpdir(), "file-tinder-rename-"));
    folders.push(folder);
    for (const name of names) await writeFile(join(folder, name), name);
    return folder;
  }

  afterEach(async () => {
    await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
  });

  test("renames the file and reports the name that landed", async () => {
    const folder = await folderWith("old.pdf");
    expect(await renameFile([folder], join(folder, "old.pdf"), "new.pdf"))
      .toEqual({ ok: true, name: "new.pdf", path: join(folder, "new.pdf") });
    expect(await readdir(folder)).toEqual(["new.pdf"]);
  });

  test("trims the new name before using it", async () => {
    const folder = await folderWith("old.pdf");
    expect(await renameFile([folder], join(folder, "old.pdf"), "  new.pdf  ")).toEqual({ ok: true, name: "new.pdf", path: join(folder, "new.pdf") });
    expect(await readdir(folder)).toEqual(["new.pdf"]);
  });

  test("renaming a file to its own name is a no-op, not a collision", async () => {
    const folder = await folderWith("same.pdf");
    expect(await renameFile([folder], join(folder, "same.pdf"), "same.pdf")).toMatchObject({ ok: true, name: "same.pdf" });
    expect(await readdir(folder)).toEqual(["same.pdf"]);
  });

  test("refuses to overwrite an existing file", async () => {
    const folder = await folderWith("old.pdf", "taken.pdf");
    const result = await renameFile([folder], join(folder, "old.pdf"), "taken.pdf");
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: "collision" });
    expect((await readdir(folder)).sort()).toEqual(["old.pdf", "taken.pdf"]);
    expect(await Bun.file(join(folder, "taken.pdf")).text()).toBe("taken.pdf");
  });

  test("allows a rename that only changes case", async () => {
    const folder = await folderWith("Report.pdf");
    expect(await renameFile([folder], join(folder, "Report.pdf"), "report.pdf"))
      .toMatchObject({ ok: true, name: "report.pdf" });
    expect(await readdir(folder)).toEqual(["report.pdf"]);
  });

  test("reports an invalid name without touching the disk", async () => {
    const folder = await folderWith("old.pdf");
    expect(await renameFile([folder], join(folder, "old.pdf"), ".hidden")).toMatchObject({
      ok: false, reason: "invalid",
    });
    expect(await readdir(folder)).toEqual(["old.pdf"]);
  });

  test("refuses a new name that escapes the folder", async () => {
    const folder = await folderWith("old.pdf");
    expect(await renameFile([folder], join(folder, "old.pdf"), "sub/new.pdf")).toMatchObject({
      ok: false, reason: "invalid",
    });
  });

  test("a name taken in another folder is not a collision", async () => {
    const one = await folderWith("old.pdf");
    const two = await folderWith("taken.pdf");
    expect(await renameFile([one, two], join(one, "old.pdf"), "taken.pdf"))
      .toMatchObject({ ok: true, name: "taken.pdf" });
    expect(await readdir(one)).toEqual(["taken.pdf"]);
    expect(await readdir(two)).toEqual(["taken.pdf"]);
  });

  test("refuses a path outside every folder being triaged", async () => {
    const one = await folderWith("old.pdf");
    const two = await folderWith("other.pdf");
    expect(await renameFile([two], join(one, "old.pdf"), "new.pdf"))
      .toMatchObject({ ok: false, reason: "unresolvable" });
    expect(await readdir(one)).toEqual(["old.pdf"]);
  });

  test("reports a file that is no longer there", async () => {
    const folder = await folderWith();
    expect(await renameFile([folder], join(folder, "gone.pdf"), "new.pdf")).toMatchObject({
      ok: false, reason: "vanished",
    });
  });
});
