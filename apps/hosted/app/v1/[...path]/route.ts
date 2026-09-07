import { handleHostedRest } from "../../../src/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const preferredRegion = "sin1";

type RouteContext = Readonly<{ params: Promise<Readonly<{ path: string[] }>> }>;

const handle = async (request: Request, context: RouteContext): Promise<Response> => {
  const { path } = await context.params;
  return handleHostedRest(request, path);
};

export const GET = handle;
export const POST = handle;
export const OPTIONS = handle;
