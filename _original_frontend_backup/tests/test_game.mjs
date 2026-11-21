// Scoring logic tests. Run with:  node tests/test_game.mjs
import assert from "node:assert/strict";
import { summarize, winnerMessage, roundSummary, formatScore } from "../static/js/game.js";

const R = (h, a) => ({ humanCorrect: h, aiCorrect: a });

// 8 vs 7: human wins
let s = summarize([R(true,true),R(true,true),R(true,true),R(true,true),R(true,true),R(true,true),R(true,false),R(true,false),R(false,true),R(false,false)]);
assert.equal(s.human, 8); assert.equal(s.ai, 7); assert.equal(s.winner, "human");
assert.equal(s.both, 6); assert.equal(s.onlyHuman, 2); assert.equal(s.onlyAI, 1); assert.equal(s.neither, 1);
assert.equal(s.humanAcc, 80); assert.equal(s.aiAcc, 70);
assert.match(winnerMessage(s), /Human/);

// tie
s = summarize([R(true,false), R(false,true)]);
assert.equal(s.winner, "tie"); assert.match(winnerMessage(s), /tie/);

// AI wins
s = summarize([R(false,true), R(false,true), R(true,true)]);
assert.equal(s.winner, "ai"); assert.equal(s.aiAcc, 100); assert.equal(s.humanAcc, 33);

// empty
s = summarize([]);
assert.equal(s.total, 0); assert.equal(s.winner, "tie"); assert.equal(s.humanAcc, 0);

assert.equal(roundSummary(true, true), "You both read it correctly.");
assert.equal(formatScore(0.123456), "0.123");
console.log("game.js: all scoring tests passed");
