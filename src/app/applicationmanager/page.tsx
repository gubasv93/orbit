import type {Metadata} from 'next';
import {ApplicationManager} from '@/components/application-manager';
import {requireManager,ManagerAuthError} from '@/lib/application-manager-auth';

export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Application manager — Orbit',robots:{index:false,follow:false}};
export default async function ManagerPage(){
 try{const session=await requireManager();return <ApplicationManager initialManager={{email:session.email,mfaEnabled:session.mfaEnabled,freshUntil:session.freshUntil}}/>;}
 catch(error){return <ApplicationManager initialUnavailable={!(error instanceof ManagerAuthError&&[401,403].includes(error.status))}/>;}
}
