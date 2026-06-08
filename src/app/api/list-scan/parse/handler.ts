import { NextResponse } from "next/server";
import { applyRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { saveListScanResult } from "@/server/listScan/persistence";
import {
  detectListScanSourceType,
  parseWineListSource,
} from "@/server/listScan/parse";

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 45;

function normalizeListScanErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Unable to scan this wine list right now.";
  }

  if (
    /invalid json response|unable to parse structured list scan data|no data returned from list scan/i.test(
      error.message
    )
  ) {
    return "That wine list could not be read cleanly. Try a clearer photo, a PDF, or a shorter webpage link.";
  }

  return error.message;
}

export function createListScanParseHandler(
  dependencies: Partial<{
    requireRequestAuth: typeof requireRequestAuth;
    detectListScanSourceType: typeof detectListScanSourceType;
    parseWineListSource: typeof parseWineListSource;
    saveListScanResult: typeof saveListScanResult;
    applyRateLimit: typeof applyRateLimit;
    rateLimitHeaders: typeof rateLimitHeaders;
  }> = {}
) {
  const resolvedDependencies = {
    requireRequestAuth,
    detectListScanSourceType,
    parseWineListSource,
    saveListScanResult,
    applyRateLimit,
    rateLimitHeaders,
    ...dependencies,
  };

  return async function POST(request: Request) {
    let auth: Awaited<ReturnType<typeof requireRequestAuth>>;
    try {
      auth = await resolvedDependencies.requireRequestAuth(request);
    } catch (error) {
      if (error instanceof RequestAuthError) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      throw error;
    }

    const rateLimit = await resolvedDependencies.applyRateLimit({
      request,
      routeKey: "list-scan-parse",
      windowMs: RATE_LIMIT_WINDOW_MS,
      maxRequests: RATE_LIMIT_MAX_REQUESTS,
      userId: auth.user.id,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error:
            "Too many list scans in a short time. Please wait a bit and try again.",
        },
        { status: 429, headers: resolvedDependencies.rateLimitHeaders(rateLimit) }
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }

    const rawUrl = formData.get("url");
    const url =
      typeof rawUrl === "string" && rawUrl.trim().length > 0 ? rawUrl.trim() : null;
    const files = formData
      .getAll("files")
      .filter((value): value is File => value instanceof File);
    const legacyFileValue = formData.get("file");
    const legacyFile = legacyFileValue instanceof File ? legacyFileValue : null;
    const uploadFiles = files.length > 0 ? files : legacyFile ? [legacyFile] : [];

    let sourceType;
    try {
      sourceType = resolvedDependencies.detectListScanSourceType({
        files: uploadFiles,
        url,
      });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Upload a list image or PDF, or enter a URL.",
        },
        { status: 400 }
      );
    }

    try {
      let result;
      if (sourceType === "url" && url) {
        result = await resolvedDependencies.parseWineListSource({
          sourceType: "url",
          url,
          requesterId: auth.user.id,
          userId: auth.user.id,
          userSupabase: auth.supabase,
        });
      } else if (sourceType === "image") {
        result = await resolvedDependencies.parseWineListSource({
          sourceType: "image",
          files: uploadFiles,
          sourceLabel:
            typeof formData.get("sourceLabel") === "string"
              ? String(formData.get("sourceLabel")).trim()
              : uploadFiles[0]?.name ?? null,
          requesterId: auth.user.id,
          userId: auth.user.id,
          userSupabase: auth.supabase,
        });
      } else {
        result = await resolvedDependencies.parseWineListSource({
          sourceType: "pdf",
          file: uploadFiles[0] as File,
          sourceLabel:
            typeof formData.get("sourceLabel") === "string"
              ? String(formData.get("sourceLabel")).trim()
              : uploadFiles[0]?.name ?? null,
          requesterId: auth.user.id,
          userId: auth.user.id,
          userSupabase: auth.supabase,
        });
      }

      try {
        await resolvedDependencies.saveListScanResult(
          auth.supabase,
          auth.user.id,
          result
        );
      } catch {
        result = {
          ...result,
          warnings: [
            ...result.warnings,
            "This scan completed, but it could not be saved to your scan history.",
          ],
        };
      }

      return NextResponse.json(result);
    } catch (error) {
      // Check for missing OpenAI API key and return 503 for infrastructure issues
      if (
        error instanceof Error &&
        error.message.includes("OPENAI_API_KEY")
      ) {
        return NextResponse.json(
          {
            error: "List scanning service is temporarily unavailable. Please try again in a few moments.",
          },
          { status: 503 }
        );
      }

      return NextResponse.json(
        {
          error: normalizeListScanErrorMessage(error),
        },
        { status: 422 }
      );
    }
  };
}
