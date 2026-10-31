import {NextResponse} from 'next/server';
import {ManagerAuthError} from './application-manager-auth';
import {adminClient} from './application-admin-server';
import {limitedJson} from './http';
import type {NextRequest} from 'next/server';

class ManagerRequestError extends Error {}
export async function managerBody(request:NextRequest,limit=4096){
  try{return await limitedJson(request,limit);}catch{throw new ManagerRequestError('Invalid or oversized request.');}
}

export function managerJson(value:unknown,status=200){
  return NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
}
export function managerFailure(error:unknown){
  if(error instanceof ManagerRequestError)return managerJson({error:error.message},400);
  if(error instanceof ManagerAuthError){
    const auth=error as ManagerAuthError&{code?:string};
    return managerJson({error:auth.message,...(auth.code?{code:auth.code}:{})},auth.status);
  }
  console.error('application_manager_operation_failed');
  return managerJson({error:'Application management is temporarily unavailable. Please retry.'},503);
}
export async function managerAudit(admin:string,action:string,target:string,details:Record<string,unknown>={}){
  const {error}=await adminClient().rpc('orbit_application_audit',{p_admin:admin,p_action:action,p_target:target,p_details:details});
  if(error)throw new Error('Unable to record the management operation.');
}
/** The intent is durable before a provider mutation; a logging outage must not
 * turn a completed destructive action into an ambiguous retryable failure. */
export async function managerAuditOutcome(admin:string,action:string,target:string,details:Record<string,unknown>={}){
  try{await managerAudit(admin,action,target,details);}catch{console.error('application_manager_audit_outcome_failed');}
}
