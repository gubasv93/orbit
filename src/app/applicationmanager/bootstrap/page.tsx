import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {ApplicationManagerBootstrap} from '@/components/application-manager-bootstrap';
import {managerBootstrapAvailable} from '@/lib/application-manager-auth';

export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Administrator setup — Orbit',robots:{index:false,follow:false}};
export default async function ManagerBootstrapPage(){
 if(!await managerBootstrapAvailable())notFound();
 return <ApplicationManagerBootstrap/>;
}
