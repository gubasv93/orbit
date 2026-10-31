import {NextRequest} from 'next/server';
import {managerAuthGet,managerAuthPost} from '@/lib/application-manager-auth';
export const dynamic='force-dynamic';
type Context={params:Promise<{action:string}>};
export async function GET(_request:NextRequest,context:Context){return managerAuthGet((await context.params).action);}
export async function POST(request:NextRequest,context:Context){return managerAuthPost(request,(await context.params).action);}
