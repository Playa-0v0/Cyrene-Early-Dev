import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display/cubism4";
import type { HitAreaDef } from "./interaction";

export type { HitAreaDef } from "./interaction";

export interface Live2DManagerOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  modelPath: string;
  onLoad?: () => void;
  onError?: (err: Error) => void;
}

interface MotionEntry {
  Name?: string;
  File?: string;
  Expression?: string;
  [k: string]: unknown;
}

interface ModelJsonShape {
  HitAreas?: { Name?: string; Id?: string; Motion?: string }[];
  Motions?: Record<string, MotionEntry[]>;
}

function buildHitAreaDefs(json: ModelJsonShape): HitAreaDef[] {
  const out: HitAreaDef[] = [];
  const hitAreas = json.HitAreas ?? [];
  const motions = json.Motions ?? {};
  for (const area of hitAreas) {
    const name = area.Name;
    const id = area.Id;
    const trigger = area.Motion;
    if (!name || !id || !trigger) continue;
    const sep = trigger.indexOf(":");
    if (sep <= 0) continue;
    const group = trigger.substring(0, sep);
    const motionName = trigger.substring(sep + 1);
    const list = motions[group];
    const motionIndex = list ? list.findIndex((m) => m.Name === motionName) : -1;
    const motion = motionIndex >= 0 && list ? list[motionIndex] : undefined;
    const expressionName = motion?.Expression;
    out.push({ name, id, group, motionName, motionIndex, expressionName });
  }
  return out;
}

export class Live2DManager {
  private app: PIXI.Application | null = null;
  private model: Live2DModel | null = null;
  private hitAreaDefs: HitAreaDef[] = [];
  private options: Live2DManagerOptions;
  private disposed = false;

  constructor(options: Live2DManagerOptions) {
    this.options = options;
  }

  async init(): Promise<void> {
    if (this.disposed) return;
    const { canvas, width, height } = this.options;
    this.app = new PIXI.Application({
      view: canvas,
      width,
      height,
      transparent: true,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    try {
      await this.loadModel();
    } catch (err) {
      this.options.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async loadModel(): Promise<void> {
    const { modelPath } = this.options;
    // Kick off the Live2D load and the raw JSON fetch in parallel so the
    // hit-area / motion index map is ready the moment the model is.
    const modelPromise = Live2DModel.from(modelPath, {
      ticker: this.app!.ticker,
      autoHitTest: false,
      autoFocus: false,
    });
    const jsonPromise = fetch(modelPath).then((r) => {
      if (!r.ok) throw new Error("Failed to fetch " + modelPath + ": " + r.status);
      return r.json() as Promise<ModelJsonShape>;
    });
    const [model, json] = await Promise.all([modelPromise, jsonPromise]);
    if (!this.app || this.disposed) {
      model.destroy();
      return;
    }
    this.model = model;
    this.hitAreaDefs = buildHitAreaDefs(json);
    this.app.stage.addChild(this.model);
    const appWidth = this.options.width;
    const appHeight = this.options.height;
    this.model.anchor.set(0.5, 0.5);
    this.model.x = appWidth / 2;
    this.model.y = appHeight / 2;
    const scaleX = appWidth / this.model.width;
    const scaleY = appHeight / this.model.height;
    const scale = Math.min(scaleX, scaleY, 1.0);
    this.model.scale.set(scale);
    this.options.onLoad?.();
  }

  getModel(): Live2DModel | null {
    return this.model;
  }

  getHitAreaDefs(): HitAreaDef[] {
    return this.hitAreaDefs;
  }

  resize(width: number, height: number): void {
    if (!this.app) return;
    this.app.renderer.resize(width, height);
    if (this.model) {
      this.model.x = width / 2;
      this.model.y = height / 2;
    }
  }

  /**
   * Pause the PIXI ticker. Stops all per-frame controllers (AutoBreath,
   * EyeBlink, MouseTracking, Physics) from advancing. The model freezes
   * on its last rendered frame.
   *
   * Used while the user is dragging the window, so that the Windows DWM
   * "drag image" stays bit-identical to the live canvas content -- this
   * kills the ghosting/flicker that transparent Electron windows show
   * during a drag on Windows.
   */
  pause(): void {
    if (this.app) this.app.ticker.stop();
  }

  /** Resume the PIXI ticker. See pause(). */
  resume(): void {
    if (!this.app) return;
    this.app.render();
    this.app.ticker.start();
  }

    dispose(): void {
    this.disposed = true;
    if (this.model) {
      this.model.destroy();
      this.model = null;
    }
    if (this.app) {
      this.app.destroy(false, { children: true, texture: true });
      this.app = null;
    }
  }
}
