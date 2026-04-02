import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildClientPdf } from "@/lib/pdf/client-builder";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const analysis = await prisma.analysis.findUnique({ where: { id: params.id } });
    if (!analysis) return new NextResponse("Not found", { status: 404 });

    const a = JSON.parse(JSON.stringify(analysis)) as Record<string, unknown>;
    const refId = params.id.slice(0, 8).toUpperCase();
    const pdfBytes = await buildClientPdf(a, refId);

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="estim74-client-${refId}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[PDF Client]", err);
    return new NextResponse("Erreur generation PDF", { status: 500 });
  }
}
