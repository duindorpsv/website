'use client';
import {useState} from 'react';
import {useCMS} from './provider';
export function DocumentUpload(){const {reload,can}=useCMS(),[message,setMessage]=useState('');if(!can('pages'))return null;return <section className="cms-panel"><label className="cms-field">PDF-document uploaden<input type="file" accept="application/pdf" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;const form=new FormData();form.append('file',file);const response=await fetch('/api/cms/documents/uploads',{method:'POST',body:form});const data=await response.json();setMessage(response.ok?'PDF privé opgeslagen. Vul de metadata in en publiceer het document.':data.message);await reload();}}/></label>{message&&<p role="status">{message}</p>}</section>;}
