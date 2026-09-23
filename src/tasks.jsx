// Uygulama geneli uzun işlemler (mod/paket/modpack kurulumu, içe aktarma…).
// Görevler App seviyesinde yaşar: kullanıcı sayfadan çıksa da ilerleme ve
// sonuç kaybolmaz; alttaki indirme çubuğu hepsini gösterir.
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const TaskContext = createContext({ tasks: [], runTask: async () => null, dismissTask: () => {} });
const DONE_LINGER_MS = 5000;

export function TaskProvider({ children }) {
  const [tasks, setTasks] = useState([]);

  // Backend ilerlemesi taskId ile gelir → yalnızca ilgili görev güncellenir
  useEffect(() => window.electronAPI.onModProgress((p) => {
    if (!p?.taskId) return;
    setTasks((prev) => prev.map((t) => (t.id === p.taskId
      ? { ...t, progress: p, pct: typeof p.percent === 'number' ? p.percent : t.pct }
      : t)));
  }), []);

  const dismissTask = useCallback((id) => setTasks((prev) => prev.filter((t) => t.id !== id)), []);

  /**
   * meta: { kind, title, subtitle?, iconUrl?, projectId?, instanceId? }
   * fn(taskId) → IPC sonucu ({ ok, ... } | { canceled })
   */
  const runTask = useCallback(async (meta, fn) => {
    const id = crypto.randomUUID();
    setTasks((prev) => [...prev, { ...meta, id, status: 'running', pct: null, progress: null, startedAt: Date.now() }]);
    const finish = (patch) => setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    try {
      const res = await fn(id);
      if (res?.canceled) {
        dismissTask(id);
      } else if (res && res.ok === false) {
        finish({ status: 'error', error: res.error });
      } else {
        finish({ status: 'done', pct: 100, result: res });
        setTimeout(() => dismissTask(id), DONE_LINGER_MS);
      }
      return res;
    } catch (err) {
      finish({ status: 'error', error: String(err?.message || err) });
      return { ok: false, error: String(err?.message || err) };
    }
  }, [dismissTask]);

  const value = useMemo(() => ({ tasks, runTask, dismissTask }), [tasks, runTask, dismissTask]);
  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTasks() {
  return useContext(TaskContext);
}
