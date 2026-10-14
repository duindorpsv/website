import {sqlClient} from '../../db/index';

// Retained Sportlink queries use numbered PostgreSQL parameters and real
// database transactions. This narrow adapter does not emulate a D1 binding.
export class SportlinkStatement {
  private values: (string|number|null)[] = [];
  constructor(readonly query: string) {}
  bind(...values: (string|number|null)[]) { this.values=values; return this; }
  async execute(client = sqlClient()) {
    let index=0;
    const query=this.query.replace(/\?/g,()=>`$${++index}`);
    return client.unsafe(query,this.values);
  }
  async first<T = Record<string,unknown>>(): Promise<T|null> { return (await this.execute())[0] as T || null; }
  async all<T>() {return {results: await this.execute() as unknown as T[]};}
  async run() {await this.execute();}
}
export const sportlinkStore={prepare:(query:string)=>new SportlinkStatement(query),async batch(statements:SportlinkStatement[]){await sqlClient().begin(async transaction=>{for(const statement of statements)await statement.execute(transaction as unknown as ReturnType<typeof sqlClient>);});}};
