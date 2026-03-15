import { createSommelierUploadDocumentHandler } from "./handler";

const handler = createSommelierUploadDocumentHandler();

export const GET = handler.GET;
export const POST = handler.POST;
