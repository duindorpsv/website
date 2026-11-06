export type MollieMode='test'|'live';
export type MollieAuthMode='advanced-token'|'profile-api-key';
/** These are normalized records, never invented fields on a Mollie response. */
export type MollieProfile={id:string;name:string;website:string;status:'verified'|'unverified'|'blocked';canReceivePayments:boolean;mode:MollieMode;readinessCheckedAt:string};
export type MollieBalance={id:string;description:string;currency:string;status:'active'|'inactive';mode:MollieMode};
export type MollieProfileBalanceLink={profileId:string;balanceId:string;verifiedBy:'manual'|'provider';verifiedAt:string;evidence:string};
export type MollieCatalog={source:'none'|'provider';organizationId:string;bindingId:string;fetchedAt:string;profiles:MollieProfile[];balances:MollieBalance[];links:MollieProfileBalanceLink[]};
export type MollieStream={id:string;code:string;label:string;enabled:boolean;profileId:string;referencePrefix:string};
export type MollieEnvironment={authMode:MollieAuthMode;credentialReference:string;currentProfileId:string;paymentsEnabled:false;catalog:MollieCatalog;streams:MollieStream[]};
export type MollieSettings={mode:MollieMode;environments:{test:MollieEnvironment;live:MollieEnvironment}};
export type MollieRoute={available:boolean;reason:string;mode:MollieMode;stream?:MollieStream;profile?:MollieProfile;balance?:MollieBalance;link?:MollieProfileBalanceLink;classification:'administrative'|'separate-balances'|'unverified';classificationLabel:string;demo:false};
export type MollieRoutingSnapshot={mode:MollieMode;streamCode:string;streamLabel:string;profileId:string;profileName:string;balanceId:string;balanceDescription:string;linkVerification:'manual'|'provider';linkVerifiedAt:string;catalogFetchedAt:string;preparedAt:string};
export type MolliePaymentPreview={method:'POST';path:'/v2/payments';body:{amount:{currency:'EUR';value:string};description:string;metadata:{streamCode:string;reference:string;mode:MollieMode};profileId?:string;testmode?:boolean};routingSnapshot:MollieRoutingSnapshot;demo:false;executionAllowed:false};
