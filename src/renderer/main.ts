import { Live2DManager } from "./live2d/manager";

const canvas = document.getElementById("live2d-canvas") as HTMLCanvasElement;
if (!canvas) throw new Error("Canvas #live2d-canvas not found");

const manager = new Live2DManager({
  canvas,
  width: window.innerWidth,
  height: window.innerHeight,
  modelPath: "/models/cyrene/Cyrene.model3.json",
  onLoad: () => {
    console.log("[Cyrene] Model loaded");
  },
  onError: (err) => {
    console.error("[Cyrene] Failed to load model:", err);
  },
});

manager.init();

// Handle window resize
window.addEventListener("resize", () => {
  manager.resize(window.innerWidth, window.innerHeight);
});

// Cleanup on unload
window.addEventListener("beforeunload", () => {
  manager.dispose();
});
