// IPC channel names shared between main and renderer
export const IPC = {
  WINDOW_MINIMIZE: "window:minimize",
  WINDOW_CLOSE: "window:close",
  WINDOW_DRAG_START: "window:drag-start",
  APP_QUIT: "app:quit",
} as const;
