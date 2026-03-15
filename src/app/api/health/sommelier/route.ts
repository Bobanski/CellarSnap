import { NextResponse } from "next/server";
import {
  runSommelierSchemaHealthChecks,
  toSommelierSchemaErrorMessage,
} from "@/server/sommelier/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = await runSommelierSchemaHealthChecks();

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
        error: toSommelierSchemaErrorMessage(error),
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
