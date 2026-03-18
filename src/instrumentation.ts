export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWorker } = await import("./lib/worker");
    startWorker(parseInt(process.env.POLL_INTERVAL_MS || "5000"));
  }
}
