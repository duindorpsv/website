import {integer,sqliteTable,text} from 'drizzle-orm/sqlite-core';

export const sportlinkTeams=sqliteTable('sportlink_teams',{
 id:text('id').primaryKey(),teamCode:text('team_code').notNull(),localTeamCode:text('local_team_code').notNull(),
 name:text('name').notNull(),category:text('category').notNull(),gender:text('gender').notNull(),
 sport:text('sport').notNull(),day:text('day').notNull(),competitionsJson:text('competitions_json').notNull(),
 active:integer('active').notNull().default(1),updatedAt:text('updated_at').notNull(),
});
export const sportlinkClubs=sqliteTable('sportlink_clubs',{
 clubCode:text('club_code').primaryKey(),name:text('name').notNull(),logoUrl:text('logo_url'),updatedAt:text('updated_at').notNull(),
});
export const sportlinkMatches=sqliteTable('sportlink_matches',{
 id:text('id').primaryKey(),kickoff:text('kickoff').notNull(),homeTeamCode:text('home_team_code').notNull(),awayTeamCode:text('away_team_code').notNull(),
 homeClubCode:text('home_club_code').notNull(),awayClubCode:text('away_club_code').notNull(),
 status:text('status').notNull(),payloadJson:text('payload_json').notNull(),updatedAt:text('updated_at').notNull(),
});
export const sportlinkCache=sqliteTable('sportlink_cache',{
 key:text('cache_key').primaryKey(),payloadJson:text('payload_json'),updatedAt:integer('updated_at').notNull().default(0),
 expiresAt:integer('expires_at').notNull().default(0),refreshAfter:integer('refresh_after').notNull().default(0),
});
