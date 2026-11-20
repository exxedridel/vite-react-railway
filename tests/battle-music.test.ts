import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BattleMusic,
  LOOP_END,
  LOOP_START,
  CAPTURE_LOOP_START,
  type MusicPhase,
  type MusicTrack,
} from "../src/lib/battleMusic";

const buffer = (track: MusicTrack) =>
  ({
    duration: track === "battle" ? 120 : 12,
    track,
  }) as unknown as AudioBuffer;
const tick = async () => {
  for (let index = 0; index < 8; index++) await Promise.resolve();
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
function fixture(
  load?: (
    context: AudioContext,
    signal: AbortSignal,
    track: MusicTrack,
  ) => Promise<AudioBuffer>,
  initialState: AudioContextState = "running",
) {
  const phases: MusicPhase[] = [];
  const events: string[] = [];
  const loads: MusicTrack[] = [];
  const starts: { source: FakeSource; offset: number }[] = [];
  const active = new Set<FakeSource>();
  let contexts = 0,
    closes = 0,
    resumes = 0;
  class FakeSource {
    buffer: AudioBuffer | null = null;
    loop = false;
    loopStart = 0;
    loopEnd = 0;
    onended: (() => void) | null = null;
    connect() {}
    disconnect() {}
    start(_when: number, offset: number) {
      assert.equal(
        active.size,
        0,
        "a track must stop before another source starts",
      );
      active.add(this);
      starts.push({ source: this, offset });
      events.push(
        `start:${(this.buffer as unknown as { track: MusicTrack }).track}`,
      );
    }
    stop() {
      assert(active.delete(this), "a source should only stop once");
      events.push(
        `stop:${(this.buffer as unknown as { track: MusicTrack }).track}`,
      );
      this.onended?.();
    }
  }
  const context = {
    state: initialState,
    currentTime: 0,
    onstatechange: null as (() => void) | null,
    destination: {},
    createGain: () => ({ gain: { value: 0 }, connect() {}, disconnect() {} }),
    createBufferSource: () => new FakeSource(),
    resume: async () => {
      resumes++;
      context.state = "running";
      context.onstatechange?.();
    },
    close: async () => {
      closes++;
      context.state = "closed";
    },
  };
  const player = new BattleMusic(
    (phase) => phases.push(phase),
    () => {
      contexts++;
      return context as unknown as AudioContext;
    },
    async (audioContext, signal, track) => {
      loads.push(track);
      events.push(`load:${track}`);
      return load ? load(audioContext, signal, track) : buffer(track);
    },
  );
  return {
    player,
    context,
    phases,
    loads,
    starts,
    active,
    events,
    get contexts() {
      return contexts;
    },
    get closes() {
      return closes;
    },
    get resumes() {
      return resumes;
    },
  };
}

test("one context switches battle to capture without overlap and keeps the capture source across both result steps", async () => {
  const f = fixture();
  f.player.setEncounter("wild-encounter", true);
  await tick();
  const battle = f.starts[0].source;
  assert.equal(battle.loopStart, LOOP_START);
  assert.equal(battle.loopEnd, LOOP_END);
  f.player.setEncounter("capture-result", true, "capture");
  assert.deepEqual(
    f.events.slice(-2),
    ["stop:battle", "load:capture"],
    "battle is stopped before loading the captured theme",
  );
  await tick();
  const capture = f.starts[1].source;
  assert.equal(capture.loop, true);
  assert.equal(capture.loopStart, CAPTURE_LOOP_START);
  assert.equal(capture.loopEnd, 12);
  assert.equal(f.contexts, 1);
  f.context.currentTime = 8;
  f.player.setEncounter("capture-result", true, "capture");
  f.player.unlock();
  await tick();
  assert.equal(
    f.starts.length,
    2,
    "the second conditional screen must retain the existing capture source",
  );
  assert(f.active.has(capture));
  f.player.setEncounter(null, true);
  await tick();
  assert.equal(f.active.size, 0);
  assert.equal(f.phases.at(-1), "idle");
  assert.deepEqual(
    f.events.filter((event) => event.startsWith("stop:")),
    ["stop:battle", "stop:capture"],
  );
  f.player.dispose();
  assert.equal(f.closes, 1);
});

test("mute is shared by both themes, preserves the current loop position, and unmute never repeats a load", async () => {
  const f = fixture();
  f.player.setEncounter("wild-encounter", true);
  await tick();
  f.context.currentTime = 125;
  f.player.setEncounter("wild-encounter", false);
  f.player.setEncounter("wild-encounter", true);
  await tick();
  assert.equal(
    f.starts[1].offset,
    LOOP_START + ((125 - LOOP_START) % (LOOP_END - LOOP_START)),
  );
  f.player.setEncounter("capture-result", false, "capture");
  await tick();
  assert.equal(f.phases.at(-1), "muted");
  assert.deepEqual(
    f.loads,
    ["battle"],
    "muted success cannot load or play the capture theme",
  );
  f.player.setEncounter("capture-result", true, "capture");
  await tick();
  f.context.currentTime = 143;
  f.player.setEncounter("capture-result", false, "capture");
  f.player.setEncounter("capture-result", true, "capture");
  await tick();
  assert.equal(
    f.starts.at(-1)!.offset,
    CAPTURE_LOOP_START +
      ((18 - CAPTURE_LOOP_START) % (12 - CAPTURE_LOOP_START)),
    "capture uses its own short intro marker, independent of battle intro points",
  );
  assert.deepEqual(f.loads, ["battle", "capture"]);
  assert.equal(f.contexts, 1);
  f.player.dispose();
  assert.equal(f.active.size, 0);
});

test("a late capture download cannot start after the success dialog has closed", async () => {
  const pending = deferred<AudioBuffer>();
  const f = fixture(async (_context, _signal, track) =>
    track === "capture" ? pending.promise : buffer(track),
  );
  f.player.setEncounter("wild-encounter", true);
  await tick();
  f.player.setEncounter("capture-result", true, "capture");
  f.player.setEncounter(null, true);
  pending.resolve(buffer("capture"));
  await tick();
  assert.equal(f.active.size, 0);
  assert.equal(f.starts.length, 1);
  assert.equal(f.phases.at(-1), "idle");
  // The decoded cache can only play if a later explicit presentation asks for it.
  f.player.setEncounter("next-capture-result", true, "capture");
  await tick();
  assert.equal(f.starts.length, 2);
  assert.deepEqual(f.loads, ["battle", "capture"]);
  f.player.dispose();
});

test("a previous battle download cannot interrupt a capture theme", async () => {
  const pending = deferred<AudioBuffer>();
  const f = fixture(async (_context, _signal, track) =>
    track === "battle" ? pending.promise : buffer(track),
  );
  f.player.setEncounter("wild-encounter", true);
  f.player.setEncounter("capture-result", true, "capture");
  await tick();
  assert.equal(f.starts.length, 1);
  assert.equal(
    (f.starts[0].source.buffer as unknown as { track: MusicTrack }).track,
    "capture",
  );
  pending.resolve(buffer("battle"));
  await tick();
  assert.equal(f.starts.length, 1);
  assert.equal(f.active.size, 1);
  assert.equal(f.contexts, 1);
  f.player.dispose();
});

test("capture load errors never resume battle, allow retry, and dispose fences all late work", async () => {
  let failCapture = true;
  let captureSignal: AbortSignal | undefined;
  const pending = deferred<AudioBuffer>();
  const f = fixture(async (_context, signal, track) => {
    if (track === "battle") return buffer(track);
    captureSignal = signal;
    if (failCapture) throw new Error("offline");
    return pending.promise;
  });
  f.player.setEncounter("wild-encounter", true);
  await tick();
  f.player.setEncounter("capture-result", true, "capture");
  await tick();
  assert.equal(f.phases.at(-1), "error");
  assert.equal(f.active.size, 0);
  failCapture = false;
  f.player.unlock();
  f.player.dispose();
  assert.equal(captureSignal?.aborted, true);
  pending.resolve(buffer("capture"));
  await tick();
  assert.equal(f.starts.length, 1);
  assert.equal(f.active.size, 0);
  assert.equal(f.closes, 1);
});

test("touch activation resumes the same context for the capture track and cannot create duplicate sources", async () => {
  const f = fixture(undefined, "suspended");
  f.player.setEncounter("wild-encounter", true);
  await tick();
  assert.equal(f.phases.at(-1), "blocked");
  assert.equal(f.starts.length, 0);
  f.player.setEncounter("capture-result", true, "capture");
  f.player.unlock();
  f.player.unlock();
  await tick();
  assert.equal(f.contexts, 1);
  assert.equal(f.resumes, 1);
  assert.equal(f.starts.length, 1);
  assert.equal(f.active.size, 1);
  assert.equal(
    (f.starts[0].source.buffer as unknown as { track: MusicTrack }).track,
    "capture",
  );
  assert.equal(f.phases.at(-1), "playing");
  f.player.dispose();
});
