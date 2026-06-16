// IPC channel names shared between main and renderer
export const IPC = {
  // pet window
  WINDOW_MINIMIZE: "window:minimize",
  WINDOW_CLOSE: "window:close",
  WINDOW_DRAG_START: "window:drag-start",
  WINDOW_SET_INTERACTIVE: "window:set-interactive",
  WINDOW_MOVE: "window:move",
  WINDOW_MOVE_TO: "window:move-to",
  WINDOW_SET_DRAGGING: "window:set-dragging",
  WINDOW_CAPTURE_FRAME: "window:capture-frame",
  WINDOW_GET_CURSOR_POSITION: "window:get-cursor-position",
  APP_QUIT: "app:quit",

  // chat window
  CHAT_MINIMIZE: "chat:minimize",
  CHAT_CLOSE: "chat:close",
  CHAT_TOGGLE_MAXIMIZE: "chat:toggle-maximize",
  CHAT_IS_MAXIMIZED: "chat:is-maximized",
  CHAT_SEND_MESSAGE: "chat:send-message",
  CHAT_IMPORT_DOCUMENT: "chat:import-document",
  CHAT_STREAM_CHUNK: "chat:stream-chunk",
  CHAT_STREAM_DONE: "chat:stream-done",

  // sidebar window (status / schedule / settings entry)
  SIDEBAR_MINIMIZE: "sidebar:minimize",
  SIDEBAR_CLOSE: "sidebar:close",
  SIDEBAR_TOGGLE_COLLAPSE: "sidebar:toggle-collapse",
  SIDEBAR_OPEN_SETTINGS: "sidebar:open-settings",
  SIDEBAR_OPEN_TASKS: "sidebar:open-tasks",
  SIDEBAR_IS_COLLAPSED: "sidebar:is-collapsed",

  // tasks window (read-only display, no per-element interactions)
  TASKS_CLOSE: "tasks:close",
  TASKS_MINIMIZE: "tasks:minimize",

  // settings window
  SETTINGS_MINIMIZE: "settings:minimize",
  SETTINGS_CLOSE: "settings:close",
  SETTINGS_GET_CONFIG: "settings:get-config",
  SETTINGS_SAVE_CONFIG: "settings:save-config",
  SETTINGS_GET_GENERAL: "settings:get-general",
  SETTINGS_SAVE_GENERAL: "settings:save-general",
  SETTINGS_OPEN_SIDEBAR: "settings:open-sidebar",
  SETTINGS_CLOSE_SIDEBAR: "settings:close-sidebar",
  SETTINGS_OPEN_TASKS: "settings:open-tasks",
  SETTINGS_CLOSE_TASKS: "settings:close-tasks",
  SETTINGS_SET_PET_ALWAYS_ON_TOP: "settings:set-pet-always-on-top",
  SETTINGS_SET_PET_VISIBLE: "settings:set-pet-visible",
  SETTINGS_PREVIEW_RUNTIME_SYNC: "settings:preview-runtime-sync",
  SETTINGS_OPEN_STICKER_MANAGER: "settings:open-sticker-manager",

  // sticker manager window
  STICKERS_MINIMIZE: "stickers:minimize",
  STICKERS_CLOSE: "stickers:close",
  STICKERS_GET_CONFIG: "stickers:get-config",
  STICKERS_SET_ENABLED: "stickers:set-enabled",

  // public model config updates (no API key)
  MODEL_CONFIG_GET: "model-config:get",
  MODEL_CONFIG_CHANGED: "model-config:changed",

  // runtime state updates (status / feeling / expression)
  RUNTIME_STATE_GET: "runtime-state:get",
  RUNTIME_STATE_CHANGED: "runtime-state:changed",
  // embedding model status
  EMBEDDING_GET_STATUS: "embedding:get-status",
  EMBEDDING_DOWNLOAD: "embedding:download",
  EMBEDDING_DELETE: "embedding:delete",
  EMBEDDING_PROGRESS: "embedding:progress",
  EMBEDDING_SET_MODEL: "embedding:set-model",
  RERANKER_SET_MODE: "reranker:set-mode",
  // user profile
  USER_GET_PROFILE: "user:get-profile",
  USER_SAVE_PROFILE: "user:save-profile",
  USER_UPLOAD_AVATAR: "user:upload-avatar",
  USER_GET_AVATAR: "user:get-avatar",
} as const;
