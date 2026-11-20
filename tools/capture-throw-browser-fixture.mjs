import assert from "node:assert/strict";

/** Drive real pointer input; this never calls a capture planner or a store action. */
export async function selectCaptureBall({ page, evalArgs, waitArgs, ballId }) {
  await evalArgs(
    page,
    (ballId) => {
      const button = document.querySelector(
        `[data-testid="capture-ball-${ballId}"]`,
      );
      if (!button || button.disabled)
        throw new Error("Chosen ball has no stock or valid threshold");
      button.click();
    },
    ballId,
  );
  await waitArgs(
    page,
    () =>
      document
        .querySelector('[data-testid="capture-throw-scene"]')
        ?.getAttribute("data-phase") === "aiming",
    "selected ball enters the manual aiming scene before spending inventory",
  );
  await waitArgs(
    page,
    () =>
      document
        .querySelector('[data-testid="capture-throw-scene"]')
        ?.closest('[role="dialog"]')
        ?.getAnimations()
        .every((animation) => animation.playState !== "running"),
    "capture entrance animation settles before measuring real pointer coordinates",
  );
  const instructions = await evalArgs(
    page,
    () =>
      document
        .querySelector('[data-testid="capture-throw-scene"]')
        .closest('[role="dialog"]').textContent,
  );
  assert.doesNotMatch(
    instructions,
    /D20|mínimo|vector|multiplic/i,
    "the aiming screen shows only simple play instructions, with dice details reserved for the result",
  );
  const size = await evalArgs(page, () => {
    const scene = document
      .querySelector('[data-testid="capture-throw-scene"]')
      .getBoundingClientRect();
    const target = document
      .querySelector('[data-testid="capture-throw-target"]')
      .getBoundingClientRect();
    return {
      actual: target.width,
      expected: Math.min(scene.width * 0.25, scene.height * 0.21),
    };
  });
  assert(
    Math.abs(size.actual - size.expected) < 1,
    "the visible smaller target matches the hit test circle",
  );
}

export async function releaseCaptureBall({
  page,
  cdp,
  evalArgs,
  hit = true,
  touch = false,
  beforeRelease,
}) {
  const points = await evalArgs(
    page,
    (hit) => {
      const ball = document.querySelector('[data-testid="capture-throw-ball"]');
      const target = document.querySelector(
        '[data-testid="capture-throw-target"]',
      );
      const scene = document.querySelector(
        '[data-testid="capture-throw-scene"]',
      );
      if (!ball || !target || !scene)
        throw new Error("Capture aiming scene is incomplete");
      const a = ball.getBoundingClientRect(),
        b = target.getBoundingClientRect(),
        c = scene.getBoundingClientRect();
      const start = { x: a.left + a.width / 2, y: a.top + a.height / 2 };
      const targetCenter = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
      return {
        start,
        // Slingshot release travels opposite to the pull with a gain of three.
        // The old direct drag is deliberately used for a miss regression.
        end: hit
          ? {
              x: start.x + (start.x - targetCenter.x) / 3,
              y: start.y + (start.y - targetCenter.y) / 3,
            }
          : targetCenter,
      };
    },
    hit,
  );
  if (touch) {
    const point = (value) => ({
      ...value,
      id: 1,
      radiusX: 7,
      radiusY: 7,
      force: 1,
    });
    await cdp.request(
      "Input.dispatchTouchEvent",
      { type: "touchStart", touchPoints: [point(points.start)] },
      page,
    );
    await cdp.request(
      "Input.dispatchTouchEvent",
      { type: "touchMove", touchPoints: [point(points.end)] },
      page,
    );
    if (beforeRelease) await beforeRelease();
    await cdp.request(
      "Input.dispatchTouchEvent",
      { type: "touchEnd", touchPoints: [] },
      page,
    );
  } else {
    await cdp.request(
      "Input.dispatchMouseEvent",
      { type: "mouseMoved", ...points.start },
      page,
    );
    await cdp.request(
      "Input.dispatchMouseEvent",
      {
        type: "mousePressed",
        button: "left",
        buttons: 1,
        clickCount: 1,
        ...points.start,
      },
      page,
    );
    await cdp.request(
      "Input.dispatchMouseEvent",
      { type: "mouseMoved", button: "left", buttons: 1, ...points.end },
      page,
    );
    if (beforeRelease) await beforeRelease();
    await cdp.request(
      "Input.dispatchMouseEvent",
      {
        type: "mouseReleased",
        button: "left",
        buttons: 0,
        clickCount: 1,
        ...points.end,
      },
      page,
    );
  }
}

