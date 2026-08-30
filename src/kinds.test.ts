import { describe, expect, test } from "bun:test";
import { extensionOf, kindOf, contentTypeFor, type Kind } from "./kinds";

describe("extensionOf", () => {
  test("lowercases", () => expect(extensionOf("IMG_2534.HEIC")).toBe("heic"));
  test("takes the last segment", () => expect(extensionOf("a.tar.gz")).toBe("gz"));
  test("empty when there is no dot", () => expect(extensionOf("Makefile")).toBe(""));
  test("empty for a dotfile with no extension", () => expect(extensionOf(".zshrc")).toBe(""));
  test("handles dots in the stem", () =>
    expect(extensionOf("Amelie.2001.BRRip.x264-VLiS-en.srt")).toBe("srt"));
});

describe("kindOf", () => {
  const cases: [string, Kind][] = [
    ["IMG_2535.jpeg", "image"],
    ["Screenshot 2026-08-18 at 5.28.00 PM.PNG", "image"],
    ["IMG_2534.HEIC", "heic"],
    ["vedana_4_stages.mp4", "video"],
    ["track.m4a", "audio"],
    ["Aug-26.pdf", "pdf"],
    ["Form67_IncomeDetails.csv", "text"],
    ["Amelie-en.srt", "text"],
    ["Acct_Statement_XXXX.qif", "text"],
    ["equalizer-the-tt0455944-en-vrgvm.zip", "archive"],
    ["Cursor-darwin-arm64.dmg", "opaque"],
    ["Cold_Turkey_Mac_Installer.pkg", "opaque"],
    ["book.epub", "opaque"],
    ["Re June Work log Approval.eml", "opaque"],
    ["Makefile", "opaque"],
  ];
  test.each(cases)("%s is %s", (name, kind) => expect(kindOf(name)).toBe(kind));

  test("heic is separated from image because Chrome cannot render it", () => {
    expect(kindOf("a.heic")).not.toBe("image");
  });
});

describe("contentTypeFor", () => {
  test("serves markdown as plain text so the browser renders it inline", () => {
    expect(contentTypeFor("notes.md")).toBe("text/plain; charset=utf-8");
  });
  test.each(["a.srt", "a.qif", "a.csv", "a.log"])("%s is inline plain text", (n) => {
    expect(contentTypeFor(n)).toBe("text/plain; charset=utf-8");
  });
  test("keeps real types for real media", () => {
    expect(contentTypeFor("a.pdf")).toBe("application/pdf");
    expect(contentTypeFor("a.jpeg")).toBe("image/jpeg");
    expect(contentTypeFor("a.mp4")).toBe("video/mp4");
  });
  test("falls back to octet-stream", () => {
    expect(contentTypeFor("a.wat")).toBe("application/octet-stream");
  });
});
