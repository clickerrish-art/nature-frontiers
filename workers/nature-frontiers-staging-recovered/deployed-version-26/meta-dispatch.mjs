export function evaluateMetaDispatchGate({controls={},connection=null,content=null,media=null,rights=null,approval=null,authorization=null}={}){
 const blockers=[];
 if(controls.emergencyStop!==false)blockers.push("emergency_stop_active_or_unknown");
 if(controls.publishingEnabled!==true)blockers.push("publishing_not_explicitly_enabled");
 if(controls.dryRun!==false)blockers.push("dry_run_not_explicitly_disabled");
 if(!connection||connection.status!=="verified"||!connection.identityVerified||!connection.permissionsVerified)blockers.push("facebook_page_identity_or_permissions_unverified");
 if(!connection?.instagramIdentityVerified)blockers.push("instagram_identity_unverified");
 if(!content||content.status!=="approved")blockers.push("content_not_approved");
 if(!media||media.validationStatus!=="passed"||!media.sha256)blockers.push("media_not_validated");
 if(!rights||rights.verified!==true||!["owned","licensed","public_domain"].includes(rights.status))blockers.push("media_rights_not_verified");
 if(!approval||approval.valid!==true||approval.contentSha256!==content?.sha256||approval.mediaSha256!==media?.sha256)blockers.push("approval_not_bound_to_exact_content_and_media");
 if(!authorization||authorization.oneShot!==true||authorization.consumed!==false)blockers.push("exact_one_shot_owner_authorization_missing");
 return {allowed:blockers.length===0,blockers,sideEffectPerformed:false};
}
export async function dispatchMetaPost(){
 return {ok:false,dispatchExecuted:false,error:"Provider publishing adapter is intentionally disabled until a separately reviewed release implementation and exact one-shot owner authorization are available."};
}
