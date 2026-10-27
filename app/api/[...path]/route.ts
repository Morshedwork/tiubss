import { env } from 'cloudflare:workers';
import { handleAdminAPI } from '../../../server/admin.mjs';

export const dynamic = 'force-dynamic';
export const GET = (request: Request) => handleAdminAPI(request, env);
export const POST = GET;
export const PUT = GET;
export const DELETE = GET;
