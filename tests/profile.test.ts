import {describe, expect, it} from 'vitest';
import {accountProfile, profilePasswordMode, recentGoogleAuthentication} from '../src/lib/profile';

describe('account profile display and authentication policy', () => {
  it('prefers the profile name over stale OAuth display fields and keeps identity out of display data', () => {
    expect(accountProfile({email:'sam@example.com',user_metadata:{first_name:'  Олена ',last_name:'Д’Арк',full_name:'Old Name',admin:true}})).toEqual({firstName:'Олена',lastName:'Д’Арк',displayName:'Олена Д’Арк',email:'sam@example.com'});
    expect(accountProfile({email:'sam@example.com',user_metadata:{given_name:'Mary Jane',family_name:'Watson',name:'Mary Watson'}})).toMatchObject({firstName:'Mary Jane',lastName:'Watson',displayName:'Mary Jane Watson'});
  });
  it('supports legacy names and accounts without a name without blocking their workspace', () => {
    expect(accountProfile({email:'legacy@example.com',user_metadata:{full_name:'Alex Van Dyke'}})).toMatchObject({firstName:'Alex',lastName:'Van Dyke',displayName:'Alex Van Dyke'});
    expect(accountProfile({email:'legacy@example.com'})).toEqual({firstName:'',lastName:'',displayName:'legacy',email:'legacy@example.com'});
    expect(accountProfile({user_metadata:{first_name:{admin:true},last_name:'\0'}}).displayName).toBe('Orbit user');
  });
  it('requires a current password for email identities and linked email/Google accounts', () => {
    expect(profilePasswordMode({app_metadata:{providers:['email']}})).toBe('current-password');
    expect(profilePasswordMode({identities:[{provider:'google'},{provider:'email'}]})).toBe('current-password');
    expect(profilePasswordMode({app_metadata:{providers:['google']}})).toBe('google-reauth');
    expect(profilePasswordMode({user_metadata:{provider:'google'}})).toBe('current-password');
  });
  it('only accepts a recent verified OAuth authentication method for first password creation', () => {
    const now=Date.UTC(2026,9,30,12);
    expect(recentGoogleAuthentication({amr:[{method:'oauth',timestamp:now/1000-60}]},now)).toBe(true);
    for(const amr of [[{method:'oauth',timestamp:now/1000-301}],[{method:'password',timestamp:now/1000}],[{method:'oauth',timestamp:now/1000+61}],[{method:'oauth',timestamp:'recent'}],null])expect(recentGoogleAuthentication({amr},now)).toBe(false);
  });
});
