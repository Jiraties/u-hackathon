/** Public transport types only. No Node APIs, private storage types or signers. */
import type {AdmissionRulebook,PreviewApplicant,evaluateRulebook} from './domain.js';
export interface DemoReceipt {chainId:number;contractAddress:string;transactionHash:string;blockNumber:string;}
export interface DemoScenario {
 definitionId:string;definitionDigest:string;instanceId:string;academicYear:number;round:string;runId:string;rulebooks:AdmissionRulebook[];applicants:PreviewApplicant[];
 expected:{studentId:string;name:string;programId:string|null;calculations:({programId:string}&ReturnType<typeof evaluateRulebook>)[]}[];
}
export interface DemoDeployment {name:'RelationsLib'|'ZKTranscriptLib'|'HonkVerifier'|'FairPassRegistryV2';address:string;transactionHash:string;blockNumber:string;runtimeCodeHash:string;}
export interface DemoManifest {
 registry:string;verifier:string;verificationKeySha256:string;deployments?:DemoDeployment[];
 evidence:{kind:string;reference:string;eventName?:string;logIndex?:number;programId?:string;receipt:DemoReceipt}[];
}
export interface DemoScoring {programId:string;programName?:string;status:'verified'|'not_verified';eligible?:boolean;calculatedScore?:number;ruleVersion?:number;datasetId?:string;totalCommitment?:string;verification?:DemoReceipt|null;reason?:string;}
export interface DemoNetwork {chainId:number;contractAddress:string;deploymentBlock:string;protocolVersion?:number;}
export interface DemoReport {academicYear:number;round:string;outcome:'admitted'|'not_admitted';programId:string|null;scores:Record<string,number>;preferences:string[];trace:unknown;source:string;rulebooks?:AdmissionRulebook[];scoreRecords?:PreviewApplicant['scores'];qualifications?:Record<string,string>;runId?:string;}
export interface DemoStudent {
 id:string;name:string;
 wallet:DemoNetwork&{institutionName:string;student:{id:string;name:string};records:{resultId:string;report:DemoReport;commitment:string;confirmationRequestedAt:string|null;publication:DemoReceipt|null;issuance:DemoReceipt|null;scoring:DemoScoring[];program:{institutionName:string;programName:string;rulebookId:string}|null;credential:{credentialId:string;programId:string;status:string;lifecycle:string}|null}[]};
 proof:DemoNetwork&{resultId:string;report:DemoReport;scheme:string;verification:{resultIntegrity:string;scoreAuthenticity:string;allocationCorrectness:string};scoring:DemoScoring[];onchainCommitment:string;recordedAt:string;publication:DemoReceipt|null};
}
export interface DemoWorldSnapshot {
 scenario:DemoScenario;state:'verified'|'stale'|'unavailable'|'not_prepared';reason:string|null;mode:'local'|'fuji'|'preparation';observedAt:string;network:DemoNetwork|null;
 programs:{id:string;rulebook:AdmissionRulebook;capacity:number;active:number;issuer:string;lockedAt:string;registration:DemoReceipt|null;lock:DemoReceipt|null;current:boolean}[];
 students:DemoStudent[];dataset:{id:string;root:string;version:number;current:boolean;expiresAt:number;publication:DemoReceipt|null}|null;manifest:DemoManifest|null;securityAvailable:boolean;
}
