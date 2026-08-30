import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "./cli";

describe("parseArgs", () => {
  test("defaults to ~/Downloads, largest first", () => {
    expect(parseArgs([])).toEqual({ folder: join(homedir(), "Downloads"), order: "size", port: 8777 });
  });
  test("takes a folder argument", () => {
    expect(parseArgs(["/tmp/stuff"]).folder).toBe("/tmp/stuff");
  });
  test("expands a leading ~", () => {
    expect(parseArgs(["~/Desktop"]).folder).toBe(join(homedir(), "Desktop"));
  });
  test("resolves a relative folder to an absolute path", () => {
    expect(parseArgs(["."]).folder).toBe(process.cwd());
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
  test("rejects a second folder argument", () => {
    expect(() => parseArgs(["/tmp/a", "/tmp/b"])).toThrow();
  });
});
