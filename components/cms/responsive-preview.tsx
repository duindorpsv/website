'use client';
import {useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
export function ResponsivePreview({width,children}:{width:number;children:ReactNode}){const frame=useRef<HTMLIFrameElement>(null),[target,setTarget]=useState<HTMLElement|null>(null);return <div style={{maxWidth:'100%',overflowX:'auto'}}><iframe ref={frame} title={`Paginavoorbeeld ${width} pixels`} style={{width,height:850,border:0,display:'block',margin:'auto'}} srcDoc="<!doctype html><html lang='nl'><head></head><body></body></html>" onLoad={()=>{const doc=frame.current?.contentDocument;if(!doc)return;doc.head.innerHTML=[...document.querySelectorAll('link[rel="stylesheet"],style')].map(n=>n.outerHTML).join('');setTarget(doc.body);}}/>{target&&createPortal(children,target)}</div>;}
