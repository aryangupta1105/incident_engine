/**
 * API Testing Script
 * Tests the incident management system endpoints
 */

const http = require('http');

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    // Only set Content-Length if there's a body
    if (body) {
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          console.log(`\n[${method} ${path}] Status: ${res.statusCode}`);
          console.log(JSON.stringify(parsed, null, 2));
          resolve(parsed);
        } catch (e) {
          console.log(`\n[${method} ${path}] Status: ${res.statusCode}`);
          console.log(responseData);
          resolve(responseData);
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function testAPI() {
  console.log('=== INCIDENT MANAGEMENT API TESTS ===\n');

  try {
    // Test 1: Health check
    console.log('1️⃣  Testing Health Check...');
    await makeRequest('GET', '/health');

    // Test 2: Create incident via message
    console.log('\n2️⃣  Creating Incident via Message...');
    const incidentResponse = await makeRequest('POST', '/message', {
      text: 'EMI failed for due date 25-Jan-2024'
    });
    const incidentId = incidentResponse.incident?.id;

    if (!incidentId) {
      console.error('❌ Failed to create incident');
      process.exit(1);
    }

    // Test 3: Get incident
    console.log('\n3️⃣  Fetching Incident...');
    await makeRequest('GET', `/incidents/${incidentId}`);

    // Test 4: Acknowledge incident first (required before resolve)
    console.log('\n4️⃣  Acknowledging Incident...');
    await makeRequest('POST', `/incidents/${incidentId}/acknowledge`, {});

    // Test 5: Verify acknowledged
    console.log('\n5️⃣  Verifying Incident is Acknowledged...');
    await makeRequest('GET', `/incidents/${incidentId}`);

    // Test 6: Resolve incident (only valid from ACKNOWLEDGED or ESCALATING)
    console.log('\n6️⃣  Resolving Incident...');
    await makeRequest('POST', `/incidents/${incidentId}/resolve`, {
      resolution_note: 'Paid EMI manually through customer portal'
    });

    // Test 7: Verify resolved
    console.log('\n7️⃣  Verifying Incident is Resolved...');
    await makeRequest('GET', `/incidents/${incidentId}`);

    // Test 8: List all incidents
    console.log('\n8️⃣  Listing All Incidents...');
    await makeRequest('GET', '/incidents?limit=10');

    console.log('\n✅ All tests completed!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
  }
}

// Wait a moment for server to be ready
setTimeout(testAPI, 500);
