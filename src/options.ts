import type { Order } from "./metadata";

/** Everything the app needs to know before it starts. */
export interface Options {
  /** Absolute path of the folder being triaged. */
  readonly folder: string;
  readonly order: Order;
  /** Preferred port. The server moves to the next free one if this is taken. */
  readonly port: number;
}
