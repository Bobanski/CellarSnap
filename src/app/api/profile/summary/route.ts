import { NextResponse } from 'next/server';
import { loadActivitySummary } from '@shared';
import { RequestAuthError, requireTypedRequestAuth } from '@/server/auth/requestAuth';
import { log } from '@/server/log';

export async function GET(request:Request) {
  try {
    const {supabase,user}=await requireTypedRequestAuth(request);
    return NextResponse.json(await loadActivitySummary(supabase,user.id),{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    if(error instanceof RequestAuthError)return NextResponse.json({error:'Unauthorized'},{status:401});
    log.error('Own activity summary failed',{error:error instanceof Error?error.message:String(error)});
    return NextResponse.json({error:'Unable to load activity counts.'},{status:500});
  }
}
