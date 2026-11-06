'use client';
import {useRef} from 'react';
/** Controlled dialogs have no Radix Trigger; return focus to their actual opener. */
export function useDialogFocusReturn(){
 // React's native autoFocus can run before Radix's opening callback.
 const opener=useRef<HTMLElement|null>(typeof document!=='undefined'&&document.activeElement instanceof HTMLElement?document.activeElement:null);
 return {onOpenAutoFocus:(event:Event)=>{const active=document.activeElement,content=event.target;if(active instanceof HTMLElement&&content instanceof HTMLElement&&!content.contains(active))opener.current=active;},onCloseAutoFocus:(event:Event)=>{event.preventDefault();if(opener.current?.isConnected)opener.current.focus();}};
}
