import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "./cli";

describe("parseArgs", () => {
  test("defaults to ~/Downloads, largest first", () => {
    expect(parseArgs([]))
      .toEqual({ folders: [join(homedir(), "Downloads")], order: "size", port: 8777 });
  });
  test("takes a folder argument", () => {
    expect(parseArgs(["/tmp/stuff"]).folders).toEqual(["/tmp/stuff"]);
  });
  test("takes several folders, in the order given", () => {
    expect(parseArgs(["/tmp/b", "/tmp/a"]).folders).toEqual(["/tmp/b", "/tmp/a"]);
  });
  test("keeps flags working around a list of folders", () => {
    const options = parseArgs(["/tmp/a", "--order", "name", "/tmp/b", "--port", "9000"]);
    expect(options).toEqual({ folders: ["/tmp/a", "/tmp/b"], order: "name", port: 9000 });
  });
  test("drops a folder named twice, as an expanded glob can", () => {
    expect(parseArgs(["/tmp/a", "/tmp/a/", "/tmp/b"]).folders).toEqual(["/tmp/a", "/tmp/b"]);
  });
  test("expands a leading ~", () => {
    expect(parseArgs(["~/Desktop"]).folders).toEqual([join(homedir(), "Desktop")]);
  });
  test("resolves a relative folder to an absolute path", () => {
    expect(parseArgs(["."]).folders).toEqual([process.cwd()]);
  });
  test.each(["size", "mtime", "name"] as const)("accepts --order %s", (order) => {
    expect(parseArgs(["--order", order]).order).toBe(order);
  });
  test("accepts --order=value", () => {
    expect(parseArgs(["--order=mtime"]).order).toBe("mtime");
  });
  test("rejects an unknown order", () => {
    expect(() => parseArgs(["--order", "colour"])).toThrow(/order/i);
  });
  test("accepts --port", () => {
    expect(parseArgs(["--port", "9000"]).port).toBe(9000);
  });
  test("rejects a non-numeric port", () => {
    expect(() => parseArgs(["--port", "abc"])).toThrow(/port/i);
  });
  test("rejects an unknown flag", () => {
    expect(() => parseArgs(["--recurse"])).toThrow(/unknown/i);
  });
  test("rejects an unknown flag among folders", () => {
    expect(() => parseArgs(["/tmp/a", "--recurse", "/tmp/b"])).toThrow(/unknown/i);
  });
});
