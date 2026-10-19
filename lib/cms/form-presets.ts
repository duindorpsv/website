import type {CmsForm,FormField} from './types';

const field=(id:string,label:string,type:FormField['type']='text',required=true,extra:Partial<FormField>={}):FormField=>({id,label,type,required,...extra});
const guardian={fieldId:'birthDate',operator:'under18' as const};
export const publicFormPresets:CmsForm[]=[
  {id:'contact',kind:'contact',name:'Contact met de club',departmentId:'secretariaat',active:true,retentionDays:90,fields:[field('name','Naam'),field('email','E-mailadres','email'),field('message','Bericht','textarea')]},
  {id:'membership',kind:'registration',registrationPurpose:'membership',consentVersion:'membership-intake-v1',name:'Inschrijven bij Duindorp SV',departmentId:'secretariaat',active:true,retentionDays:90,fields:[
    field('firstName','Voornaam','text',true,{section:'Persoonlijke gegevens'}),field('lastName','Achternaam','text',true,{section:'Persoonlijke gegevens'}),
    field('birthDate','Geboortedatum','date',true,{section:'Persoonlijke gegevens'}),field('email','E-mailadres','email',true,{section:'Persoonlijke gegevens'}),field('phone','Telefoonnummer','tel',true,{section:'Persoonlijke gegevens'}),
    field('street','Straatnaam','text',true,{section:'Adres'}),field('houseNumber','Huisnummer en toevoeging','text',true,{section:'Adres'}),field('postalCode','Postcode','text',true,{section:'Adres'}),field('city','Woonplaats','text',true,{section:'Adres'}),
    field('guardianName','Naam ouder / voogd','text',true,{section:'Ouder of voogd',condition:guardian}),field('guardianEmail','E-mailadres ouder / voogd','email',true,{section:'Ouder of voogd',condition:guardian}),field('guardianPhone','Telefoonnummer ouder / voogd','tel',true,{section:'Ouder of voogd',condition:guardian}),
    field('otherClub','Ben je op dit moment ingeschreven bij een andere vereniging?','select',true,{section:'Voetbal en opmerkingen',options:['Ja','Nee']}),
    field('currentClub','Naam van de vereniging','text',true,{section:'Voetbal en opmerkingen',condition:{fieldId:'otherClub',operator:'equals',value:'Ja'}}),
    field('knvbCode','KNVB-relatiecode','text',false,{section:'Voetbal en opmerkingen'}),field('message','Opmerkingen','textarea',false,{section:'Voetbal en opmerkingen'}),
  ]},
  {id:'sponsorship',kind:'request',name:'Sponsor worden',departmentId:'sponsoring',active:true,retentionDays:90,fields:[field('name','Naam contactpersoon'),field('company','Bedrijfsnaam'),field('email','E-mailadres','email'),field('phone','Telefoonnummer','tel',false),field('message','Hoe wil je de club sponsoren?','textarea')]},
  {id:'friendly-request',kind:'request',name:'Oefenwedstrijd aanvragen',departmentId:'secretariaat',active:true,retentionDays:90,fields:[field('name','Naam contactpersoon'),field('email','E-mailadres','email'),field('phone','Telefoonnummer','tel',false),field('club','Vereniging'),field('team','Team'),field('level','Speelsterkte / klasse','text',false),field('date','Gewenste datum','date'),field('venue','Voorkeurslocatie','select',true,{options:['In overleg','Bij Duindorp SV','Bij onze vereniging']}),field('message','Extra informatie','textarea',false)]},
];
