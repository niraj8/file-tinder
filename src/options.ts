import type { Order } from "./metadata";

/** Everything the app needs to know before it starts. */
export interface Options {
  /**
   * Absolute paths of the folders being triaged, in the order they were given and with
   * duplicates removed. Always at least one. They form a single queue: the folder a file
   * came from is a fact about it, not a section it lives in.
   */
  readonly folders: readonly string[];
  readonly order: Order;
  /** Preferred port. The server moves to the next free one if this is taken. */
  readonly port: number;
}
