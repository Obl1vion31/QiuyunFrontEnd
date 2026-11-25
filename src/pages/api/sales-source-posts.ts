import type { APIRoute } from 'astro';
import { z } from 'zod';
import { searchSalesSourcePosts } from '../../db/sales-source-posts';
import { workflowErrorResponse } from '../../db/workflow-api';

export const prerender = false;
const search = z.object({ query: z.string().trim().max(2000), offset: z.coerce.number().int().min(0).max(100000) });

export const GET: APIRoute = async ({ url }) => {
  const input = search.safeParse({ query: url.searchParams.get('q') ?? '', offset: url.searchParams.get('offset') ?? 0 });
  if (!input.success) return Response.json({ message: '查找条件无效。请检查标题或分享链接。' }, { status: 422 });
  try {
    return Response.json(await searchSalesSourcePosts(input.data.query, input.data.offset));
  } catch (error) {
    return workflowErrorResponse(error);
  }
};
