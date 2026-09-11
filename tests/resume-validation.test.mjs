import assert from "node:assert/strict";
import test from "node:test";
import { validateOptimizedResume } from "../server/resume-validation.js";
import { AppError } from "../server/errors.js";

const facts = { sourceBlocks: [{ id: "p1-b1", text: "负责用户访谈" }] };
const resume = { summary: "访谈经验", targetRole: "产品助理", sections: [{ heading: "经历", entries: [{ title: "实习", organization: "", dates: "", bullets: ["负责用户访谈"], sourceIds: ["p1-b1"] }] }] };
const validate = (value) => validateOptimizedResume(value, facts, "openai", "server-model");
const failure = (error) => error instanceof AppError && error.status === 502 && error.code === "provider_failed";

test("validation projects only approved fields and uses server provider/model", () => {
  const value = structuredClone(resume);
  Object.assign(value, { provider: "qwen", model: "forged", apiKey: "discard-me" });
  value.sections[0].extra = "discard-me";
  value.sections[0].entries[0].extra = "discard-me";
  assert.deepEqual(validate(value), { ...resume, provider: "openai", model: "server-model" });
});

for (const [label, mutate] of [
  ["null", () => null], ["array root", () => []],
  ["missing summary", (v) => { delete v.summary; }], ["long summary", (v) => { v.summary = "字".repeat(1001); }],
  ["empty role", (v) => { v.targetRole = " "; }], ["long role", (v) => { v.targetRole = "字".repeat(201); }],
  ["empty sections", (v) => { v.sections = []; }], ["object sections", (v) => { v.sections = {}; }],
  ["too many sections", (v) => { v.sections = Array(9).fill(v.sections[0]); }],
  ["null section", (v) => { v.sections = [null]; }],
  ["empty entries", (v) => { v.sections[0].entries = []; }], ["object entries", (v) => { v.sections[0].entries = {}; }],
  ["too many entries", (v) => { v.sections[0].entries = Array(21).fill(v.sections[0].entries[0]); }],
  ["null entry", (v) => { v.sections[0].entries = [null]; }],
  ["empty bullets", (v) => { v.sections[0].entries[0].bullets = []; }],
  ["object bullets", (v) => { v.sections[0].entries[0].bullets = {}; }],
  ["blank bullet", (v) => { v.sections[0].entries[0].bullets = [" "]; }],
  ["non-string bullet", (v) => { v.sections[0].entries[0].bullets = [1]; }],
  ["long bullet", (v) => { v.sections[0].entries[0].bullets = ["字".repeat(501)]; }],
  ["too many bullets", (v) => { v.sections[0].entries[0].bullets = Array(9).fill("经历"); }],
  ["missing sourceIds", (v) => { delete v.sections[0].entries[0].sourceIds; }],
  ["empty sourceIds", (v) => { v.sections[0].entries[0].sourceIds = []; }],
  ["non-array sourceIds", (v) => { v.sections[0].entries[0].sourceIds = "p1-b1"; }],
  ["unknown source ID", (v) => { v.sections[0].entries[0].sourceIds = ["unknown"]; }],
  ["mixed valid and unknown IDs", (v) => { v.sections[0].entries[0].sourceIds = ["p1-b1", "unknown"]; }],
  ...["heading", "title", "organization", "dates"].flatMap((field) => [
    [`long ${field}`, (v) => { (field === "heading" ? v.sections[0] : v.sections[0].entries[0])[field] = "字".repeat(201); }],
    [`non-string ${field}`, (v) => { (field === "heading" ? v.sections[0] : v.sections[0].entries[0])[field] = {}; }],
  ]),
]) {
  test(`rejects ${label}`, () => {
    const value = structuredClone(resume);
    const replacement = mutate(value);
    assert.throws(() => validate(replacement === undefined ? value : replacement), failure);
  });
}

test("accepts inclusive string and array limits, preserving text without HTML interpretation", () => {
  const value = structuredClone(resume);
  value.summary = "字".repeat(1000);
  value.targetRole = "字".repeat(200);
  const entry = value.sections[0].entries[0];
  for (const field of ["title", "organization", "dates"]) entry[field] = "字".repeat(200);
  entry.bullets = ["<script>alert('plain text')</script>", ...Array(7).fill("字".repeat(500))];
  value.sections[0].heading = "字".repeat(200);
  value.sections[0].entries = Array(20).fill(entry);
  value.sections = Array(8).fill(value.sections[0]);
  assert.deepEqual(validate(value), { ...value, provider: "openai", model: "server-model" });
});
