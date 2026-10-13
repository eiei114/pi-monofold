export function wakeWaiters(state) {
  for (const check of [...state.waiters]) check();
}

export function waitFor(state, predicate, deadline) {
  const existing = predicate();
  if (existing) return Promise.resolve(existing);
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    const error = new Error("Pi RPC probe deadline exceeded");
    error.code = "PROBE_DEADLINE";
    return Promise.reject(error);
  }
  return new Promise((resolvePromise, rejectPromise) => {
    const finish = (callback, value) => {
      clearTimeout(timer);
      state.waiters.delete(check);
      callback(value);
    };
    const check = () => {
      const result = predicate();
      if (result) finish(resolvePromise, result);
      else if (state.closed) finish(rejectPromise, new Error("Pi process exited before the expected RPC observation"));
      else if (state.spawnError) finish(rejectPromise, state.spawnError);
      else if (state.stdinError) finish(rejectPromise, state.stdinError);
    };
    const timer = setTimeout(() => {
      const error = new Error("Pi RPC probe deadline exceeded");
      error.code = "PROBE_DEADLINE";
      finish(rejectPromise, error);
    }, remaining);
    state.waiters.add(check);
    check();
  });
}

export async function killAndWaitForClose(state) {
  state.child.kill("SIGKILL");
  try {
    await waitFor(state, () => state.closed, Date.now() + 1000);
  } catch {
    // Preserve the original probe failure if bounded cleanup also fails.
  }
}
