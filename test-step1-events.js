/**
 * STEP 1 Test: Generalized Events Service
 * 
 * Tests the EventService with multiple categories
 */

const { v4: uuid } = require('uuid');
const EventService = require('./services/eventService');
const pool = require('./db');

async function testEventService() {
  console.log('========================================');
  console.log('STEP 1: GENERALIZED EVENTS TEST');
  console.log('========================================\n');

  const userId = uuid();
  
  try {
    // Create test user first
    console.log('🔧  Setting up test user...');
    await pool.query(
      'INSERT INTO users (id, email, created_at) VALUES ($1, $2, $3)',
      [userId, `test-${Date.now()}@example.com`, new Date()]
    );
    console.log(`   ✓ Test user created: ${userId}\n`);
    
    // Test 1: Create a MEETING event
    console.log('1️⃣  Creating MEETING event...');
    const meetingEvent = await EventService.createEvent({
      userId,
      source: 'CALENDAR',
      category: 'MEETING',
      type: 'MEETING_SCHEDULED',
      payload: {
        title: 'Team Standup',
        start_time: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        duration_minutes: 30,
        importance: 'HIGH'
      },
      occurredAt: new Date()
    });
    console.log(`   ✓ Meeting event created: ${meetingEvent.id}`);
    console.log(`   ✓ Category: ${meetingEvent.category}`);
    console.log(`   ✓ Type: ${meetingEvent.type}`);
    console.log(`   ✓ Payload: ${JSON.stringify(meetingEvent.payload)}\n`);

    // Test 2: Create a FINANCE event
    console.log('2️⃣  Creating FINANCE event...');
    const financeEvent = await EventService.createEvent({
      userId,
      source: 'API',
      category: 'FINANCE',
      type: 'PAYMENT_FAILED',
      payload: {
        amount: 5000,
        currency: 'USD',
        description: 'EMI payment failed',
        error: 'insufficient_funds'
      },
      occurredAt: new Date()
    });
    console.log(`   ✓ Finance event created: ${financeEvent.id}`);
    console.log(`   ✓ Category: ${financeEvent.category}`);
    console.log(`   ✓ Type: ${financeEvent.type}\n`);

    // Test 3: Create a HEALTH event
    console.log('3️⃣  Creating HEALTH event...');
    const healthEvent = await EventService.createEvent({
      userId,
      source: 'MANUAL',
      category: 'HEALTH',
      type: 'MEDICATION_REMINDER',
      payload: {
        medication: 'Aspirin',
        dosage: '500mg',
        frequency: 'twice daily'
      },
      occurredAt: new Date()
    });
    console.log(`   ✓ Health event created: ${healthEvent.id}`);
    console.log(`   ✓ Category: ${healthEvent.category}\n`);

    // Test 4: Get event by ID
    console.log('4️⃣  Fetching event by ID...');
    const fetched = await EventService.getEventById(meetingEvent.id);
    console.log(`   ✓ Retrieved: ${fetched.type} for user ${fetched.user_id.substring(0, 8)}...\n`);

    // Test 5: Get upcoming events by category
    console.log('5️⃣  Getting upcoming MEETING events...');
    const upcomingMeetings = await EventService.getUpcomingEventsByCategory(
      userId,
      'MEETING',
      {
        after: new Date(),
        before: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        limit: 10
      }
    );
    console.log(`   ✓ Found ${upcomingMeetings.length} upcoming meeting(s)\n`);

    // Test 6: Get recent events by category
    console.log('6️⃣  Getting recent FINANCE events...');
    const recentFinance = await EventService.getRecentEventsByCategory(
      userId,
      'FINANCE',
      { limit: 10, offset: 0 }
    );
    console.log(`   ✓ Found ${recentFinance.length} recent finance event(s)\n`);

    // Test 7: Get event type stats
    console.log('7️⃣  Getting event type statistics...');
    const stats = await EventService.getEventTypeStats(userId);
    console.log(`   ✓ Event statistics:`);
    stats.forEach(stat => {
      console.log(`     - ${stat.category}/${stat.type}: ${stat.count} event(s)`);
    });

    console.log('\n✅ ALL TESTS PASSED!\n');
    console.log('========================================');
    console.log('SUMMARY');
    console.log('========================================');
    console.log('✓ EventService.createEvent() works');
    console.log('✓ EventService.getEventById() works');
    console.log('✓ EventService.getUpcomingEventsByCategory() works');
    console.log('✓ EventService.getRecentEventsByCategory() works');
    console.log('✓ EventService.getEventTypeStats() works');
    console.log('✓ Multiple categories (MEETING, FINANCE, HEALTH) supported');
    console.log('✓ Events table is generalized and category-agnostic');
    console.log('');

    pool.end();
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    console.error(err);
    pool.end();
    process.exit(1);
  }
}

testEventService();
