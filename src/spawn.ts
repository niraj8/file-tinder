/**
 * Running the command-line tools a scan depends on, without exhausting the process table.
 *
 * A folder of a few hundred files used to spawn an `xattr` and a `plutil` for every file
 * at once, and macOS answers a burst that size by refusing to fork: `posix_spawn` fails
 * with EAGAIN and the whole scan dies with a stack trace instead of returning a queue of
 * cards. Every capturing spawn goes through the gate below, which keeps a bounded number
 * in flight, waits out the transient refusal, and reports anything else as "no result"
 * rather than throwing — the tools here are all best-effort embellishment on a file.
 */

/** Comfortably under any per-user process limit, and still enough to keep a scan brisk. */
export const MAX_IN_FLIGHT = 24;

/** EAGAIN says the process table is full *right now*, so the same command is worth retrying. */
const RETRY_DELAYS_MS = [10, 25, 60, 150, 300];

const TRANSIENT = new Set(["EAGAIN", "EMFILE", "ENFILE"]);

let inFlight = 0;
const waiting: Array<() => void> = [];

/** How many commands are running right now. Exported for the test that pins the cap. */
export function inFlightCount(): number {
  return inFlight;
}

async function acquire(): Promise<void> {
  if (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((resolve) => waiting.push(resolve));
  inFlight++;
}

function release(): void {
  inFlight--;
  waiting.shift()?.();
}

function isTransient(error: unknown): boolean {
  const code: unknown = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && TRANSIENT.has(code);
}

/** What a command left behind: how it exited, and what it wrote to stdout. */
export interface Capture {
  readonly exitCode: number;
  readonly stdout: string;
}

/**
 * Run `command`, optionally feeding it `stdin`, and collect its stdout. Returns null when
 * the command could not be started at all — a missing tool, or a process table that stayed
 * full through every retry — so a caller can treat it exactly like a tool that said nothing.
 */
export async function capture(
  command: readonly string[],
  stdin?: Uint8Array,
): Promise<Capture | null> {
  await acquire();
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const proc = Bun.spawn([...command], {
          stdin: stdin ?? "ignore",
          stdout: "pipe",
          stderr: "ignore",
        });
        const [exitCode, stdout] = await Promise.all([
          proc.exited,
          new Response(proc.stdout).text(),
        ]);
        return { exitCode, stdout };
      } catch (error) {
        const delay = RETRY_DELAYS_MS[attempt];
        if (delay === undefined || !isTransient(error)) return null;
        await Bun.sleep(delay);
      }
    }
  } finally {
    release();
  }
}

/**
 * Run `command` for its effect alone. Returns its exit code, or null if it never ran —
 * which callers should read as failure, not as success with nothing to say.
 */
export async function run(command: readonly string[]): Promise<number | null> {
  const result = await capture(command);
  return result === null ? null : result.exitCode;
}
