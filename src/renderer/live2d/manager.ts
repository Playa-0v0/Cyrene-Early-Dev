import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display/cubism4";

export interface Live2DManagerOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  modelPath: string;
  onLoad?: () => void;
  onError?: (err: Error) => void;
}

export class Live2DManager {
  private app: PIXI.Application | null = null;
  private model: Live2DModel | null = null;
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

    this.model = await Live2DModel.from(modelPath, {
      autoInteract: false,
    });

    if (!this.app || this.disposed) return;

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

  resize(width: number, height: number): void {
    if (!this.app) return;
    this.app.renderer.resize(width, height);

    if (this.model) {
      this.model.x = width / 2;
      this.model.y = height / 2;
    }
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
