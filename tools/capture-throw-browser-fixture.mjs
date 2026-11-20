import assert from "node:assert/strict";

/** Drive real pointer input; this never calls a capture planner or a store action. */
export async function selectCaptureBall({ page, evalArgs, waitArgs, ballId }) {
  await evalArgs(page, (ballId) => {
    const button = document.querySelector(`[data-testid="capture-ball-${ballId}"]`);
    if (!button || button.disabled) throw new Error("Chosen ball has no stock or valid threshold");
    button.click();
  }, ballId);
  await waitArgs(page, () => document.querySelector('[data-testid="capture-throw-scene"]')?.getAttribute("data-phase") === "aiming",
    "selected ball enters the manual aiming scene before spending inventory");
  await waitArgs(page, () => document.querySelector('[data-testid="capture-throw-scene"]')?.closest('[role="dialog"]')?.getAnimations().every(
    (animation) => animation.playState !== "running"),
  "capture entrance animation settles before measuring real pointer coordinates");
}

export async function releaseCaptureBall({ page, cdp, evalArgs, hit = true, touch = false, beforeRelease }) {
  const points = await evalArgs(page, (hit) => {
    const ball = document.querySelector('[data-testid="capture-throw-ball"]');
    const target = document.querySelector('[data-testid="capture-throw-target"]');
    const scene = document.querySelector('[data-testid="capture-throw-scene"]');
    if (!ball || !target || !scene) throw new Error("Capture aiming scene is incomplete");
    const a = ball.getBoundingClientRect(), b = target.getBoundingClientRect(), c = scene.getBoundingClientRect();
    return {
      start: { x: a.left + a.width / 2, y: a.top + a.height / 2 },
      end: hit ? { x: b.left + b.width / 2, y: b.top + b.height / 2 }
        : { x: Math.max(c.left + 8, 8), y: c.top + 8 },
    };
  }, hit);
  if (touch) {
    const point = (value) => ({ ...value, id: 1, radiusX: 7, radiusY: 7, force: 1 });
    await cdp.request("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(points.start)] }, page);
    await cdp.request("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point(points.end)] }, page);
    if (beforeRelease) await beforeRelease();
    await cdp.request("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }, page);
  } else {
    await cdp.request("Input.dispatchMouseEvent", { type: "mouseMoved", ...points.start }, page);
    await cdp.request("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", buttons: 1, clickCount: 1, ...points.start }, page);
    await cdp.request("Input.dispatchMouseEvent", { type: "mouseMoved", button: "left", buttons: 1, ...points.end }, page);
    if (beforeRelease) await beforeRelease();
    await cdp.request("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", buttons: 0, clickCount: 1, ...points.end }, page);
  }
}

export async function finishCapturePresentation({ page, evalArgs, waitArgs, expectedRoll }) {
  await waitArgs(page, () => !!document.querySelector('[data-testid="capture-throw-result"]'),
    "capture animation reaches its persisted result dialog");
  const message = await evalArgs(page, () => document.querySelector('[data-testid="capture-throw-result"]').textContent);
  if (expectedRoll !== undefined)
    assert.match(message, new RegExp(`D20[^0-9]*${expectedRoll}(?:[^0-9]|$)`),
      "the result dialog presents the actual saved D20 rather than drawing again");
  await evalArgs(page, () => {
    const button = document.querySelector('[data-testid="capture-throw-continue"]');
    if (!button || button.disabled) throw new Error("Capture result cannot be continued");
    button.click();
  });
  await waitArgs(page, () => !document.querySelector('[data-testid="capture-throw-scene"]'),
    "only continuing the completed capture result closes its presentation");
  return message;
}

export async function aimAndCompleteCapture(input) {
  await selectCaptureBall(input);
  await releaseCaptureBall(input);
  return finishCapturePresentation(input);
}
