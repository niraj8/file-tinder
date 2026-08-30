/**
 * `@types/bun` maps every `*.html` import to `HTMLBundle`, its fullstack dev-server
 * type. We import the app shell with `type: "text"` instead, which yields a string;
 * TypeScript does not narrow by import attribute yet, so say so here. The longer
 * suffix wins over the `*.html` wildcard.
 */
declare module "*/public/index.html" {
  const contents: string;
  export default contents;
}
