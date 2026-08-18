import assert from "node:assert/strict";
import { resolveLessonVideoPlatform } from "../src/lib/video-platforms.ts";

assert.equal(
  resolveLessonVideoPlatform(["VOOV"], ["ZOOM", "VOOV"], "ZOOM"),
  "VOOV",
  "an incompatible cached ZOOM fallback must not override a student's VOOV-only preference"
);
assert.equal(
  resolveLessonVideoPlatform(["ZOOM"], ["ZOOM", "VOOV"], "VOOV"),
  "ZOOM",
  "an incompatible cached VOOV value must not override a student's ZOOM-only preference"
);
assert.equal(
  resolveLessonVideoPlatform(["VOOV", "ZOOM"], ["ZOOM", "VOOV"], "ZOOM"),
  "ZOOM",
  "a stored platform should be preserved when both student and teacher support it"
);
assert.equal(
  resolveLessonVideoPlatform(["VOOV", "ZOOM"], ["ZOOM", "VOOV"]),
  "VOOV",
  "without a stored choice, the student's preference order should be used"
);

console.log("Video platform resolution checks passed.");
