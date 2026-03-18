import { createListScanParseHandler } from "@/app/api/list-scan/parse/handler";

export const POST = createListScanParseHandler();

// Allow up to 8 MB request bodies (images can be large).
// Vercel Hobby tier caps at 4.5 MB regardless, but this covers Pro
// and local dev where the default 1 MB limit would block uploads.
export const config = {
  api: { bodyParser: { sizeLimit: "8mb" } },
};
