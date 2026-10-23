export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "development") return;

  const [{ getCurrentDayForInstrumentation }, { buildLeanGamePool }] = await Promise.all([
    import("./lib/content-day"),
    import("./lib/lean-game-pool")
  ]);

  await buildLeanGamePool(await getCurrentDayForInstrumentation(), {
    forceLog: true,
    logIssues: true,
    requestBound: false
  });
}
