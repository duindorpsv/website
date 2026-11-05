export type PeopleImportRow = {
 id: string;
 name: string;
 email: string;
 phone: string;
 role: string;
 teamId?: string;
 birthDate?: string;
 address?: string;
 postalCode?: string;
 city?: string;
 membership?: 'playing' | 'non-playing' | 'none';
 sourceFields: Record<string, string>;
};

const MAX_COLUMNS = 200;
const MAX_CELL_LENGTH = 10_000;
const key = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function detectDelimiter(source: string): string {
 const counts = new Map([[',', 0], [';', 0], ['\t', 0]]);
 let quoted = false;
 for (let at = 0; at < source.length; at++) {
  const char = source[at];
  if (char === '"') {
   if (quoted && source[at + 1] === '"') at++;
   else quoted = !quoted;
  } else if (!quoted) {
   if (char === '\n' || char === '\r') break;
   if (counts.has(char)) counts.set(char, counts.get(char)! + 1);
  }
 }
 return [...counts].sort((left, right) => right[1] - left[1])[0][0];
}

function birthDate(value: string, row: number): string {
 if (!value) return '';
 const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
 const dutch = /^(\d{1,2})([-/])(\d{1,2})\2(\d{4})$/.exec(value);
 const year = Number(iso?.[1] ?? dutch?.[4]);
 const month = Number(iso?.[2] ?? dutch?.[3]);
 const day = Number(iso?.[3] ?? dutch?.[1]);
 const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
 const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
 if ((!iso && !dutch) || year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
  throw Error(`Rij ${row}: gebruik een geldige geboortedatum (dd-mm-jjjj of jjjj-mm-dd).`);
 }
 return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Parse and validate member data while retaining every original CSV column. */
export function parsePeopleCsv(input: string): PeopleImportRow[] {
 if (input.length > 5_000_000 || new TextEncoder().encode(input).length > 5_000_000) throw Error('Het CSV-bestand mag maximaal 5 MB zijn.');
 const source = input.replace(/^\uFEFF/, '');
 const delimiter = detectDelimiter(source);
 const rows: string[][] = [];
 let row: string[] = [], cell = '', quoted = false, closedQuote = false;
 const pushCell = () => {
  if (row.length >= MAX_COLUMNS) throw Error(`Het CSV-bestand mag maximaal ${MAX_COLUMNS} kolommen bevatten.`);
  row.push(cell);
  cell = '';
  closedQuote = false;
 };
 const pushRow = () => {
  pushCell();
  if (row.length > 1 || row[0].trim()) rows.push(row);
  if (rows.length > 2001) throw Error('Importeer maximaal 2.000 personen tegelijk.');
  row = [];
 };
 for (let at = 0; at < source.length; at++) {
  const char = source[at];
  if (quoted) {
   if (char === '"') {
    if (source[at + 1] === '"') { cell += '"'; at++; }
    else { quoted = false; closedQuote = true; }
   } else cell += char;
  } else if (char === delimiter) pushCell();
  else if (char === '\n' || char === '\r') {
   if (char === '\r' && source[at + 1] === '\n') at++;
   pushRow();
  } else if (char === '"' && !cell && !closedQuote) quoted = true;
  else if (char === '"' || closedQuote) throw Error(`Rij ${rows.length + 1}: ongeldig aanhalingsteken in het CSV-bestand.`);
  else cell += char;
  if (cell.length > MAX_CELL_LENGTH) throw Error(`Een CSV-veld mag maximaal ${MAX_CELL_LENGTH.toLocaleString('nl-NL')} tekens bevatten.`);
 }
 if (quoted) throw Error('Het CSV-bestand bevat een niet-afgesloten aanhalingsteken.');
 pushRow();
 if (rows.length < 2) throw Error('Het CSV-bestand bevat geen personen.');
 const originalHeaders = rows.shift()!;
 const seenHeaders = new Set<string>();
 for (const header of originalHeaders) {
  if (!header.trim()) throw Error('Elke CSV-kolom moet een kolomnaam hebben.');
  if (header.length > 150) throw Error('Een CSV-kolomnaam mag maximaal 150 tekens bevatten.');
  const normalized = header.trim().toLowerCase();
  if (seenHeaders.has(normalized)) throw Error(`De CSV-kolom ${header} staat dubbel in dit bestand.`);
  seenHeaders.add(normalized);
 }
 const headers = originalHeaders.map(key);
 const column = (names: string[]) => {
  for (const name of names) {
   const at = headers.indexOf(name);
   if (at >= 0) return at;
  }
  return -1;
 };
 const idAt = column(['bronid', 'sourceid', 'relatiecode', 'relcode', 'sportlinkid']);
 const nameAt = column(['naam', 'name', 'volledigenaam']);
 const emailAt = column(['email', 'emailadres', 'emailaddress']);
 const mobileAt = column(['mobielnummer', 'mobiel', 'mobile', 'mobilephone']);
 const phoneAt = column(['telefoon', 'telefoonnummer', 'phone']);
 const roleAt = column(['functie', 'role']);
 const birthDateAt = column(['gebdat', 'geboortedatum', 'birthdate']);
 const addressAt = column(['volledigadres', 'adres', 'address']);
 const postalCodeAt = column(['postcode', 'postalcode']);
 const cityAt = column(['plaats', 'city']);
 const membershipAt = column(['lidsoort', 'lidmaatschap', 'membership']);
 if (idAt < 0 || nameAt < 0) throw Error('Gebruik minimaal de kolommen bronId (een stabiel ledennummer of relatiecode) en naam. Namen of rosterhashes zijn geen bron-ID.');
 const seen = new Set<string>();
 return rows.map((cells, index) => {
  const rowNumber = index + 2;
  if (cells.length !== headers.length) throw Error(`Rij ${rowNumber}: verwacht ${headers.length} kolommen, gevonden ${cells.length}.`);
  const value = (at: number) => cells[at]?.trim() || '';
  const id = value(idAt), name = value(nameAt);
  if (!id || !name) throw Error(`Rij ${rowNumber}: bronId en naam zijn verplicht.`);
  if (/^DEMO-SL-/i.test(id)) throw Error(`Rij ${rowNumber}: voorbeeld-ID's zijn geen geldige ledenbron.`);
  if (id.length > 100 || !/^[a-zA-Z0-9._-]+$/.test(id)) throw Error(`Rij ${rowNumber}: gebruik een geldig bronId van maximaal 100 tekens.`);
  if (name.length > 120) throw Error(`Rij ${rowNumber}: naam is te lang.`);
  const normalized = id.toUpperCase();
  if (seen.has(normalized)) throw Error(`Rij ${rowNumber}: bronId ${id} staat dubbel in dit bestand.`);
  seen.add(normalized);
  const email = value(emailAt), phone = value(mobileAt) || value(phoneAt);
  if (email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw Error(`Rij ${rowNumber}: controleer het e-mailadres.`);
  if (phone.length > 100) throw Error(`Rij ${rowNumber}: telefoonnummer is te lang.`);
  const result: PeopleImportRow = {
   id, name, email, phone, role: value(roleAt),
   sourceFields: Object.fromEntries(originalHeaders.map((header, at) => [header, cells[at]])),
  };
  if (birthDateAt >= 0) result.birthDate = birthDate(value(birthDateAt), rowNumber);
  if (addressAt >= 0) result.address = value(addressAt);
  if (postalCodeAt >= 0) result.postalCode = value(postalCodeAt);
  if (cityAt >= 0) result.city = value(cityAt);
  const membership = key(value(membershipAt));
  if (membership === 'spelendlid' || membership === 'playing') result.membership = 'playing';
  if (membership === 'nietspelendlid' || membership === 'nonplaying') result.membership = 'non-playing';
  if (membership === 'geenlid' || membership === 'none') result.membership = 'none';
  return result;
 });
}
