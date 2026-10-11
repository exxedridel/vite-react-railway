export type MusicPhase =
  | "idle"
  | "loading"
  | "playing"
  | "blocked"
  | "muted"
  | "error";
export const LOOP_START = 14.06798185941043;
export const LOOP_END = 97.06893424036281;

/** Una fuente por encuentro; no depende de abrir/cerrar el diálogo. */
export class BattleMusic {
  private context?: AudioContext;
  private source?: AudioBufferSourceNode;
  private buffer?: AudioBuffer;
  private pending?: Promise<AudioBuffer>;
  private abort = new AbortController();
  private key: string | null = null;
  private enabled = true;
  private disposed = false;
  private generation = 0;
  private offset = 0;
  private startedAt = 0;
  constructor(
    private notify: (phase: MusicPhase) => void,
    private createContext: () => AudioContext,
    private load: (
      context: AudioContext,
      signal: AbortSignal,
    ) => Promise<AudioBuffer>,
  ) {}
  private report(phase: MusicPhase) {
    if (!this.disposed) this.notify(phase);
  }
  private stop(preserve = false) {
    if (this.source) {
      if (preserve && this.context) {
        this.offset += Math.max(0, this.context.currentTime - this.startedAt);
        if (this.offset >= LOOP_END)
          this.offset =
            LOOP_START + ((this.offset - LOOP_START) % (LOOP_END - LOOP_START));
      }
      this.source.stop();
      this.source.disconnect();
      this.source = undefined;
    }
  }
  setEncounter(key: string | null, enabled: boolean) {
    if (this.disposed) return;
    if (key !== this.key) {
      this.generation++;
      this.stop();
      this.offset = 0;
      this.key = key;
    }
    if (enabled !== this.enabled) {
      this.generation++;
      if (!enabled) this.stop(true);
      this.enabled = enabled;
    }
    if (!key) {
      this.report("idle");
      return;
    }
    if (!enabled) {
      this.report("muted");
      return;
    }
    void this.start(false);
  }
  /** Se llama directamente desde pointerdown/keydown, antes de cualquier await. */
  unlock() {
    void this.start(true);
  }
  private async start(gesture: boolean) {
    if (this.disposed || !this.key || !this.enabled) return;
    const generation = this.generation;
    try {
      const context = (this.context ??= this.createContext());
      context.onstatechange = () => {
        if (this.disposed || !this.key || !this.enabled) return;
        if (context.state !== "running") this.report("blocked");
        else if (this.source) this.report("playing");
      };
      // resume debe iniciarse en el gesto, aunque la descarga aún no termine.
      if (gesture && context.state !== "running") {
        void context
          .resume()
          .then(() => this.start(false))
          .catch(() => this.report("blocked"));
      }
      if (this.source) {
        this.report(context.state === "running" ? "playing" : "blocked");
        return;
      }
      this.report("loading");
      const buffer =
        this.buffer ??
        (await (this.pending ??= this.load(context, this.abort.signal)
          .then((data) => {
            this.buffer = data;
            return data;
          })
          .catch((error) => {
            this.pending = undefined;
            throw error;
          })));
      if (
        this.disposed ||
        generation !== this.generation ||
        !this.key ||
        !this.enabled ||
        this.source
      )
        return;
      if (context.state !== "running") {
        this.report("blocked");
        return;
      }
      const gain = context.createGain();
      gain.gain.value = 0.2;
      gain.connect(context.destination);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = LOOP_START;
      source.loopEnd = Math.min(LOOP_END, buffer.duration);
      source.connect(gain);
      source.onended = () => gain.disconnect();
      this.source = source;
      this.startedAt = context.currentTime;
      source.start(0, this.offset);
      this.report("playing");
    } catch {
      if (generation === this.generation && this.key && this.enabled)
        this.report("error");
    }
  }
  dispose() {
    this.disposed = true;
    this.generation++;
    this.abort.abort();
    this.stop();
    if (this.context) {
      this.context.onstatechange = null;
      void this.context.close().catch(() => {});
    }
  }
}
