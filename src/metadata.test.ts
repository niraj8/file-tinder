import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile, rm, symlink, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseQuarantineAgent, readWhereFrom, orderFiles } from "./metadata";
import { scanFolder } from "./scan";

describe("parseQuarantineAgent", () => {
  test("takes the app name from the third field", () => {
    expect(parseQuarantineAgent("0281;6a7ce6e5;Chrome;5EDB01E5-A0B7-4F67-9CEF-4F8FE4FEF5DD"))
      .toBe("Chrome");
  });
  test("handles an app name containing spaces", () => {
    expect(parseQuarantineAgent("0081;68a1;Google Chrome;ABC")).toBe("Google Chrome");
  });
  test("returns null when the field is missing", () => expect(parseQuarantineAgent("0081;68a1")).toBeNull());
  test("returns null when the field is empty", () => expect(parseQuarantineAgent("0081;68a1;;ABC")).toBeNull());
  test("returns null for empty input", () => expect(parseQuarantineAgent("")).toBeNull());
});

describe("readWhereFrom", () => {
  const withWhereFrom = async (urls: string[]) => {
    const dir = await mkdtemp(join(tmpdir(), "file-tinder-wf-"));
    const file = join(dir, "downloaded.pdf");
    await writeFile(file, "x");
    const plist = join(dir, "wf.plist");
    await writeFile(plist, `<?xml version="1.0"?><!DOCTYPE plist><plist version="1.0"><array>${
      urls.map((u) => `<string>${u}</string>`).join("")}</array></plist>`);
    await Bun.$`plutil -convert binary1 ${plist}`.quiet();
    const hex = Buffer.from(await Bun.file(plist).arrayBuffer()).toString("hex");
    await Bun.$`xattr -wx com.apple.metadata:kMDItemWhereFroms ${hex} ${file}`.quiet();
    return { dir, file };
  };

  test("decodes the binary plist that mdls reports as null", async () => {
    const { dir, file } = await withWhereFrom([
      "https://downloads.cursor.com/production/abc/Cursor-darwin-arm64.dmg",
      "https://cursor.com/",
    ]);
    expect(await readWhereFrom(file)).toEqual([
      "https://downloads.cursor.com/production/abc/Cursor-darwin-arm64.dmg",
      "https://cursor.com/",
    ]);
    await rm(dir, { recursive: true, force: true });
  });

  test("is empty when the attribute is absent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "file-tinder-wf-"));
    const file = join(dir, "local.txt");
    await writeFile(file, "x");
    expect(await readWhereFrom(file)).toEqual([]);
    await rm(dir, { recursive: true, force: true });
  });
});

describe("orderFiles", () => {
  const files = [
    { name: "small-old.txt", size: 10, mtime: 100 },
    { name: "big-new.dmg", size: 900, mtime: 300 },
    { name: "mid.pdf", size: 50, mtime: 200 },
  ];
  const names = (o: Parameters<typeof orderFiles>[1]) => orderFiles(files, o).map((f) => f.name);

  test("size puts the biggest first", () =>
    expect(names("size")).toEqual(["big-new.dmg", "mid.pdf", "small-old.txt"]));
  test("mtime puts the oldest first", () =>
    expect(names("mtime")).toEqual(["small-old.txt", "mid.pdf", "big-new.dmg"]));
  test("name sorts alphabetically", () =>
    expect(names("name")).toEqual(["big-new.dmg", "mid.pdf", "small-old.txt"]));
  test("does not mutate its input", () => {
    const before = files.map((f) => f.name);
    orderFiles(files, "mtime");
    expect(files.map((f) => f.name)).toEqual(before);
  });
});

describe("scanFolder", () => {
  const fixture = async () => {
    const dir = await mkdtemp(join(tmpdir(), "file-tinder-scan-"));
    await writeFile(join(dir, "a.pdf"), "aaa");
    await writeFile(join(dir, "b.txt"), "bb");
    await writeFile(join(dir, ".hidden"), "x");
    await mkdir(join(dir, "Images"));
    await writeFile(join(dir, "Images", "nested.png"), "x");
    await symlink(join(dir, "a.pdf"), join(dir, "link.pdf"));
    return dir;
  };

  test("returns only top-level regular files", async () => {
    const dir = await fixture();
    const names = (await scanFolder(dir, "name")).map((f) => f.name);
    expect(names).toEqual(["a.pdf", "b.txt"]);
    await rm(dir, { recursive: true, force: true });
  });

  test("never recurses into directories", async () => {
    const dir = await fixture();
    const names = (await scanFolder(dir, "name")).map((f) => f.name);
    expect(names).not.toContain("nested.png");
    expect(names).not.toContain("Images");
    await rm(dir, { recursive: true, force: true });
  });

  test("skips dotfiles and symlinks", async () => {
    const dir = await fixture();
    const names = (await scanFolder(dir, "name")).map((f) => f.name);
    expect(names).not.toContain(".hidden");
    expect(names).not.toContain("link.pdf");
    await rm(dir, { recursive: true, force: true });
  });

  test("carries size, timestamps and siblings on each record", async () => {
    const dir = await mkdtemp(join(tmpdir(), "file-tinder-scan-"));
    await writeFile(join(dir, "Form67.csv"), "aaa");
    await writeFile(join(dir, "Form67_filled.csv"), "aaaaa");
    const [first] = await scanFolder(dir, "size");
    expect(first!.name).toBe("Form67_filled.csv");
    expect(first!.size).toBe(5);
    expect(typeof first!.mtime).toBe("number");
    expect(typeof first!.atime).toBe("number");
    expect(first!.siblings.map((s) => s.name)).toEqual(["Form67.csv"]);
    await rm(dir, { recursive: true, force: true });
  });

  test("is empty for an empty folder", async () => {
    const dir = await mkdtemp(join(tmpdir(), "file-tinder-scan-"));
    expect(await scanFolder(dir, "size")).toEqual([]);
    await rm(dir, { recursive: true, force: true });
  });
});
