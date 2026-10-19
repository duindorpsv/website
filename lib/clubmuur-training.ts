import type {SportlinkTeam} from './sportlink-types';

export const trainingSource='/clubmuur/teams/trainingen';
export const trainingVerifiedOn='10 oktober 2026';
export type ClubTrainingSession={day:string;start:string;end:string;field:string};
export type ClubTrainingRecord={teamLabel:string;sessions:ClubTrainingSession[]};
/** Official public training schedule, checked 2026-10-10. Times are local Dutch times. */
export const clubTrainingSchedule:ClubTrainingRecord[]=[
  {
    "teamLabel": "Duindorp sv MO9-1",
    "sessions": [
      {
        "day": "Maandag",
        "start": "17:00",
        "end": "18:00",
        "field": "Veld 2 - RB"
      },
      {
        "day": "Woensdag",
        "start": "17:00",
        "end": "18:00",
        "field": "Veld 2 - RB"
      }
    ]
  },
  {
    "teamLabel": "Duindorp sv O8-1",
    "sessions": [
      {
        "day": "Maandag",
        "start": "17:00",
        "end": "18:00",
        "field": "Veld 2 - LA"
      },
      {
        "day": "Woensdag",
        "start": "17:00",
        "end": "18:00",
        "field": "Veld 2 - LA"
      }
    ]
  },
  {
    "teamLabel": "Duindorp sv O8-2",
    "sessions": [
      {
        "day": "Maandag",
        "start": "17:00",
        "end": "18:00",
        "field": "Veld 2 - LB"
      },
      {
        "day": "Woensdag",
        "start": "17:00",
        "end": "18:00",
        "field": "Veld 2 - LB"
      }
    ]
  },
  {
    "teamLabel": "Duindorp sv O9-1",
    "sessions": [
      {
        "day": "Maandag",
        "start": "17:00",
        "end": "18:00",
        "field": "Veld 1 - RA"
      },
      {
        "day": "Woensdag",
        "start": "17:00",
        "end": "18:00",
        "field": "Veld 1 - RA"
      }
    ]
  },
  {
    "teamLabel": "Duindorp sv O9-2",
    "sessions": [
      {
        "day": "Maandag",
        "start": "17:00",
        "end": "18:00",
        "field": "Veld 1 - LA"
      },
      {
        "day": "Woensdag",
        "start": "17:00",
        "end": "18:00",
        "field": "Veld 1 - LA"
      }
    ]
  },
  {
    "teamLabel": "Duindorp sv MO11-1",
    "sessions": [
      {
        "day": "Maandag",
        "start": "18:00",
        "end": "19:00",
        "field": "Veld 1 - LA"
      },
      {
        "day": "Woensdag",
        "start": "17:00",
        "end": "18:00",
        "field": "Veld 1 - LA"
      }
    ]
  },
  {
    "teamLabel": "Duindorp sv MO13-1",
    "sessions": [
      {
        "day": "Maandag",
        "start": "18:00",
        "end": "19:00",
        "field": "Veld 2 - R"
      },
      {
        "day": "Woensdag",
        "start": "18:00",
        "end": "19:00",
        "field": "Veld 2 - R"
      }
    ]
  },
  {
    "teamLabel": "Duindorp sv O10-1",
    "sessions": [
      {
        "day": "Maandag",
        "start": "18:00",
        "end": "19:00",
        "field": "Veld 1 - LB"
      },
      {
        "day": "Woensdag",
        "start": "18:00",
        "end": "19:00",
        "field": "Veld 1 - LB"
      }
    ]
  },
  {
    "teamLabel": "Duindorp sv O11-1",
    "sessions": [
      {
        "day": "Maandag",
        "start": "18:00",
        "end": "19:00",
        "field": "Veld 1 - RA"
      },
      {
        "day": "Woensdag",
        "start": "18:00",
        "end": "19:00",
        "field": "Veld 1 - RA"
      }
    ]
  },
  {
    "teamLabel": "Duindorp sv O11-2",
    "sessions": [
      {
        "day": "Maandag",
        "start": "18:00",
        "end": "19:00",
        "field": "Veld 2 - LA"
      },
      {
        "day": "Woensdag",
        "start": "18:00",
        "end": "19:00",
        "field": "Veld 2 - LA"
      }
    ]
  },
  {
    "teamLabel": "Duindorp sv O12-1",
    "sessions": [
      {
        "day": "Maandag",
        "start": "18:00",
        "end": "19:00",
        "field": "Veld 1 - RB"
      },
      {
        "day": "Woensdag",
        "start": "18:00",
        "end": "19:00",
        "field": "Veld 1 - RB"
      }
    ]
  },
  {
    "teamLabel": "Duindorp sv O12-2",
    "sessions": [
      {
        "day": "Maandag",
        "start": "18:00",
        "end": "19:00",
        "field": "Veld 2 - LB"
      },
      {
        "day": "Woensdag",
        "start": "18:00",
        "end": "19:00",
        "field": "Veld 2 - LB"
      }
    ]
  },
  {
    "teamLabel": "Duindorp sv MO17-1",
    "sessions": [
      {
        "day": "Maandag",
        "start": "19:00",
        "end": "20:30",
        "field": "Veld 2 - R"
      },
      {
        "day": "Woensdag",
        "start": "19:00",
        "end": "20:00",
        "field": "Veld 2 - R"
      }
    ]
  },
  {
    "teamLabel": "Duindorp sv O13-1",
    "sessions": [
      {
        "day": "Maandag",
        "start": "19:00",
        "end": "20:30",
        "field": "Veld 2 - L"
      },
      {
        "day": "Woensdag",
        "start": "19:00",
        "end": "20:00",
        "field": "Veld 2 - L"
      }
    ]
  },
  {
    "teamLabel": "Duindorp sv O14-1",
    "sessions": [
      {
        "day": "Maandag",
        "start": "19:00",
        "end": "20:30",
        "field": "Veld 1 - R"
      },
      {
        "day": "Woensdag",
        "start": "19:00",
        "end": "20:00",
        "field": "Veld 1 - R"
      }
    ]
  },
  {
    "teamLabel": "Duindorp sv O14-2",
    "sessions": [
      {
        "day": "Maandag",
        "start": "19:00",
        "end": "20:30",
        "field": "Veld 1 - L"
      },
      {
        "day": "Woensdag",
        "start": "19:00",
        "end": "20:00",
        "field": "Veld 1 - L"
      }
    ]
  },
  {
    "teamLabel": "Duindorp sv O16-1",
    "sessions": [
      {
        "day": "Dinsdag",
        "start": "18:00",
        "end": "19:30",
        "field": "Veld 1 - R"
      },
      {
        "day": "Donderdag",
        "start": "18:00",
        "end": "19:30",
        "field": "Veld 1 - R"
      }
    ]
  },
  {
    "teamLabel": "Duindorp sv O16-2",
    "sessions": [
      {
        "day": "Dinsdag",
        "start": "18:00",
        "end": "19:30",
        "field": "Veld 2 - R"
      },
      {
        "day": "Donderdag",
        "start": "18:00",
        "end": "19:30",
        "field": "Veld 2 - R"
      }
    ]
  },
  {
    "teamLabel": "Duindorp sv O16-3",
    "sessions": [
      {
        "day": "Dinsdag",
        "start": "18:00",
        "end": "19:30",
        "field": "Veld 2 - L"
      },
      {
        "day": "Donderdag",
        "start": "18:00",
        "end": "19:30",
        "field": "Veld 2 - L"
      }
    ]
  },
  {
    "teamLabel": "Duindorp sv O17-1",
    "sessions": [
      {
        "day": "Dinsdag",
        "start": "18:00",
        "end": "19:30",
        "field": "Veld 1 - L"
      },
      {
        "day": "Donderdag",
        "start": "18:00",
        "end": "19:30",
        "field": "Veld 1 - L"
      }
    ]
  },
  {
    "teamLabel": "Duindorp sv 1",
    "sessions": [
      {
        "day": "Dinsdag",
        "start": "19:30",
        "end": "21:00",
        "field": "Veld 1 - L"
      },
      {
        "day": "Donderdag",
        "start": "19:30",
        "end": "21:00",
        "field": "Veld 1 - L"
      }
    ]
  },
  {
    "teamLabel": "Duindorp sv 2",
    "sessions": [
      {
        "day": "Dinsdag",
        "start": "19:30",
        "end": "21:00",
        "field": "Veld 1 - R"
      },
      {
        "day": "Donderdag",
        "start": "19:30",
        "end": "21:00",
        "field": "Veld 1 - R"
      }
    ]
  },
  {
    "teamLabel": "Duindorp sv O19-1",
    "sessions": [
      {
        "day": "Dinsdag",
        "start": "19:30",
        "end": "21:00",
        "field": "Veld 2 - L"
      },
      {
        "day": "Donderdag",
        "start": "19:30",
        "end": "21:00",
        "field": "Veld 2 - L"
      }
    ]
  }
];

function teamNameKey(value:string){
 return value.toLocaleLowerCase('nl').replace(/[.]/g,'').replace(/^duindorp\s*(?:sv)?\s*/,'').replace(/^jo(?=\d)/,'o').replace(/\s+/g,'');
}
/** Only matches identical age/team numbers. No guessing across generations or team numbers. */
export function trainingForTeam(team:Pick<SportlinkTeam,'name'>):ClubTrainingSession[]{
 const key=teamNameKey(team.name);
 return clubTrainingSchedule.find(record=>teamNameKey(record.teamLabel)===key)?.sessions||[];
}
