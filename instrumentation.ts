export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "development") return;

  const [{ getCurrentDay }, { buildLeanGamePool }] = await Promise.all([
    import("./lib/content-day"),
    import("./lib/lean-game-pool")
  ]);

  await buildLeanGamePool(await getCurrentDay(), {
    forceLog: true,
    logIssues: true,
    requestBound: false
  });
}
