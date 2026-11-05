'use client';
import {useRef} from 'react';
/** Controlled dialogs have no Radix Trigger; return focus to their actual opener. */
export function useDialogFocusReturn(){
 const opener=useRef<HTMLElement|null>(null);
 return {onOpenAutoFocus:()=>{opener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;},onCloseAutoFocus:(event:Event)=>{event.preventDefault();if(opener.current?.isConnected)opener.current.focus();}};
}
