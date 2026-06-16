import "../ui/base.css";
import "./tasks.css";

/**
 * 任务窗口是纯展示：标题栏的最小化/关闭是窗口级控件，
 * 不算对任务数据的交互，所以保留；正文区完全只读。
 */
interface TasksApi {
  minimize: () => void;
  close: () => void;
}

declare global {
  interface Window {
    tasks?: TasksApi;
  }
}

if (!window.tasks) {
  (window as unknown as { tasks: TasksApi }).tasks = {
    minimize: () => {},
    close: () => {},
  };
}

const minBtn = document.getElementById("min-btn") as HTMLButtonElement;
const closeBtn = document.getElementById("close-btn") as HTMLButtonElement;

minBtn.addEventListener("click", () => {
  window.tasks?.minimize();
});

closeBtn.addEventListener("click", () => {
  window.tasks?.close();
});
