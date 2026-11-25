import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";
import {Script} from "node:vm";

const index=readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),"../index.js"),"utf8");
function assetBody(name){
 const marker=`"${name}":{"body":`,start=index.indexOf(marker);
 assert.notEqual(start,-1,`missing static asset ${name}`);
 let i=start+marker.length;while(/\\s/.test(index[i]))i++;
 const begin=i;i++;
 while(i<index.length){if(index.charCodeAt(i)===92){i+=2;continue;}if(index[i]==='"')break;i++;}
 return JSON.parse(index.slice(begin,i+1));
}

test("embedded operator dashboard JavaScript is syntactically valid",()=>{
 assert.doesNotThrow(()=>new Script(assetBody("/app.js"),{filename:"/app.js"}));
});

test("operator dashboard exposes safe runner status, preview, reconcile and due dry-run actions",()=>{
 const html=assetBody("/");
 const app=assetBody("/app.js");
 assert.match(html,/id="runner-panel"/);
 assert.ok(app.includes('data-action="bind-target"'));
 assert.ok(app.includes('"/targets"'));
 assert.ok(app.includes("BIND NATURE FRONTIERS "));
 assert.match(html,/id="runner-reconcile"/);
 assert.match(app,/api\("\/api\/runner\/status"\)/);
 assert.match(app,/api\("\/api\/runner\/preview"/);
 assert.match(app,/api\("\/api\/runner\/reconcile"/);
 assert.match(app,/api\("\/api\/runner\/enqueue"/);
 assert.match(app,/api\("\/api\/runner\/claim"/);
 assert.match(app,/api\("\/api\/runner\/complete"/);
});
