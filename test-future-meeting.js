require('dotenv').config();
const pool = require('./db');
const eventService = require('./services/eventService');
const ruleEngine = require('./services/ruleEngine');

(async () => {
  try {
    // Create an event 2 minutes in the future
    const futureTime = new Date(Date.now() + 2 * 60 * 1000);
    
    const event = await eventService.createEvent({
      userId: 'b3c99058-5c51-5e99-9131-7368dfb9123b',
      source: 'CALENDAR',
      category: 'MEETING',
      type: 'MEETING_SCHEDULED',
      payload: {
        title: 'Test Meeting (2 min away)',
        status: 'SCHEDULED',
        start_time: futureTime.toISOString(),
        end_time: new Date(futureTime.getTime() + 60 * 60 * 1000).toISOString(),
        duration_minutes: 60,
        organizer: 'test@example.com',
        attendee_count: 1,
        join_url: null,
        importance: 'HIGH',
        incident_enabled: false,
        calendar_event_id: 'test-future-meeting-' + Date.now()
      },
      occurredAt: futureTime
    });

    console.log('Created test event:', event.id);
    console.log('Meeting time:', futureTime.toISOString());
    console.log('Current time:', new Date().toISOString());

    // Evaluate the event
    console.log('\nEvaluating event with rule engine...');
    const decision = await ruleEngine.evaluateEvent(event);
    
    console.log('\nDecision result:');
    console.log(JSON.stringify(decision, null, 2));

    await pool.end();
  } catch (e) {
    console.error('Error:', e.message);
    console.error(e);
    process.exit(1);
  }
})();
