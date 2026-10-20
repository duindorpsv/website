export type PeopleImportRow={id:string;name:string;email:string;phone:string;role:string;teamId?:string};
const key=(value:string)=>value.replace(/^\uFEFF/,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
/** CSV stays in the browser until the user explicitly reviews the selected IDs. */
export function parsePeopleCsv(source:string):PeopleImportRow[]{
 if(source.length>5_000_000)throw Error('Het CSV-bestand mag maximaal 5 MB zijn.');
 const delimiter=source.split(/\r?\n/,1)[0].includes(';')?';':',';
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let at=0;at<source.length;at++){const char=source[at];if(char==='"'){if(quoted&&source[at+1]==='"'){cell+='"';at++;}else quoted=!quoted;}else if(char===delimiter&&!quoted){row.push(cell);cell='';}else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&source[at+1]==='\n')at++;row.push(cell);if(row.some(value=>value.trim()))rows.push(row);row=[];cell='';}else cell+=char;}
 if(quoted)throw Error('Het CSV-bestand bevat een niet-afgesloten aanhalingsteken.');row.push(cell);if(row.some(value=>value.trim()))rows.push(row);
 if(rows.length<2)throw Error('Het CSV-bestand bevat geen personen.');if(rows.length>2001)throw Error('Importeer maximaal 2.000 personen tegelijk.');
 const headers=rows.shift()!.map(key),column=(names:string[])=>headers.findIndex(header=>names.includes(header));
 const idAt=column(['bronid','sourceid','relatiecode','sportlinkid']),nameAt=column(['naam','name','volledigenaam']),emailAt=column(['email','emailadres','emailaddress']),phoneAt=column(['telefoon','telefoonnummer','phone']),roleAt=column(['functie','role']);
 if(idAt<0||nameAt<0)throw Error('Gebruik minimaal de kolommen bronId (een stabiel ledennummer of relatiecode) en naam. Namen of rosterhashes zijn geen bron-ID.');
 const seen=new Set<string>();return rows.map((cells,index)=>{const id=cells[idAt]?.trim()||'',name=cells[nameAt]?.trim()||'';if(!id||!name)throw Error(`Rij ${index+2}: bronId en naam zijn verplicht.`);if(/^DEMO-SL-/i.test(id))throw Error(`Rij ${index+2}: voorbeeld-ID's zijn geen geldige ledenbron.`);if(id.length>150||name.length>120)throw Error(`Rij ${index+2}: bronId of naam is te lang.`);const normalized=id.toUpperCase();if(seen.has(normalized))throw Error(`Rij ${index+2}: bronId ${id} staat dubbel in dit bestand.`);seen.add(normalized);const email=cells[emailAt]?.trim()||'';if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error(`Rij ${index+2}: controleer het e-mailadres.`);return {id,name,email,phone:cells[phoneAt]?.trim()||'',role:cells[roleAt]?.trim()||''};});
}
