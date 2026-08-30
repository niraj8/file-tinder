import { homedir } from "node:os";
import { resolve } from "node:path";
import type { Order } from "./metadata";
import type { Options } from "./options";

export type { Options };

type MutableOptions = { -readonly [K in keyof Options]: Options[K] };

const ORDERS: readonly string[] = ["size", "mtime", "name"];
const DEFAULT_PORT = 8777;

/** Help text, printed for --help and after a bad argument. */
export const USAGE = `file-tinder — swipe through the loose files in a folder.

  bun run index.ts [folder...] [--order size|mtime|name] [--port N]

  folder   one or more, defaults to ~/Downloads. Several folders make one queue,
           so let the shell expand a glob: ~/Downloads/Images/2026-*
  --order  size (largest first, default), mtime (oldest first), name
  --port   defaults to ${DEFAULT_PORT}

Keys: <- trash   -> keep   r rename   o open   u undo`;

/** Turn command-line arguments into the options the server runs with. */
export function parseArgs(argv: readonly string[]): Options {
  const options: MutableOptions = { folders: [], order: "size", port: DEFAULT_PORT };
  const folders: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const [flag, inlineValue] = arg.startsWith("--") && arg.includes("=")
      ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)]
      : [arg, null];
    const nextValue = () => inlineValue ?? argv[++i] ?? "";

    if (flag === "--order") {
      const value = nextValue();
      if (!ORDERS.includes(value)) {
        throw new Error(`unknown --order ${value || "(missing)"}; expected ${ORDERS.join(", ")}`);
      }
      options.order = value as Order;
    } else if (flag === "--port") {
      const value = Number(nextValue());
      if (!Number.isInteger(value) || value < 0 || value > 65535) {
        throw new Error(`invalid --port; expected a number between 0 and 65535`);
      }
      options.port = value;
    } else if (flag.startsWith("--")) {
      throw new Error(`unknown option ${flag}`);
    } else {
      folders.push(arg);
    }
  }

  const raw = folders.length > 0 ? folders : [`${homedir()}/Downloads`];
  const absolute = raw.map((path) =>
    resolve(path.startsWith("~") ? homedir() + path.slice(1) : path));
  // A glob can name the same folder twice, and scanning it twice would deal every file
  // in it as two cards.
  options.folders = [...new Set(absolute)];
  return options;
}
