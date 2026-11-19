import type { APIRoute } from 'astro';
import { rssFeed } from '../lib/rss';

export const GET: APIRoute = ({ site }) => rssFeed('en', site!);
