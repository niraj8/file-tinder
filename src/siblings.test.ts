import { describe, expect, test } from "bun:test";
import { stemOf, siblingsOf } from "./siblings";

describe("stemOf", () => {
  test("strips the extension", () => expect(stemOf("report.pdf")).toBe(stemOf("report.txt")));
  test("strips a trailing (n) revision marker", () =>
    expect(stemOf("Assessment (1).md")).toBe(stemOf("Assessment.md")));
  test("strips a trailing _filled", () =>
    expect(stemOf("Form67_IncomeDetails_filled.csv")).toBe(stemOf("Form67_IncomeDetails.csv")));
  test("ignores case and punctuation", () =>
    expect(stemOf("My Report-Final.pdf")).toBe(stemOf("my_report_final.PDF")));
  test("distinguishes genuinely different names", () =>
    expect(stemOf("taxpnl-Q1.xlsx")).not.toBe(stemOf("Appraisal Letter.pdf")));
  test("does not collapse names that only share a short prefix", () =>
    expect(stemOf("Acct_Statement_XXXXXXXX5923_15082026.qif"))
      .not.toBe(stemOf("Acct_Statement_XXXXXXXX9924_15082026.qif")));
});

const named = (...names: string[]) => names.map((name) => ({ name, size: 1 }));

describe("siblingsOf", () => {
  test("pairs the same photo in two formats", () => {
    const files = named("IMG_2534.HEIC", "IMG_2534.jpeg", "IMG_2535.HEIC");
    expect(siblingsOf(files[0]!, files).map((f) => f.name)).toEqual(["IMG_2534.jpeg"]);
  });

  test("pairs a filled form with its blank", () => {
    const files = named("Form67_IncomeDetails.csv", "Form67_IncomeDetails_filled.csv");
    expect(siblingsOf(files[1]!, files).map((f) => f.name)).toEqual(["Form67_IncomeDetails.csv"]);
  });

  test("pairs a (1) revision with the original", () => {
    const files = named("Final Aptitude Assessment - 15-19.md",
                        "Final Aptitude Assessment - 15-19 (1).md");
    expect(siblingsOf(files[0]!, files)).toHaveLength(1);
  });

  test("never reports a file as its own sibling", () => {
    const files = named("solo.pdf");
    expect(siblingsOf(files[0]!, files)).toEqual([]);
  });

  test("returns nothing when names are unrelated", () => {
    const files = named("Aug-26.pdf", "vedana_4_stages.mp4");
    expect(siblingsOf(files[0]!, files)).toEqual([]);
  });

  test("does not pair two different bank statements", () => {
    const files = named("Acct_Statement_XXXXXXXX5923_15082026.qif",
                        "Acct_Statement_XXXXXXXX9924_15082026.qif");
    expect(siblingsOf(files[0]!, files)).toEqual([]);
  });
});

describe("stem truncation", () => {
  test("pairs the same book in two formats despite divergent long tails", () => {
    const files = named(
      "ADHD 2_0_ New Science and Essential Strategies for Thriving -- M_D_ Edward M_ Hallowell -- 2021 -- Random House -- 4fd6b05f.azw3",
      "ADHD 2_ 0_ New Science and Essential Strategies for Thriving -- Edward M_ Hallowell -- 2021 First edition -- isbn13 9780399178733.epub",
    );
    expect(siblingsOf(files[0]!, files)).toHaveLength(1);
  });

  test("truncation does not collide two long but distinct names", () => {
    const files = named(
      "Screenshot 2026-08-21 at 10.03.29 PM.png",
      "Screenshot 2026-08-18 at 5.28.00 PM.PNG",
    );
    expect(siblingsOf(files[0]!, files)).toEqual([]);
  });
});
