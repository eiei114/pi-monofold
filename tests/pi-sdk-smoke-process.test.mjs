import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import test from "node:test";
import { killAndWaitForClose, wakeWaiters } from "../scripts/pi-sdk-smoke-process.mjs";

test("SIGKILL cleanup waits for the owned process close event", async (t) => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
    windowsHide: true,
  });
  const state = {
    child,
    waiters: new Set(),
    closed: null,
    spawnError: null,
    stdinError: null,
  };
  child.on("error", (error) => { state.spawnError = error; wakeWaiters(state); });
  child.on("close", (code, signal) => {
    state.closed = { code, signal };
    wakeWaiters(state);
  });
  t.after(async () => {
    if (state.closed) return;
    child.kill("SIGKILL");
    await Promise.race([
      once(child, "close"),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
  });

  await once(child, "spawn");
  await killAndWaitForClose(state);

  assert.ok(state.closed, "cleanup must observe the child's close event before it returns");
  assert.ok(child.exitCode !== null || child.signalCode !== null, "the child process must actually exit");
});
