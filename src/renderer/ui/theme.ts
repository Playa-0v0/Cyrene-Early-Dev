import "./theme.css";

type UiTheme = "classic" | "polished-pink" | "pearl-white";

declare global {
  interface Window {
    cyreneTheme?: {
      get: () => Promise<UiTheme>;
      onChanged: (callback: (theme: UiTheme) => void) => () => void;
    };
  }
}

function normalizeTheme(theme: unknown): UiTheme {
  if (theme === "polished-pink" || theme === "pearl-white") return theme;
  return "classic";
}

function applyTheme(theme: unknown): void {
  document.documentElement.dataset.uiTheme = normalizeTheme(theme);
}

applyTheme("classic");

void window.cyreneTheme?.get()
  .then(applyTheme)
  .catch(() => applyTheme("classic"));

window.cyreneTheme?.onChanged((theme) => {
  applyTheme(theme);
});
