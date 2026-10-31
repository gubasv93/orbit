import {NextRequest} from 'next/server';
import {z} from 'zod';
import {adminClient} from '@/lib/application-admin-server';
import {requireManager} from '@/lib/application-manager-auth';
import {managerAudit,managerAuditOutcome,managerBody,managerFailure,managerJson} from '@/lib/application-manager-api';
import {sameOrigin} from '@/lib/http';
import type {Workspace} from '@/lib/schema';

export const dynamic='force-dynamic';
const inputSchema=z.object({confirmation:z.string().max(100),revision:z.number().int().nonnegative()}).strict();
type Context={params:Promise<{id:string;projectId:string}>};
export async function DELETE(request:NextRequest,context:Context){
  if(!sameOrigin(request))return managerJson({error:'Request origin is not allowed.'},403);
  try{
    const manager=await requireManager({fresh:true}),params=await context.params;
    const id=z.uuid().safeParse(params.id),projectId=z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).safeParse(params.projectId),input=inputSchema.safeParse(await managerBody(request));
    if(!id.success||!projectId.success||!input.success)return managerJson({error:'Choose a valid project and confirm its name.'},400);
    const client=adminClient();
    const {data,error}=await client.rpc('orbit_application_user_workspace',{p_user:id.data});
    if(error)throw new Error('Unable to load the selected workspace.');
    const current=data as {workspace:Workspace;revision:number}|null;
    const project=current?.workspace.projects.find(item=>item.id===projectId.data);
    if(!project)return managerJson({error:'Project not found.'},404);
    if(current!.revision!==input.data.revision)return managerJson({error:'The workspace changed. Refresh the user details before deleting this project.'},409);
    if(project.name!==input.data.confirmation)return managerJson({error:'Enter the project name exactly to confirm deletion.'},400);
    await managerAudit(manager.id,'project_deletion_requested',id.data,{projectId:projectId.data});
    const removed=await client.rpc('orbit_application_delete_project',{p_user:id.data,p_project:projectId.data,p_expected_revision:input.data.revision});
    if(removed.error){
      await managerAuditOutcome(manager.id,'project_deletion_failed',id.data,{projectId:projectId.data});
      if(['PT409','40001'].includes(removed.error.code))return managerJson({error:'The workspace changed. Refresh before deleting.'},409);
      throw new Error('Unable to delete this project.');
    }
    await managerAuditOutcome(manager.id,'project_deleted',id.data,{projectId:projectId.data});
    return managerJson({ok:true,revision:removed.data?.revision});
  }catch(error){return managerFailure(error);}
}
