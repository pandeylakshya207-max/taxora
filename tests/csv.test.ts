import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../src/lib/recon/csv";

test("parses quoted fields, escaped quotes, commas and line breaks inside quotes", () => {
  const text = '﻿GSTIN,Name,Amount\r\n08ABCDE1234F1Z0,"Sharma, Gupta & Co","1,24,500.00"\r\nX,"He said ""hi""","line1\nline2"\n';
  assert.deepEqual(parseCsv(text), [
    ["GSTIN", "Name", "Amount"],
    ["08ABCDE1234F1Z0", "Sharma, Gupta & Co", "1,24,500.00"],
    ["X", 'He said "hi"', "line1\nline2"],
  ]);
});

test("detects semicolon and tab delimiters", () => {
  assert.deepEqual(parseCsv("a;b;c\n1;2;3"), [["a", "b", "c"], ["1", "2", "3"]]);
  assert.deepEqual(parseCsv("a\tb\n1\t2"), [["a", "b"], ["1", "2"]]);
});

test("keeps empty cells and trailing empty fields", () => {
  assert.deepEqual(parseCsv("a,,c,\n"), [["a", "", "c", ""]]);
});

test("rejects a file with an unclosed quote instead of guessing", () => {
  assert.throws(() => parseCsv('a,"b\n1,2'), /unclosed quote/);
});
