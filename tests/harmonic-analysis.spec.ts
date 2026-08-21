import { test, expect } from '@playwright/test';

const mockStructure = {
  nodes: [
    { id: 1, coords: [0, 0, 0] },
    { id: 2, coords: [5, 0, 0] },
  ],
  elements: [{ id: 1, node_ids: [1, 2], material_id: 1, section_id: 1 }],
  materials: [{ id: 1, name: 'Acero A36', E: 210e9, nu: 0.3, rho: 7850 }],
  sections: [{ id: 1, name: 'Perfil IPE 200', area: 0.01, Iz: 1e-4, Iy: 1e-4, J: 2e-4 }],
  restraints: { 1: ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'] },
  loads: [{ id: 1, name: 'Carga P', node_id: 2, fx: 0, fy: 1000, fz: 0, mx: 0, my: 0, mz: 0 }],
};

test('harmonic response route renders frequency response', async ({ page }) => {
  await page.addInitScript((data) => {
    window.localStorage.setItem('fem_structure_data', JSON.stringify(data));
  }, mockStructure);

  await page.route('**/api/analysis/harmonic', async route => {
    await route.fulfill({
      json: {
        frequencies_sweep: [1, 5, 10],
        response_amplitudes: { '2': [0.001, 0.015, 0.004] },
        peak_node_id: 2,
        peak_frequency: 5,
        peak_amplitude: 0.015,
        node_displacement_components: {
          '2': {
            ux_real_m: [0, 0, 0], ux_imag_m: [0, 0, 0],
            uy_real_m: [0.001, 0.015, 0.004], uy_imag_m: [0, 0.002, 0],
            uz_real_m: [0, 0, 0], uz_imag_m: [0, 0, 0],
          },
        },
        node_response_series: {
          '2': {
            displacement_m: [0.001, 0.015, 0.004],
            velocity_m_s: [0.006, 0.471, 0.251],
            acceleration_m_s2: [0.039, 14.804, 15.791],
            stress_pa: [120000, 2500000, 900000],
          },
        },
        node_peak_summary: {
          '2': {
            frequency_hz: 5,
            displacement_m: 0.015,
            velocity_m_s: 0.471,
            acceleration_m_s2: 14.804,
            stress_pa: 2500000,
            stress_peak_pa: 2500000,
            stress_peak_frequency_hz: 5,
          },
        },
      }
    });
  });

  await page.goto('http://localhost:4321/analisis-armonico');
  await expect(page.getByRole('heading', { name: /Harmonic Response/i })).toBeVisible();
  await expect(page.getByLabel('Amortiguamiento estructural (%)')).toHaveValue('4');
  await page.getByLabel('Fuerza por desbalance').check();
  await expect(page.getByLabel('Masa desbalanceada m (kg)')).toHaveValue('0.029');
  await expect(page.getByLabel('Excentricidad e (m)')).toHaveValue('0.0508');
  await expect(page.getByLabel('Plano de giro de la masa')).toHaveValue('yz');
  await expect(page.getByText(/Fy = m·e·ω²·cos\(ωt\)/)).toBeVisible();
  await page.getByLabel('Fuerza por desbalance').uncheck();
  await page.getByRole('button', { name: /solve/i }).click();
  await expect(page.getByText('Critical Response')).toBeVisible();
  await expect(page.getByText('Peak @ 5.00 Hz')).toBeVisible();
  await expect(page.getByText(/1\.500e\+1 mm/).first()).toBeVisible();
  await expect(page.getByText(/2.50 MPa/).first()).toBeVisible();
  await expect(page.getByText(/v 4\.710e\+2 mm\/s/i)).toBeVisible();
  await expect(page.getByText(/a 1\.480e\+1 m\/s² \(1\.51 g\)/i)).toBeVisible();
  await expect(page.getByText(/Unidades industriales: desplazamiento mm/i)).toBeVisible();

  const plot = page.locator('.js-plotly-plot').first();
  const readSceneFraming = () => plot.evaluate((el: any) => {
    // WebGL puede devolver diferencias IEEE-754 irrelevantes después de relayout
    // (p. ej. 0.3 vs 0.30000000000000004).
    const round = (value: number) => Number(Number(value).toFixed(9));
    const vector = (value: any) => ({ x: round(value.x), y: round(value.y), z: round(value.z) });
    return {
      xRange: el._fullLayout?.scene?.xaxis?.range.map(round),
      yRange: el._fullLayout?.scene?.yaxis?.range.map(round),
      zRange: el._fullLayout?.scene?.zaxis?.range.map(round),
      aspectratio: vector(el._fullLayout?.scene?.aspectratio),
      eye: vector(el._fullLayout?.scene?.camera?.eye),
    };
  });
  await expect.poll(async () => plot.evaluate((el: any) => ({
    aspectmode: el._fullLayout?.scene?.aspectmode,
    projection: el._fullLayout?.scene?.camera?.projection?.type,
    eye: el._fullLayout?.scene?.camera?.eye,
  }))).toEqual({
    aspectmode: 'manual',
    projection: 'orthographic',
    // La referencia sin deformar mide 5 m solo en X. La respuesta amplificada
    // en Y no debe reorientar la cámara ni alterar la proporción aparente.
    eye: { x: 0.45, y: 0.855, z: 0.855 },
  });
  await expect(page.getByRole('button', { name: /^Movimiento$/ })).toBeVisible();
  await expect(page.getByText(/Frecuencia animada/i)).toBeVisible();

  const animationTrace = await plot.evaluate((el: any) => el.data.find((trace: any) =>
    trace.type === 'scatter3d' &&
    String(trace.name).startsWith('Deformada') &&
    Array.isArray(trace.customdata)
  ));
  expect(animationTrace).toBeTruthy();
  expect(animationTrace.customdata.some((row: any[]) => Array.isArray(row) && row.length >= 6)).toBeTruthy();

  await page.getByRole('button', { name: /^Vel$/ }).click();
  await expect.poll(async () => plot.evaluate((el: any) =>
    el.data.find((trace: any) => trace.type === 'scatter3d' && trace.name === 'Nodos deformados')?.marker?.color
  )).toEqual([0, 471]);
  await page.getByRole('button', { name: /^Desp$/ }).click();

  await expect(page.getByText(/^Escala deformada$/)).toBeVisible();
  const scaleBefore = Number(await page.getByLabel('Escala visual de deformada').inputValue());
  expect(scaleBefore).toBeGreaterThan(100);
  await page.getByLabel('Aumentar escala de deformada').click();
  await expect.poll(async () => Number(await page.getByLabel('Escala visual de deformada').inputValue())).toBeGreaterThan(scaleBefore);

  // Zoom REAL con la rueda (no un relayout programático) antes de cambiar
  // etiquetas/frecuencia. Esa cámara debe sobrevivir a cualquier render.
  const eyeBeforeManualZoom = await plot.evaluate((el: any) => el._fullLayout?.scene?.camera?.eye);
  await plot.hover({ position: { x: 420, y: 320 } });
  await page.mouse.wheel(0, -650);
  await expect.poll(async () => plot.evaluate((el: any) => el._fullLayout?.scene?.camera?.eye))
    .not.toEqual(eyeBeforeManualZoom);

  const lockedFraming = await readSceneFraming();

  await page.getByRole('button', { name: /Etiquetas en puntos de medición/i }).click();
  await expect.poll(readSceneFraming).toEqual(lockedFraming);

  const freqCard = page
    .getByText(/^Frecuencia animada$/)
    .locator('xpath=ancestor::div[contains(@class,"premium-card-inner")][1]');
  const slider = freqCard.locator('input[type="range"]');
  await expect(slider).toHaveValue('1');
  await expect(freqCard.getByText(/5\.000 Hz/)).toBeVisible();
  const frequencyVizResponse = page.waitForResponse((response) =>
    response.url().includes('/api/visualization/harmonic-results')
      && response.url().includes('frequency_hz=10')
      && response.ok()
  );
  await slider.fill('2');
  await frequencyVizResponse;
  await expect(freqCard.getByText(/10\.000 Hz/)).toBeVisible();
  await expect.poll(readSceneFraming).toEqual(lockedFraming);

  // Simula quitar la última "Deformada" desde la leyenda. El encuadre manual
  // debe permanecer byte a byte igual aunque ya no haya respuesta visible.
  await plot.evaluate(async (el: any) => {
    const traceIndex = el.data.findIndex((trace: any) => String(trace.name).startsWith('Deformada'));
    await (window as any).Plotly.restyle(el, { visible: 'legendonly' }, [traceIndex]);
  });
  await expect.poll(readSceneFraming).toEqual(lockedFraming);

  await page.getByRole('button', { name: /^Espectro$/ }).click();
  await expect.poll(async () => plot.evaluate((el: any) => el.layout?.title?.text)).toContain('Desplazamiento |u| (mm)');

  // Todo el panel lateral debe ser una única región desplazable. Antes, solo
  // la lista final de picos tenía overflow y los controles inferiores quedaban
  // recortados cuando la configuración superior ocupaba más que el viewport.
  const harmonicSidebar = page.getByRole('complementary', { name: /Controles de respuesta armónica/i });
  await expect.poll(async () => harmonicSidebar.evaluate((element) =>
    element.scrollHeight > element.clientHeight
  )).toBe(true);
  await harmonicSidebar.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  await expect.poll(async () => harmonicSidebar.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(page.getByText(/^Escala logarítmica$/i)).toBeVisible();

  await page.getByRole('button', { name: /^Vel$/ }).click();
  await expect.poll(async () => plot.evaluate((el: any) => el.data[0].y)).toEqual([6, 471, 251]);

  await page.getByRole('button', { name: /^σ alt$/ }).click();
  await expect.poll(async () => plot.evaluate((el: any) => el.data[0].y)).toEqual([0.12, 2.5, 0.9]);

  await page.getByRole('button', { name: /Medición por frecuencia/i }).click();
  await expect(page.getByRole('dialog', { name: /Medición armónica por frecuencia/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Resultados @ 10\.000 Hz/i })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Respuesta en Velocidad/i })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Velocidad RMS/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Nodo 2/i })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: /^Nodo 1$/i }).click();
  await expect(page.getByRole('button', { name: /P2 · Nodo 1/i })).toHaveAttribute('aria-pressed', 'true');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Exportar Excel/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^respuesta_armonica_nodos_\d{4}-\d{2}-\d{2}\.xls$/);

  await page.getByRole('button', { name: /Cerrar tabla de medición/i }).click();
  await page.getByRole('button', { name: /^Movimiento$/ }).click();
  await expect.poll(async () => plot.evaluate((el: any) => {
    const trace = el.data.find((candidate: any) => candidate.name === 'Nodos de medición');
    return {
      type: trace?.type,
      nodeIds: [...new Set(trace?.customdata ?? [])],
      vertexCount: trace?.x?.length,
      triangleCount: trace?.i?.length,
    };
  })).toEqual({
    type: 'mesh3d',
    nodeIds: [2, 1],
    vertexCount: 16,
    triangleCount: 24,
  });
});
