/**
 * ENTRYPOINT VERIFICATION SCRIPT
 * 
 * This script verifies:
 * 1. Which files are actually loaded
 * 2. Imports are correct
 * 3. Functions exist in memory
 * 4. randomUUID works
 * 5. validateUUID works
 * 
 * Run with: node verify-entrypoint.js
 */

const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { validate: validateUUID } = require('uuid');

console.error('\n🔥🔥🔥 ENTRYPOINT VERIFICATION STARTING 🔥🔥🔥\n');

// 1. Verify working directory
const cwd = process.cwd();
const scriptPath = __filename;
const scriptDir = __dirname;

console.error('📍 RUNTIME LOCATION:');
console.error('   Working directory:', cwd);
console.error('   Script location:', scriptPath);
console.error('   Script directory:', scriptDir);

// 2. Check if critical files exist
console.error('\n📁 FILE EXISTENCE CHECK:');
const criticalFiles = [
  'routes/authRoutes.js',
  'services/googleOAuth.js',
  'app.js',
  'server.js',
  'package.json',
  'db.js'
];

criticalFiles.forEach(file => {
  const fullPath = path.join(scriptDir, file);
  const exists = fs.existsSync(fullPath);
  console.error(`   ${exists ? '✅' : '❌'} ${file} → ${fullPath}`);
});

// 3. Verify authRoutes loads correctly
console.error('\n🔀 LOADING authRoutes:');
try {
  const authRoutes = require('./routes/authRoutes');
  console.error('   ✅ authRoutes loaded successfully');
  console.error('   ✅ router.get exists:', typeof authRoutes.get === 'function' || authRoutes._router !== undefined);
} catch (err) {
  console.error('   ❌ ERROR loading authRoutes:', err.message);
}

// 4. Verify googleOAuth loads correctly
console.error('\n🔒 LOADING googleOAuth:');
try {
  const googleOAuth = require('./services/googleOAuth');
  console.error('   ✅ googleOAuth loaded successfully');
  console.error('   ✅ storeCredentials exists:', typeof googleOAuth.storeCredentials === 'function');
  console.error('   ✅ getCredentials exists:', typeof googleOAuth.getCredentials === 'function');
} catch (err) {
  console.error('   ❌ ERROR loading googleOAuth:', err.message);
}

// 5. Verify randomUUID works
console.error('\n🎲 TESTING randomUUID:');
for (let i = 0; i < 3; i++) {
  const testUuid = randomUUID();
  const isValid = validateUUID(testUuid);
  console.error(`   ${i + 1}. UUID: ${testUuid} | Valid: ${isValid}`);
}

// 6. Verify validateUUID rejects bad values
console.error('\n❌ TESTING validateUUID REJECTION:');
const badValues = ['dev-user-001', 'invalid', '', null, undefined, 123];
badValues.forEach(val => {
  const result = validateUUID(val);
  console.error(`   validateUUID(${JSON.stringify(val)}) = ${result}`);
});

// 7. Read authRoutes source to verify it has randomUUID
console.error('\n📝 VERIFYING authRoutes SOURCE:');
try {
  const authRoutesSource = fs.readFileSync(path.join(scriptDir, 'routes/authRoutes.js'), 'utf8');
  const hasRandomUUID = authRoutesSource.includes('randomUUID');
  const hasImport = authRoutesSource.includes("require('crypto')");
  const hasDev = authRoutesSource.includes("'dev-user-001'") || authRoutesSource.includes('"dev-user-001"');
  
  console.error(`   ${hasRandomUUID ? '✅' : '❌'} Has randomUUID usage`);
  console.error(`   ${hasImport ? '✅' : '❌'} Has crypto import`);
  console.error(`   ${!hasDev ? '✅' : '❌'} No hardcoded "dev-user-001"`);
  
  if (!hasRandomUUID || !hasImport) {
    console.error('\n⚠️  CRITICAL: authRoutes source does NOT have proper UUID generation!');
  }
} catch (err) {
  console.error('   ❌ ERROR reading authRoutes:', err.message);
}

// 8. Read googleOAuth source to verify it has validateUUID
console.error('\n📝 VERIFYING googleOAuth SOURCE:');
try {
  const googleOAuthSource = fs.readFileSync(path.join(scriptDir, 'services/googleOAuth.js'), 'utf8');
  const hasValidateUUID = googleOAuthSource.includes('validateUUID');
  const hasImport = googleOAuthSource.includes("require('uuid')");
  const criticalTrace = googleOAuthSource.includes('[CRITICAL TRACE]');
  
  console.error(`   ${hasValidateUUID ? '✅' : '❌'} Has validateUUID usage`);
  console.error(`   ${hasImport ? '✅' : '❌'} Has uuid import`);
  console.error(`   ${criticalTrace ? '✅' : '❌'} Has CRITICAL TRACE log`);
  
  if (!hasValidateUUID || !hasImport) {
    console.error('\n⚠️  CRITICAL: googleOAuth source does NOT have proper UUID validation!');
  }
} catch (err) {
  console.error('   ❌ ERROR reading googleOAuth:', err.message);
}

// 9. Verify app.js mounts authRoutes
console.error('\n🔗 VERIFYING app.js MOUNTING:');
try {
  const appSource = fs.readFileSync(path.join(scriptDir, 'app.js'), 'utf8');
  const hasAuthRequire = appSource.includes("require('./routes/authRoutes')");
  const hasAuthMount = appSource.includes("app.use('/auth'");
  
  console.error(`   ${hasAuthRequire ? '✅' : '❌'} authRoutes imported`);
  console.error(`   ${hasAuthMount ? '✅' : '❌'} /auth route mounted`);
} catch (err) {
  console.error('   ❌ ERROR reading app.js:', err.message);
}

console.error('\n🔥🔥🔥 VERIFICATION COMPLETE 🔥🔥🔥\n');
console.error('Summary: If all checks pass (✅), the system is configured correctly.');
console.error('If any checks fail (❌), investigate the file content or import order.\n');
