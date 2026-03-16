import { NextResponse } from "next/server";
import { runSchemaHealthChecks, toSchemaHealthErrorMessage } from "@/lib/schemaHealth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = await runSchemaHealthChecks();

    return NextResponse.json(report, {
      status: report.ok ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: toSchemaHealthErrorMessage(error),
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
