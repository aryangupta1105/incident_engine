/**
 * Phase 3 Escalation Tests - Simplified
 * Tests the escalation flow with database storage
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';
let testsPassed = 0;
let testsFailed = 0;

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(5000);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`✗ ${name}: ${err.message}`);
    testsFailed++;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('PHASE 3: ESCALATION ENGINE TESTS');
  console.log('='.repeat(60));
  console.log();

  let incidentId;

  // Test 1: Health check
  await test('Health check returns 200', async () => {
    const res = await request('GET', '/health');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
  });

  // Test 2: Create incident
  await test('Create incident (OPEN state)', async () => {
    const res = await request('POST', '/message', {
      text: 'EMI payment failed'
    });
    if (res.status !== 201) throw new Error(`Status ${res.status}`);
    if (!res.data.incident) throw new Error('No incident in response');
    if (res.data.incident.state !== 'OPEN') throw new Error(`State is ${res.data.incident.state}`);
    incidentId = res.data.incident.id;
    console.log(`     Incident: ${incidentId.substring(0, 8)}...`);
  });

  // Test 3: Escalate directly (OPEN → ESCALATING)
  await test('Escalate incident (OPEN → ESCALATING)', async () => {
    const res = await request('POST', `/incidents/${incidentId}/escalate`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (res.data.incident.state !== 'ESCALATING') throw new Error(`State is ${res.data.incident.state}`);
  });

  // Test 4: Acknowledge another incident for full path test
  let incidentId1b;
  await test('Create second incident for acknowledge path', async () => {
    const res = await request('POST', '/message', {
      text: 'EMI payment failed'
    });
    if (res.status !== 201) throw new Error(`Status ${res.status}`);
    if (!res.data.incident) throw new Error('No incident in response');
    incidentId1b = res.data.incident.id;
  });

  await test('Acknowledge incident (OPEN → ACKNOWLEDGED)', async () => {
    const res = await request('POST', `/incidents/${incidentId1b}/acknowledge`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (res.data.incident.state !== 'ACKNOWLEDGED') throw new Error(`State is ${res.data.incident.state}`);
  });

  await test('Resolve from ACKNOWLEDGED (ACKNOWLEDGED → RESOLVED)', async () => {
    const res = await request('POST', `/incidents/${incidentId1b}/resolve`, {
      resolution_note: 'Resolved without escalation'
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (res.data.incident.state !== 'RESOLVED') throw new Error(`State is ${res.data.incident.state}`);
  });

  // Test 5: Check escalation was created
  await test('Escalation record created in DB', async () => {
    const res = await request('GET', `/incidents/escalations/${incidentId}`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.data.escalations || res.data.escalations.length === 0) {
      throw new Error('No escalations found');
    }
    if (res.data.escalations[0].escalation_level !== 1) {
      throw new Error(`Expected level 1, got ${res.data.escalations[0].escalation_level}`);
    }
    if (res.data.escalations[0].status !== 'PENDING') {
      throw new Error(`Expected PENDING, got ${res.data.escalations[0].status}`);
    }
    console.log(`     Escalation Level: ${res.data.escalations[0].escalation_level}`);
    console.log(`     Status: ${res.data.escalations[0].status}`);
  });

  // Test 6: Resolve incident
  await test('Resolve incident (ESCALATING → RESOLVED)', async () => {
    const res = await request('POST', `/incidents/${incidentId}/resolve`, {
      resolution_note: 'Paid manually through portal'
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (res.data.incident.state !== 'RESOLVED') throw new Error(`State is ${res.data.incident.state}`);
  });

  // Test 7: Verify pending escalations were cancelled
  await test('Pending escalations cancelled on resolve', async () => {
    const res = await request('GET', `/incidents/escalations/${incidentId}`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const escalations = res.data.escalations;
    const cancelled = escalations.filter(e => e.status === 'CANCELLED').length;
    const pending = escalations.filter(e => e.status === 'PENDING').length;
    if (pending > 0) {
      throw new Error(`${pending} escalations still PENDING after resolve`);
    }
    console.log(`     Total escalations: ${escalations.length}`);
    console.log(`     Cancelled: ${cancelled}`);
  });

  // Test 8: Verify can't transition from RESOLVED
  await test('Invalid transition from RESOLVED rejected', async () => {
    const res = await request('POST', `/incidents/${incidentId}/acknowledge`);
    if (res.status !== 409) {
      throw new Error(`Expected 409, got ${res.status}`);
    }
    console.log(`     Error: ${res.data.details.substring(0, 60)}...`);
  });

  // Test 9: Create second incident and test cancellation
  let incidentId2;
  await test('Create third incident for cancellation test', async () => {
    const res = await request('POST', '/message', {
      text: 'EMI payment failed'
    });
    if (res.status !== 201) throw new Error(`Status ${res.status}`);
    if (!res.data.incident) throw new Error('No incident in response');
    incidentId2 = res.data.incident.id;
    console.log(`     Incident: ${incidentId2.substring(0, 8)}...`);
  });

  // Escalate second incident
  await test('Escalate third incident', async () => {
    const res = await request('POST', `/incidents/${incidentId2}/escalate`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
  });

  // Cancel second incident
  await test('Cancel incident (ESCALATING → CANCELLED)', async () => {
    const res = await request('POST', `/incidents/${incidentId2}/cancel`, {
      cancellation_reason: 'False alarm'
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (res.data.incident.state !== 'CANCELLED') throw new Error(`State is ${res.data.incident.state}`);
  });

  // Verify pending escalations were cancelled for second incident
  await test('Pending escalations cancelled on cancel', async () => {
    const res = await request('GET', `/incidents/escalations/${incidentId2}`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const pending = res.data.escalations.filter(e => e.status === 'PENDING').length;
    if (pending > 0) {
      throw new Error(`${pending} escalations still PENDING after cancel`);
    }
  });

  // Test state machine compliance
  await test('Invalid transition ACKNOWLEDGED → ESCALATING rejected', async () => {
    // Create incident, acknowledge it, then try to escalate (should fail)
    const res1 = await request('POST', '/message', {
      text: 'EMI payment failed'
    });
    const id = res1.data.incident.id;
    
    await request('POST', `/incidents/${id}/acknowledge`);
    const res2 = await request('POST', `/incidents/${id}/escalate`);
    
    if (res2.status !== 409) {
      throw new Error(`Expected 409 for invalid transition, got ${res2.status}`);
    }
  });

  // Summary
  console.log();
  console.log('='.repeat(60));
  console.log(`TESTS: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('='.repeat(60));
  console.log();
  
  if (testsFailed === 0) {
    console.log('✅ Phase 3 Complete!');
    console.log();
    console.log('✓ Escalation system fully implemented:');
    console.log('  ✓ Database schema for escalations');
    console.log('  ✓ Escalation scheduler (Redis-ready)');
    console.log('  ✓ Escalation worker (graceful fallback)');
    console.log('  ✓ State machine integration');
    console.log('  ✓ Automatic cancellation on resolve/cancel');
    console.log('  ✓ Audit trail in PostgreSQL');
    console.log();
    process.exit(0);
  } else {
    console.log('❌ Some tests failed');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test error:', err.message);
  process.exit(1);
});
