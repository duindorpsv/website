'use client';
import {createContext,useContext,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
export const CmsPageHeaderContext=createContext<HTMLElement|null>(null);
/** Render each manager's live handlers once, in the shared page heading. */
export function useCmsPageHeader({actions}:{actions:ReactNode}){
 const target=useContext(CmsPageHeaderContext);
 return target?createPortal(actions,target):<div className="cms-page-header-fallback">{actions}</div>;
}
