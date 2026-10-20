const test = require('node:test');
const assert = require('node:assert/strict');
const {validContactPhone, safeProfileURL, onboardingMissing, isDirectoryOptOut} = require('../lib/profile-validation.js');

const student = () => ({name:'A member',email:'member@example.org',phone:'+81 90-1234-5678',bio:'A student finding my community in Japan.',membershipType:'student',university:'Tokyo International University',major:'Digital Business',semester:3});

test('student onboarding requires contact, short bio and semester even with a forged completion flag', () => {
  assert.deepEqual(onboardingMissing(student()), []);
  const incomplete = {...student(), phone:'123', bio:'hi', semester:'3', onboardingComplete:true};
  const missing = onboardingMissing(incomplete);
  assert(missing.includes('contact phone'));
  assert(missing.includes('short bio (10–500 characters)'));
  assert(missing.includes('current semester'));
  assert(onboardingMissing({...student(), semester:14}).includes('current semester'));
  assert.deepEqual(onboardingMissing({...student(), semester:13}), []);
});

test('alumni need graduation details while other membership types do not need a current semester', () => {
  const alumni = {...student(),membershipType:'alumni',semester:'',major:'',graduationYear:2027};
  assert.deepEqual(onboardingMissing(alumni), []);
  assert(onboardingMissing({...alumni,graduationYear:''}).includes('graduation year'));
  assert.deepEqual(onboardingMissing({...student(),membershipType:'community',university:'',major:'',semester:''}), []);
});

test('contact phone preserves international formatting but rejects letters and misplaced plus signs', () => {
  for(const value of ['+81 90-1234-5678','09012345678','+880 (171) 234-5678']) assert.equal(validContactPhone(value),true);
  for(const value of ['call 09012345678','++819012345678','81+9012345678','123456','1234567890123456']) assert.equal(validContactPhone(value),false);
});

test('optional social links reject unsafe schemes, malformed links and embedded credentials', () => {
  assert.equal(safeProfileURL('https://www.instagram.com/member/'), 'https://www.instagram.com/member/');
  assert.equal(safeProfileURL('https://example.org/photo?token=abc'), 'https://example.org/photo?token=abc');
  for(const value of ['javascript:alert(1)','http://example.org','https://','https://name:secret@example.org','https://exam ple.org','//example.org']) assert.equal(safeProfileURL(value),null);
  assert(onboardingMissing({...student(),instagram:'http://instagram.com/member'}).includes('instagram HTTPS link'));
});

test('privacy withdrawal cannot be used to bypass onboarding checks for unrelated edits', () => {
  assert.equal(isDirectoryOptOut({directoryOptIn:false}),true);
  assert.equal(isDirectoryOptOut({directoryOptIn:false,publicFields:['name']}),true);
  assert.equal(isDirectoryOptOut({directoryOptIn:false,name:'Changed'}),false);
  assert.equal(isDirectoryOptOut({directoryOptIn:false,onboardingComplete:true}),false);
  assert.equal(isDirectoryOptOut({directoryOptIn:true}),false);
});
