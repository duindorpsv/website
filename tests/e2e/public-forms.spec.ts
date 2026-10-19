import {test} from '@playwright/test';
import {publicContactAndSponsorship,publicMembership,publicSiteHasCurrentCopyAndLinks,publicFriendlyAndNewsletter} from '../helpers/public-forms-browser';
test('FORM11: public contact and sponsorship forms submit from the current site',async({page})=>{await publicContactAndSponsorship(page);});
test('FORM12: full membership includes conditional guardian and current-club details',async({page})=>{await publicMembership(page);});
test('SITE01: live pages have no design notices or links to the old club pages',async({page})=>{await publicSiteHasCurrentCopyAndLinks(page);});
test('FORM13: friendly requests and newsletter applications are stored through their real endpoints',async({page})=>{await publicFriendlyAndNewsletter(page);});
