import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { outletSlug, playFeedbackGate, resolvePlayFeedbackCard, validatePlayFeedback } from "./play-feedback.ts";

const valid = {
  round: 1, excerpt_index: 0, device_id: "550e8400-e29b-41d4-a716-446655440000",
  reason: "different_lean", suggested_lean: "center", note: "  A short note.  ", website: ""
};

test("feedback validates enum, index, note length, honeypot and unknown keys", () => {
  assert.equal(validatePlayFeedback(valid)?.note, "A short note.");
  for (const change of [
    { reason: "unlisted" }, { excerpt_index: 3 }, { note: "x".repeat(281) },
    { website: "bot" }, { extra: "private" }, { suggested_lean: "purple" }
  ]) assert.equal(validatePlayFeedback({ ...valid, ...change }), null);
  assert.equal(validatePlayFeedback({ ...valid, reason: "other", suggested_lean: null })?.reason, "other");
});

test("feedback duplicate and per-device rate gates", () => {
  assert.equal(playFeedbackGate(true, 0), "duplicate");
  assert.equal(playFeedbackGate(false, 12), "rate_limited");
  assert.equal(playFeedbackGate(false, 11), "allowed");
});

test("server derives outlet and rating and enforces known reviewed round", () => {
  const route = readFileSync("app/api/play-feedback/route.ts", "utf8");
  assert.match(route, /loadPlaySchedule\(\)/);
  const rounds = [{ round: 1, reviewed_by_human: true, cards: [{ outlet: "The Example Press", biasLabel: "left" as const }] }];
  assert.equal(resolvePlayFeedbackCard(rounds, 1, 0)?.outlet, "The Example Press");
  assert.equal(resolvePlayFeedbackCard(rounds, 2, 0), null);
  assert.equal(resolvePlayFeedbackCard(rounds, 1, 1), null);
  assert.equal(resolvePlayFeedbackCard([{ ...rounds[0], reviewed_by_human: false }], 1, 0), null);
  assert.match(route, /if \(!card/);
  assert.match(route, /outletSlug\(card\.outlet\)/);
  assert.match(route, /card\.biasLabel/);
  assert.equal(outletSlug("The Example Press"), "the-example-press");
});

test("feedback sheet uses accessible modal with focus trap and Escape", () => {
  const sheet = readFileSync("app/play/play-feedback-sheet.tsx", "utf8");
  const modal = readFileSync("components/modal.tsx", "utf8");
  assert.match(sheet, /<Modal labelId=/);
  assert.match(sheet, /onDismiss=\{onClose\}/);
  assert.match(modal, /event\.key === "Escape"/);
  assert.match(modal, /event\.key !== "Tab"/);
  assert.match(modal, /previous\?\.focus\(\)/);
});
