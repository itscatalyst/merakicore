import { handleHostedHealth } from "../../src/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const preferredRegion = "sin1";

export const GET = (request: Request): Promise<Response> => handleHostedHealth(request);
