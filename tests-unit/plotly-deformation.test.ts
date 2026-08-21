import assert from "node:assert/strict";
import test from "node:test";
import { buildAnimatedTraceCoordinates } from "../src/lib/plotly_deformation.ts";

test("element inspection metadata is not interpreted as imaginary displacement", () => {
  const metadataRow = (x: number, elementId: number) => [
    x, 0, 0, 0, 15, 0,
    elementId, 15, 0, 0, 0, 250, 1.5, "i", "ok",
  ];
  const trace = {
    meta: { displacementEncoding: "base-delta-real" },
    customdata: [
      metadataRow(0, 318), metadataRow(5000, 318), Array(15).fill(null),
      metadataRow(5000, 319), metadataRow(10000, 319), Array(15).fill(null),
    ],
  };

  const coordinates = buildAnimatedTraceCoordinates(trace, 0, 1, 233.33);

  assert.equal(coordinates.x[1], 5000);
  assert.equal(coordinates.x[3], 5000);
  assert.equal(coordinates.x[1], coordinates.x[3]);
});

test("node markers animate from dedicated geometry instead of hover metadata", () => {
  const trace = {
    meta: {
      displacementEncoding: "base-delta-real",
      deformationCoordinates: [[5000, 1200, 800, -10, 140, 100]],
    },
    customdata: [[46, 175.874, -9.6803, 143.863, 100.704, -0.588476, 0.059712, -0.10082]],
  };

  const coordinates = buildAnimatedTraceCoordinates(trace, 1, 0, 2);

  assert.deepEqual(coordinates, { x: [4980], y: [1480], z: [1000] });
});

test("explicit complex displacement encoding still uses imaginary components", () => {
  const trace = {
    meta: { displacementEncoding: "complex-re-im" },
    customdata: [[100, 200, 300, 1, 2, 3, 4, 5, 6]],
  };

  const coordinates = buildAnimatedTraceCoordinates(trace, 0, 1, 10);

  assert.deepEqual(coordinates, { x: [60], y: [150], z: [240] });
});
