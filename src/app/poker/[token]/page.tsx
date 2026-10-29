import {PokerRoom} from '@/components/planning-poker';
export const dynamic='force-dynamic';
export const metadata={title:'Planning Poker — Orbit',robots:{index:false,follow:false}};
export default async function Room({params}:{params:Promise<{token:string}>}){const {token}=await params;return <PokerRoom token={token}/>;}
