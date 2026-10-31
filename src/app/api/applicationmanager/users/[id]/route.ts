import {NextRequest} from 'next/server';
import {z} from 'zod';
import {adminClient} from '@/lib/application-admin-server';
import {requireManager} from '@/lib/application-manager-auth';
import {managerAudit,managerAuditOutcome,managerBody,managerFailure,managerJson} from '@/lib/application-manager-api';
import {emailSchema,firstNameSchema} from '@/lib/schema';
import {sameOrigin} from '@/lib/http';

export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
const adminName=z.string().trim().pipe(firstNameSchema.or(z.literal('')));
const edit=z.object({email:emailSchema,firstName:adminName,lastName:adminName}).strict();
const deletion=z.object({confirmation:z.string().max(254)}).strict();

export async function PATCH(request:NextRequest,context:Context){
  if(!sameOrigin(request))return managerJson({error:'Request origin is not allowed.'},403);
  try{
    const manager=await requireManager({fresh:true});
    const id=z.uuid().safeParse((await context.params).id),input=edit.safeParse(await managerBody(request));
    if(!id.success||!input.success)return managerJson({error:'Enter a valid email, first name and last name.'},400);
    const client=adminClient(),existing=await client.auth.admin.getUserById(id.data);
    if(existing.error&&(existing.error.status||0)>=500)throw new Error('User lookup is unavailable.');
    if(existing.error||!existing.data.user)return managerJson({error:'User not found.'},404);
    const {firstName,lastName,email}=input.data;
    await managerAudit(manager.id,'user_update_requested',id.data,{fields:['email','firstName','lastName']});
    const {data,error}=await client.auth.admin.updateUserById(id.data,{email,email_confirm:true,user_metadata:{...existing.data.user.user_metadata,first_name:firstName,last_name:lastName,full_name:[firstName,lastName].filter(Boolean).join(' ')}});
    if(error||!data.user){
      await managerAuditOutcome(manager.id,'user_update_failed',id.data);
      return managerJson({error:error?.code==='email_exists'?'This email is already used by another account.':'Unable to update this user. Check the email address and try again.'},error?.status&&error.status>=500?503:error?.status===422||error?.code==='email_exists'?409:400);
    }
    await managerAuditOutcome(manager.id,'user_updated',id.data,{fields:['email','firstName','lastName']});
    return managerJson({ok:true});
  }catch(error){return managerFailure(error);}
}

export async function DELETE(request:NextRequest,context:Context){
  if(!sameOrigin(request))return managerJson({error:'Request origin is not allowed.'},403);
  try{
    const manager=await requireManager({fresh:true});
    const id=z.uuid().safeParse((await context.params).id),input=deletion.safeParse(await managerBody(request));
    if(!id.success||!input.success)return managerJson({error:'Confirm the user email before deleting.'},400);
    const client=adminClient(),existing=await client.auth.admin.getUserById(id.data);
    if(existing.error&&(existing.error.status||0)>=500)throw new Error('User lookup is unavailable.');
    if(existing.error||!existing.data.user)return managerJson({error:'User not found.'},404);
    if(input.data.confirmation!==existing.data.user.email)return managerJson({error:'Enter the user email exactly to confirm deletion.'},400);
    await managerAudit(manager.id,'user_deletion_requested',id.data);
    const {error}=await client.auth.admin.deleteUser(id.data,false);
    if(error){await managerAuditOutcome(manager.id,'user_deletion_failed',id.data);throw new Error('Unable to delete the user.');}
    await managerAuditOutcome(manager.id,'user_deleted',id.data);
    return managerJson({ok:true});
  }catch(error){return managerFailure(error);}
}
