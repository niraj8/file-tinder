import { describe, expect, test } from "bun:test";
import { capture, inFlightCount, run, MAX_IN_FLIGHT } from "./spawn";

describe("capture", () => {
  test("returns the exit code and stdout of the command", async () => {
    const result = await capture(["echo", "hello"]);
    expect(result).toEqual({ exitCode: 0, stdout: "hello\n" });
  });

  test("reports a non-zero exit rather than throwing", async () => {
    const result = await capture(["sh", "-c", "exit 3"]);
    expect(result?.exitCode).toBe(3);
  });

  test("feeds stdin to the command", async () => {
    const result = await capture(["cat"], Buffer.from("piped"));
    expect(result?.stdout).toBe("piped");
  });

  test("answers null for a command that cannot be started", async () => {
    expect(await capture(["/nonexistent/tool", "-p"])).toBeNull();
  });
});

describe("run", () => {
  test("gives the exit code", async () => expect(await run(["true"])).toBe(0));
  test("gives null when the command never ran", async () =>
    expect(await run(["/nonexistent/tool"])).toBeNull());
});

describe("the gate", () => {
  /*
   * The point of the whole module: a folder of several hundred files asks for far more
   * processes at once than macOS will fork, and used to get EAGAIN instead of a scan.
   */
  test("never runs more commands at once than the cap", async () => {
    let peak = 0;
    const watch = setInterval(() => { peak = Math.max(peak, inFlightCount()); }, 1);
    const commands = Array.from({ length: MAX_IN_FLIGHT * 4 }, () => capture(["sleep", "0.05"]));
    const results = await Promise.all(commands);
    clearInterval(watch);

    expect(results.every((result) => result?.exitCode === 0)).toBe(true);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(MAX_IN_FLIGHT);
  });

  test("leaves nothing in flight once the work is done", async () => {
    await Promise.all([capture(["true"]), capture(["/nonexistent/tool"]), run(["true"])]);
    expect(inFlightCount()).toBe(0);
  });
});
