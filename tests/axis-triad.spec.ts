import { expect, test } from "@playwright/test";

const structure = {
  nodes: [
    { id: 1, coords: [0, 0, 0] },
    { id: 2, coords: [5, 0, 0] },
  ],
  elements: [{ id: 1, node_ids: [1, 2], material_id: 1, section_id: 1 }],
  materials: [{ id: 1, name: "Acero", E: 210e9, nu: 0.3, rho: 7850 }],
  sections: [{ id: 1, name: "Perfil", area: 0.01, Iz: 1e-4, Iy: 1e-4, J: 2e-4 }],
  restraints: {},
  loads: [],
};

const visualization = {
  data: [
    {
      type: "scatter3d",
      x: [0, 5],
      y: [0, 0],
      z: [0, 0],
      mode: "lines",
      line: { color: "#3b82f6", width: 6 },
    },
  ],
  layout: {
    scene: {
      xaxis: { range: [-1, 6] },
      yaxis: { range: [-1, 1] },
      zaxis: { range: [-1, 1] },
      camera: {
        eye: { x: 1.25, y: 1.25, z: 1.25 },
        center: { x: 0, y: 0, z: 0 },
        up: { x: 0, y: 0, z: 1 },
      },
    },
    margin: { l: 0, r: 0, b: 0, t: 0 },
  },
};

test("el indicador XYZ aparece, sigue la cámara y puede reubicarse", async ({ page }) => {
  await page.addInitScript((data) => {
    window.localStorage.setItem("fem_structure_data", JSON.stringify(data));
  }, structure);
  await page.route("**/api/visualization/**", (route) =>
    route.fulfill({ json: visualization }),
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Visualizar" }).click();
  await page.waitForSelector(".js-plotly-plot");

  const graph = page.locator("[data-graphics-view]");
  const triad = page.getByTestId("axis-triad");
  await expect(triad).toBeVisible();
  await expect(triad).toContainText("X");
  await expect(triad).toContainText("Y");
  await expect(triad).toContainText("Z");

  const graphBox = await graph.boundingBox();
  const initialBox = await triad.boundingBox();
  expect(graphBox).not.toBeNull();
  expect(initialBox).not.toBeNull();
  expect(initialBox!.x).toBeLessThan(graphBox!.x + graphBox!.width * 0.25);
  expect(initialBox!.y).toBeGreaterThan(graphBox!.y + graphBox!.height * 0.55);

  // Deja que se aplique la cámara inicial programada por GraphicsView antes
  // de simular el primer movimiento continuo.
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const xAxis = triad.locator('[data-axis="x"] line');
  const directionBefore = await xAxis.evaluate((line) => ({
    x2: line.getAttribute("x2"),
    y2: line.getAttribute("y2"),
  }));

  await page.evaluate(() => {
    const plot = document.querySelector(".js-plotly-plot") as any;
    plot.emit("plotly_relayouting", {
      "scene.camera": {
        eye: { x: -1.4, y: 1.2, z: 0.9 },
        center: { x: 0, y: 0, z: 0 },
        up: { x: 0, y: 0, z: 1 },
      },
    });
  });
  await expect.poll(async () =>
    xAxis.evaluate((line) => ({
      x2: line.getAttribute("x2"),
      y2: line.getAttribute("y2"),
    })),
  ).not.toEqual(directionBefore);

  const target = {
    x: graphBox!.x + graphBox!.width * 0.68,
    y: graphBox!.y + graphBox!.height * 0.35,
  };
  await triad.dragTo(graph, { targetPosition: {
    x: target.x - graphBox!.x,
    y: target.y - graphBox!.y,
  } });

  const movedBox = await triad.boundingBox();
  expect(movedBox).not.toBeNull();
  expect(Math.abs(movedBox!.x + movedBox!.width / 2 - target.x)).toBeLessThan(8);
  expect(Math.abs(movedBox!.y + movedBox!.height / 2 - target.y)).toBeLessThan(8);

  await page.getByTitle("Ocultar ejes").click();
  await expect(triad).toBeVisible();
  await page.getByTitle("Ocultar indicador XYZ").click();
  await expect(triad).toBeHidden();
  await page.getByTitle("Mostrar indicador XYZ").click();
  await expect(triad).toBeVisible();
});
