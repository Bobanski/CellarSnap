import { test, expect } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { exchangeAppleCredential } from '../apps/mobile/src/lib/api/appleSignInFlow';
test('Apple receives SHA-256 nonce and Supabase receives raw nonce, never authorization code',async()=>{
 const raw=randomUUID(); const hashed=createHash('sha256').update(raw).digest('hex');
 const result=await exchangeAppleCredential({randomNonce:()=>raw,hashNonce:async s=>createHash('sha256').update(s).digest('hex'),requestCredential:async nonce=>{expect(nonce).toBe(hashed);expect(nonce).not.toBe(raw);return{identityToken:'apple-id-token',authorizationCode:'not-an-access-token',fullName:{givenName:'Test'}}},exchange:async input=>{expect(input).toEqual({provider:'apple',token:'apple-id-token',nonce:raw});return{user:{id:'fixture'}}}});
 expect(result.data.user.id).toBe('fixture');expect(result.credential.fullName?.givenName).toBe('Test');
});
test('Apple cancellation and missing identity tokens cannot exchange or create a session',async()=>{
 let calls=0;
 for(const requestCredential of [async()=>{throw Object.assign(new Error('cancelled'),{code:'ERR_REQUEST_CANCELED'})},async()=>({identityToken:null})]){
  await expect(exchangeAppleCredential({randomNonce:randomUUID,hashNonce:async (s: string)=>s,requestCredential,exchange:async()=>{calls++}})).rejects.toThrow();
 }expect(calls).toBe(0);
});
test('repeat Apple login accepts absent name and retains exchange errors',async()=>{
 const dependencies={randomNonce:randomUUID,hashNonce:async (s: string)=>s,requestCredential:async()=>({identityToken:'id',fullName:null})};
 expect((await exchangeAppleCredential({...dependencies,exchange:async()=>({user:'fixture'})})).credential.fullName).toBeNull();
 await expect(exchangeAppleCredential({...dependencies,exchange:async()=>{throw Error('Exchange denied')}})).rejects.toThrow('Exchange denied');
});
