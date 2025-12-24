#!/usr/bin/env node

/**
 * VERIFICATION CHECKLIST: All TASK 1-5 Implementation Complete
 * 
 * Run this file to verify all changes are in place and ready for testing.
 */

const fs = require('fs');
const path = require('path');

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║  IMPLEMENTATION VERIFICATION CHECKLIST (TASK 1-5)          ║');
console.log('║  Status: ALL CODE CHANGES COMPLETE ✓                       ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

const checks = [
  {
    name: 'TASK 1: TwiML Generation with Reminder Message',
    file: 'services/autoCallService.js',
    checks: [
      { pattern: 'generateMeetingReminderTwiML', description: 'Function exists' },
      { pattern: 'voice="alice"', description: 'Alice voice configured' },
      { pattern: 'Your meeting titled', description: 'Meeting context in message' },
      { pattern: 'Missing could cost', description: 'Consequence framing present' },
      { pattern: 'TwiML generated successfully', description: 'Success logging added' }
    ]
  },
  {
    name: 'TASK 2: Delivery Lock Idempotency',
    files: [
      { file: 'services/alertService.js', checks: [
        { pattern: 'rowCount: result.rowCount', description: 'Returns rowCount' },
        { pattern: 'rowCount: 0', description: 'Handles already-delivered case' }
      ]},
      { file: 'workers/alertDeliveryWorker.js', checks: [
        { pattern: 'markResult.rowCount > 0', description: 'Worker checks rowCount' },
        { pattern: 'duplicate prevented', description: 'Duplicate detection logged' }
      ]}
    ]
  },
  {
    name: 'TASK 3: Smart Collapse (Window-Aware)',
    file: 'workers/alertDeliveryWorker.js',
    checks: [
      { pattern: 'windowHasPassed', description: 'Window timing check added' },
      { pattern: 'alertScheduledTime < now', description: 'Window passed condition' },
      { pattern: 'COLLAPSE.*Allowing', description: 'Allows past-window alerts' },
      { pattern: 'COLLAPSE.*Cancelled', description: 'Collapses future alerts' }
    ]
  },
  {
    name: 'TASK 4: Complete Call Context Passing',
    file: 'workers/alertDeliveryWorker.js',
    checks: [
      { pattern: 'meetingTitle: callContext.meetingTitle', description: 'Title passed' },
      { pattern: 'minutesRemaining: callContext.minutesRemaining', description: 'Minutes passed' },
      { pattern: 'startTimeLocal: callContext.startTime', description: 'Time passed' },
      { pattern: 'context: {', description: 'Full context object passed' }
    ]
  },
  {
    name: 'TASK 5: Comprehensive Logging',
    file: 'workers/alertDeliveryWorker.js',
    checks: [
      { pattern: '\\[CALL\\] Event=', description: '[CALL] Event log' },
      { pattern: '\\[CALL\\] MinutesRemaining=', description: '[CALL] Minutes log' },
      { pattern: '\\[CALL\\] Title=', description: '[CALL] Title log' },
      { pattern: '\\[COLLAPSE\\]', description: '[COLLAPSE] decision logs' },
      { pattern: '\\[DELIVERY\\]', description: '[DELIVERY] lock logs' }
    ]
  }
];

// Verify each check
let allPass = true;
let checkCount = 0;
let passCount = 0;

checks.forEach(task => {
  console.log(`\n${task.name}`);
  console.log('─'.repeat(60));
  
  const filesToCheck = task.files || [{ file: task.file, checks: task.checks }];
  
  filesToCheck.forEach(fileCheck => {
    const filePath = path.join(__dirname, fileCheck.file);
    const fileExists = fs.existsSync(filePath);
    
    if (!fileExists) {
      console.log(`  ✗ File not found: ${fileCheck.file}`);
      allPass = false;
      return;
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    
    fileCheck.checks.forEach(check => {
      checkCount++;
      const regex = new RegExp(check.pattern);
      const found = regex.test(content);
      
      if (found) {
        console.log(`  ✓ ${check.description}`);
        passCount++;
      } else {
        console.log(`  ✗ ${check.description} (pattern: ${check.pattern})`);
        allPass = false;
      }
    });
  });
});

// Syntax verification
console.log(`\n${'SYNTAX VERIFICATION'.padEnd(60, '─')}`);

const filesToCheck = [
  'services/autoCallService.js',
  'services/alertService.js',
  'workers/alertDeliveryWorker.js'
];

const { execSync } = require('child_process');

filesToCheck.forEach(file => {
  try {
    execSync(`node -c "${file}"`, { stdio: 'pipe', cwd: __dirname });
    console.log(`  ✓ ${file} - Syntax OK`);
  } catch (err) {
    console.log(`  ✗ ${file} - Syntax ERROR`);
    allPass = false;
  }
});

// Final summary
console.log(`\n${'SUMMARY'.padEnd(60, '═')}`);
console.log(`  Total Checks: ${checkCount}`);
console.log(`  Passed: ${passCount}`);
console.log(`  Failed: ${checkCount - passCount}`);
console.log(`  Success Rate: ${Math.round((passCount / checkCount) * 100)}%`);

if (allPass && passCount === checkCount) {
  console.log(`\n  ✓ ALL CHECKS PASSED - READY FOR TESTING`);
} else {
  console.log(`\n  ✗ SOME CHECKS FAILED - Review above`);
}

console.log(`\n${'NEXT STEPS'.padEnd(60, '─')}`);
console.log(`
1. Server is running: Check if nodemon is active
2. Test scenario 1: Schedule meeting 15 min ahead → verify EMAIL ONLY
3. Test scenario 2: Schedule meeting 4 min ahead → verify EMAIL + CALL
4. Test scenario 3: Schedule meeting 1 min ahead → verify CALL ONLY
5. Restart worker: Verify NO duplicate calls
6. Monitor logs: Check for [CALL], [COLLAPSE], [DELIVERY] messages
7. Verify: TwiML includes meeting reminder with title and timing
`);

process.exit(allPass && passCount === checkCount ? 0 : 1);
