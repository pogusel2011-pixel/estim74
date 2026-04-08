import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const timestamp = new Date().toISOString();
  let dbStatus: "ok" | "error" = "error";
  let dbLatencyMs: number | null = null;
  let dvfCount: number | null = null;
  let analysisCount: number | null = null;
  let dbError: string | null = null;

  try {
    const t0 = Date.now();
    const [dvf, analyses] = await Promise.all([
      prisma.dvfMutation.count(),
      prisma.analysis.count(),
    ]);
    dbLatencyMs = Date.now() - t0;
    dvfCount = dvf;
    analysisCount = analyses;
    dbStatus = "ok";
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  const healthy = dbStatus === "ok";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      timestamp,
      app: "ESTIM'74",
      version: process.env.npm_package_version ?? "0.1.0",
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
        dvfMutations: dvfCount,
        analyses: analysisCount,
        ...(dbError ? { error: dbError } : {}),
      },
    },
    { status: healthy ? 200 : 503 }
  );
}
