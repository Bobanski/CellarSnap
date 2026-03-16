import { createSommelierIngestHandler } from "./handler";

const handler = createSommelierIngestHandler();

export const GET = handler.GET;
export const POST = handler.POST;
