import { Live2DManager } from "./live2d/manager";
import { InteractionController } from "./live2d/interaction";
import { MouseFocusController } from "./live2d/focus";
import { ExpressionResetController } from "./live2d/expression-reset";

const canvas = document.getElementById("live2d-canvas") as HTMLCanvasElement;
if (!canvas) throw new Error("Canvas #live2d-canvas not found");

if (!window.cyrene) {
  (window as unknown as { cyrene: unknown }).cyrene = {
    minimize: () => {},
    hide: () => {},
    quit: () => {},
    setInteractive: (_: boolean) => Promise.resolve(),
    moveBy: (_dx: number, _dy: number) => {},
    moveTo: (_x: number, _y: number) => {},
    setDragging: (_isDragging: boolean) => {},
    captureFrame: () => Promise.resolve(null),
    getCursorPosition: () => Promise.resolve(null),
  };
}

let interaction: InteractionController | null = null;
let focus: MouseFocusController | null = null;
let expressionReset: ExpressionResetController | null = null;

const manager = new Live2DManager({
  canvas,
  width: window.innerWidth,
  height: window.innerHeight,
  modelPath: "/models/cyrene/Cyrene.model3.json",
  onLoad: () => {
    console.log("[Cyrene] Model loaded");
    const model = manager.getModel();
    if (!model) return;

    expressionReset = new ExpressionResetController(model);
    interaction = new InteractionController(canvas, model, manager.getHitAreaDefs(), {
      onTrigger: (area) => {
        expressionReset?.restart();
        console.log("[Cyrene] hit", area.name, "->", area.group + ":" + area.motionName);
      },
      onMiss: (area) =>
        console.warn("[Cyrene] hit", area.name, "has no resolvable motion"),
    });

    focus = new MouseFocusController(canvas, model);
    focus.focusCenter(true);

    (window as unknown as { __cyrene: unknown }).__cyrene = {
      manager,
      interaction,
      focus,
      expressionReset,
      resetExpression: () => expressionReset?.resetNow(),
    };
  },
  onError: (err) => {
    console.error("[Cyrene] Failed to load model:", err);
  },
});

manager.init();

window.addEventListener("resize", () => {
  manager.resize(window.innerWidth, window.innerHeight);
  focus?.focusCenter(true);
});

window.addEventListener("beforeunload", () => {
  expressionReset?.dispose();
  expressionReset = null;
  focus?.dispose();
  focus = null;
  interaction?.dispose();
  interaction = null;
  manager.dispose();
});

let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let pendingPosition: { x: number; y: number } | null = null;
let rafId: number | null = null;
let dragOverlay: HTMLImageElement | null = null;
let dragToken = 0;

function clearDragOverlay(): void {
  if (dragOverlay) {
    dragOverlay.remove();
    dragOverlay = null;
  }
  canvas.style.visibility = "";
}

async function showDragOverlay(token: number): Promise<void> {
  const frame = await window.cyrene.captureFrame();
  if (!frame || token !== dragToken || !isDragging) return;

  const img = document.createElement("img");
  img.src = frame;
  img.alt = "";
  img.draggable = false;
  img.style.position = "fixed";
  img.style.inset = "0";
  img.style.width = "100vw";
  img.style.height = "100vh";
  img.style.objectFit = "contain";
  img.style.pointerEvents = "none";
  img.style.userSelect = "none";
  img.style.zIndex = "10";

  dragOverlay?.remove();
  dragOverlay = img;
  document.body.appendChild(img);
  canvas.style.visibility = "hidden";
}

function scheduleMoveTo(screenX: number, screenY: number): void {
  pendingPosition = {
    x: screenX - dragOffsetX,
    y: screenY - dragOffsetY,
  };
  if (rafId === null) {
    rafId = requestAnimationFrame(flushMove);
  }
}

function flushMove(): void {
  rafId = null;
  if (pendingPosition) {
    window.cyrene.moveTo(pendingPosition.x, pendingPosition.y);
    pendingPosition = null;
  }
}

function cancelPendingMove(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  pendingPosition = null;
}

function finishDrag(): void {
  isDragging = false;
  dragToken += 1;
  cancelPendingMove();
  clearDragOverlay();
  manager.resume();
  focus?.resume();
  window.cyrene.setDragging(false);
}

canvas.addEventListener("pointerenter", () => {
  void window.cyrene.setInteractive(true);
});

canvas.addEventListener("pointercancel", () => {
  if (isDragging) finishDrag();
});

canvas.addEventListener("pointerleave", () => {
  if (isDragging) return;
  void window.cyrene.setInteractive(false);
});

canvas.addEventListener("pointerdown", (e) => {
  isDragging = true;
  dragToken += 1;
  const token = dragToken;
  dragOffsetX = e.screenX - window.screenX;
  dragOffsetY = e.screenY - window.screenY;
  cancelPendingMove();
  focus?.pause(true);
  manager.pause();
  void window.cyrene.setInteractive(true);
  window.cyrene.setDragging(true);
  try {
    (e.target as Element).setPointerCapture(e.pointerId);
  } catch {}
  void showDragOverlay(token);
});

canvas.addEventListener("pointermove", (e) => {
  if (!isDragging) return;
  scheduleMoveTo(e.screenX, e.screenY);
});

canvas.addEventListener("pointerup", (e) => {
  if (!isDragging) return;
  scheduleMoveTo(e.screenX, e.screenY);
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  flushMove();
  finishDrag();

  try {
    (e.target as Element).releasePointerCapture(e.pointerId);
  } catch {}

  const rect = canvas.getBoundingClientRect();
  const outside =
    e.clientX < rect.left ||
    e.clientX > rect.right ||
    e.clientY < rect.top ||
    e.clientY > rect.bottom;
  if (outside) void window.cyrene.setInteractive(false);
});
