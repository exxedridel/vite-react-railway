import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Offline, dependency-free MIDI -> 16-bit PCM chiptune rendition. Keep the
// original score beside the WAV; no ROM samples or soundfont are required.
const input = fileURLToPath(new URL("../public/audio/wild-pokemon-captured-original.mid", import.meta.url));
const output = fileURLToPath(new URL("../public/audio/wild-pokemon-captured.wav", import.meta.url));
const data = readFileSync(input);
const sampleRate = 22050;
if (data.toString("ascii", 0, 4) !== "MThd") throw new Error("Expected a MIDI file");
const division = data.readUInt16BE(12);
if (division & 0x8000) throw new Error("SMPTE MIDI timing is not supported");
const trackCount = data.readUInt16BE(10);
const events = [];
let cursor = 8 + data.readUInt32BE(4);
for (let track = 0; track < trackCount; track++) {
  if (data.toString("ascii", cursor, cursor + 4) !== "MTrk") throw new Error("Invalid MIDI track");
  const end = cursor + 8 + data.readUInt32BE(cursor + 4);
  cursor += 8;
  let tick = 0;
  let running = 0;
  const variable = () => {
    let value = 0;
    let next;
    do {
      next = data[cursor++];
      value = value * 128 + (next & 127);
    } while (next & 128);
    return value;
  };
  while (cursor < end) {
    tick += variable();
    let status = data[cursor];
    if (status & 128) cursor++;
    else status = running;
    if (!status) throw new Error("Missing MIDI running status");
    if (status === 0xff) {
      const meta = data[cursor++];
      const size = variable();
      const bytes = data.subarray(cursor, cursor + size);
      cursor += size;
      events.push({ track, tick, meta, bytes });
    } else if (status === 0xf0 || status === 0xf7) {
      const size = variable();
      cursor += size;
    } else {
      running = status;
      const kind = status >> 4;
      const channel = status & 15;
      const a = data[cursor++];
      const b = kind === 0xc || kind === 0xd ? 0 : data[cursor++];
      events.push({ track, tick, kind, channel, a, b });
    }
  }
}
events.sort((a, b) => a.tick - b.tick || a.track - b.track);
let tempo = 500000;
let previousTick = 0;
let time = 0;
for (const event of events) {
  time += ((event.tick - previousTick) * tempo) / division / 1e6;
  previousTick = event.tick;
  event.time = time;
  if (event.meta === 0x51) tempo = event.bytes.readUIntBE(0, 3);
}
if (process.argv.includes("--inspect")) {
  console.log({ division, tracks: trackCount, duration: time });
  for (const event of events) {
    if (event.meta !== undefined || (event.kind === 0xb && [111, 116, 117].includes(event.a)))
      console.log({ ...event, bytes: event.bytes?.toString("hex"), text: event.bytes?.toString("utf8") });
  }
  process.exit(0);
}

const channels = Array.from({ length: 16 }, () => ({ program: 80, volume: 100 / 127, expression: 1, pan: 0 }));
const active = new Map();
const notes = [];
for (const event of events) {
  if (event.kind === undefined) continue;
  const channel = channels[event.channel];
  if (event.kind === 0xc) channel.program = event.a;
  if (event.kind === 0xb) {
    if (event.a === 7) channel.volume = event.b / 127;
    if (event.a === 11) channel.expression = event.b / 127;
    if (event.a === 10) channel.pan = (event.b - 64) / 64;
  }
  const key = `${event.track}:${event.channel}:${event.a}`;
  if (event.kind === 0x9 && event.b > 0) {
    const stack = active.get(key) ?? [];
    stack.push({ start: event.time, note: event.a, velocity: event.b / 127, channel: event.channel, ...channel });
    active.set(key, stack);
  } else if (event.kind === 0x8 || (event.kind === 0x9 && event.b === 0)) {
    const opened = active.get(key)?.shift();
    if (opened) notes.push({ ...opened, end: event.time });
  }
}
for (const stack of active.values()) for (const opened of stack) notes.push({ ...opened, end: time });
const length = Math.round(time * sampleRate);
const samples = new Float64Array(length);
const loopMarker = events.find((event) => event.meta === 6 && event.bytes.toString() === "[");
const loopSample = Math.round((loopMarker?.time ?? 0) * sampleRate);
let noise = 0x12345678;
for (const note of notes) {
  const first = Math.round(note.start * sampleRate);
  const last = Math.min(length, Math.round(note.end * sampleRate));
  const frequency = 440 * 2 ** ((note.note - 69) / 12);
  const amplitude = note.velocity * note.volume * note.expression;
  const harmonics = Math.min(15, Math.floor(sampleRate * 0.45 / frequency));
  const bass = note.note < 55;
  for (let sample = first; sample < last; sample++) {
    const age = (sample - first) / sampleRate;
    const remaining = (last - sample) / sampleRate;
    const envelope = Math.min(1, age / 0.003, remaining / 0.006);
    let wave = 0;
    if (note.channel === 9) {
      noise = (Math.imul(noise, 1664525) + 1013904223) >>> 0;
      wave = ((noise / 0xffffffff) * 2 - 1) * Math.exp(-age * 28) * 0.25;
    } else {
      const phase = 2 * Math.PI * frequency * age;
      // Band-limited pulse lead, softer triangle bass, and a quiet fundamental
      // give this compact score the same chiptune character as battle music.
      for (let harmonic = 1; harmonic <= harmonics; harmonic += 2) {
        const sign = bass && harmonic % 4 === 3 ? -1 : 1;
        wave += sign * Math.sin(harmonic * phase) / (bass ? harmonic ** 2 : harmonic);
      }
      wave *= bass ? 0.8 : 0.5;
    }
    samples[sample] += wave * amplitude * envelope;
  }
}
let peak = 0;
// A short ramp at both loop boundaries prevents a click when the browser wraps.
const fade = Math.round(0.002 * sampleRate);
for (let index = 0; index < fade; index++) {
  samples[loopSample + index] *= index / fade;
  samples[length - fade + index] *= (fade - index - 1) / fade;
}
for (const value of samples) peak = Math.max(peak, Math.abs(value));
const wav = Buffer.alloc(44 + length * 2);
wav.write("RIFF", 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(length * 2, 40);
for (let index = 0; index < length; index++)
  wav.writeInt16LE(Math.round(samples[index] / (peak || 1) * 0.8 * 32767), 44 + index * 2);
writeFileSync(output, wav);
console.log({ duration: length / sampleRate, loopStart: loopSample / sampleRate, loopEnd: length / sampleRate, sampleRate, channels: 1, notes: notes.length, bytes: wav.length, peak: 0.8 });