export async function finishCapturePresentation({
  page,
  evalArgs,
  waitArgs,
  expectedRoll,
  onDetails,
  onClosed,
}) {
  await waitArgs(
    page,
    () => !!document.querySelector('[data-testid="capture-throw-result"]'),
    "capture animation reaches its persisted result dialog",
  );
  const message = await evalArgs(
    page,
    () =>
      document.querySelector('[data-testid="capture-throw-result"]')
        .textContent,
  );
  const caught = await evalArgs(page, () =>
    document.querySelector('[data-testid="capture-throw-result"]')
      .getAttribute("data-outcome") === "caught",
  );
  if (caught) {
    const summary = await evalArgs(page, async () => {
      const party = (await import("/src/store/store.ts")).store.getState().party;
      const capture = party.pokemons.find((mon) => mon.captureId === party.lastCaptureResult.captureId);
      const dialog = document.querySelector('[data-testid="capture-throw-result"]').closest('[role="alertdialog"]');
      const strong = dialog?.querySelector("strong");
      return { name: capture?.pokemon.name, shown: strong?.textContent,
        weight: strong ? Number(getComputedStyle(strong).fontWeight) : 0 };
    });
    assert.equal(summary.shown, summary.name[0].toUpperCase() + summary.name.slice(1),
      "the successful capture names the saved Pokémon with an uppercase initial");
    assert(summary.weight >= 600, "the caught Pokémon name is visually bold");
  }
  if (expectedRoll !== undefined)
    assert.match(
      message,
      new RegExp(`D20[^0-9]*${expectedRoll}(?:[^0-9]|$)`),
      "the result dialog presents the actual saved D20 rather than drawing again",
    );
  await evalArgs(page, () => {
    const button = document.querySelector(
      '[data-testid="capture-throw-continue"]',
    );
    if (!button || button.disabled)
      throw new Error("Capture result cannot be continued");
    button.click();
  });
  if (caught) {
    await waitArgs(page, () => !!document.querySelector('[data-testid="capture-pokemon-details"]'),
      "the first Continue shows the captured Pokémon's details instead of closing the dialog");
    const details = await evalArgs(page, async () => {
      const party = (await import("/src/store/store.ts")).store.getState().party;
      const capture = party.pokemons.find((mon) => mon.captureId === party.lastCaptureResult.captureId);
      const panel = document.querySelector('[data-testid="capture-pokemon-details"]');
      const pp = await import("/src/lib/movePp.ts");
      return {
        captureId: capture.captureId,
        shownCaptureId: panel.getAttribute("data-capture-id"),
        name: capture.pokemon.name,
        level: capture.pokemon.level,
        types: capture.pokemon.types,
        moves: capture.moves.map((move) => ({ id: move.id, name: move.displayName || move.name,
          pp: pp.getCurrentMovePp(move), maxPp: pp.getMaxMovePp(move),
          shown: panel.querySelector(`[data-move-id="${move.id}"]`)?.textContent })),
        stats: capture.pokemon.stats.map((stat) => ({ ...stat,
          shown: panel.querySelector(`[data-stat="${stat.name}"] dd`)?.textContent })),
        text: panel.textContent,
        editable: !!panel.querySelector('input,select,textarea,[contenteditable="true"]'),
      };
    });
    assert.equal(details.shownCaptureId, details.captureId,
      "the second step identifies the exact saved capture instead of another Party member");
    assert.match(details.text.toLowerCase(), new RegExp(details.name.toLowerCase()),
      "the captured Pokémon's own name appears in its details");
    assert.match(details.text, new RegExp(`(?:Lv\\.?|Nivel)\\s*${details.level}(?:[^0-9]|$)`, "i"),
      "the second step presents the captured level, not the winner's new level");
    for (const type of details.types)
      assert(details.text.toLowerCase().includes(type.toLowerCase()), `captured type ${type} is shown`);
    for (const move of details.moves) {
      assert(move.shown?.toLowerCase().includes(move.name.toLowerCase()), `captured move ${move.name} is shown`);
      assert(new RegExp(`PP\\s*${move.pp}\\s*/\\s*${move.maxPp}(?:[^0-9]|$)`).test(move.shown),
        `captured move ${move.name} retains its saved PP`);
    }
    for (const stat of details.stats)
      assert(new RegExp(`(?:^|[^0-9])${stat.value}(?:[^0-9]|$)`).test(stat.shown),
        `captured ${stat.name} value ${stat.value} is shown`);
    assert.equal(details.editable, false, "capture details do not expose editing or another game action");
    if (onDetails) await onDetails(details);
    await evalArgs(page, () => {
      const button = document.querySelector('[data-testid="capture-throw-continue"]');
      if (!button || button.disabled) throw new Error("Captured Pokémon details cannot be continued");
      button.click();
    });
  }
  await waitArgs(
    page,
    () => !document.querySelector('[data-testid="capture-throw-scene"]') &&
      !document.querySelector('[data-testid="capture-pokemon-details"]'),
    "only the final Continue closes the capture presentation",
  );
  if (onClosed) await onClosed();
  return message;
}

export async function aimAndCompleteCapture(input) {
  await selectCaptureBall(input);
  await releaseCaptureBall(input);
  return finishCapturePresentation(input);
}
