#!/usr/bin/env node

/**
 * DIAGNOSTIC: Why is the call not being placed?
 * 
 * This script checks:
 * 1. If call alerts are being created
 * 2. If they're being marked for delivery
 * 3. If there are any errors
 */

require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function diagnose() {
  try {
    await client.connect();
    
    console.log('\n🔍 CALL ALERT DIAGNOSTIC\n');
    console.log('=' .repeat(60));
    
    // 1. Check if any CRITICAL_CALL alerts exist
    console.log('\n1️⃣ Checking for CRITICAL_CALL alerts...\n');
    const callAlerts = await client.query(`
      SELECT 
        id, 
        event_id,
        alert_type,
        scheduled_at,
        delivered_at,
        cancelled_at,
        status,
        created_at
      FROM alerts 
      WHERE alert_type = 'MEETING_CRITICAL_CALL'
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    if (callAlerts.rows.length === 0) {
      console.log('❌ NO CRITICAL_CALL ALERTS FOUND!');
      console.log('\n⚠️  This means the alerts are NOT being created.');
      console.log('Possible causes:');
      console.log('  1. Meeting is not within 2-minute call window');
      console.log('  2. Rules engine is not triggering call alerts');
      console.log('  3. Meeting is too far in the future');
      console.log('\nCheck the rules.js file to see when calls are scheduled.');
    } else {
      console.log(`✅ Found ${callAlerts.rows.length} CRITICAL_CALL alerts:\n`);
      
      callAlerts.rows.forEach((alert, i) => {
        console.log(`Alert ${i + 1}:`);
        console.log(`  ID: ${alert.id}`);
        console.log(`  Status: ${alert.status}`);
        console.log(`  Scheduled At: ${alert.scheduled_at}`);
        console.log(`  Delivered At: ${alert.delivered_at || 'NOT YET'}`);
        console.log(`  Cancelled At: ${alert.cancelled_at || 'NOT CANCELLED'}`);
        console.log(`  Created At: ${alert.created_at}`);
        console.log('');
      });
    }
    
    // 2. Check recent events to see if meetings were created
    console.log('\n2️⃣ Checking recent MEETING events...\n');
    const events = await client.query(`
      SELECT 
        id,
        category,
        user_id,
        meeting_start_time,
        created_at
      FROM events 
      WHERE category = 'MEETING'
      ORDER BY created_at DESC
      LIMIT 5
    `);
    
    if (events.rows.length === 0) {
      console.log('❌ NO MEETING EVENTS FOUND!');
      console.log('This means meetings are not being synced from calendar.');
    } else {
      console.log(`✅ Found ${events.rows.length} recent meetings:\n`);
      events.rows.forEach((event, i) => {
        const meetingTime = new Date(event.meeting_start_time);
        const now = new Date();
        const minutesUntilStart = (meetingTime - now) / (1000 * 60);
        
        console.log(`Meeting ${i + 1}:`);
        console.log(`  ID: ${event.id}`);
        console.log(`  Category: ${event.category}`);
        console.log(`  Starts At: ${event.meeting_start_time}`);
        console.log(`  Minutes Until Start: ${minutesUntilStart.toFixed(2)}`);
        console.log(`  Created At: ${event.created_at}`);
        console.log('');
      });
    }
    
    // 3. Check alert counts by type for most recent meeting
    console.log('\n3️⃣ Alert distribution for most recent meeting...\n');
    if (events.rows.length > 0) {
      const recentEventId = events.rows[0].id;
      const alertCounts = await client.query(`
        SELECT 
          alert_type,
          COUNT(*) as count,
          COUNT(CASE WHEN delivered_at IS NOT NULL THEN 1 END) as delivered,
          COUNT(CASE WHEN cancelled_at IS NOT NULL THEN 1 END) as cancelled
        FROM alerts
        WHERE event_id = $1
        GROUP BY alert_type
      `, [recentEventId]);
      
      if (alertCounts.rows.length === 0) {
        console.log('❌ NO ALERTS for most recent meeting!');
        console.log('This meeting has no alerts scheduled at all.');
      } else {
        console.log(`✅ Alerts for event ${recentEventId}:\n`);
        alertCounts.rows.forEach(row => {
          console.log(`${row.alert_type}:`);
          console.log(`  Total: ${row.count}`);
          console.log(`  Delivered: ${row.delivered}`);
          console.log(`  Cancelled: ${row.cancelled}`);
          console.log('');
        });
      }
    }
    
    // 4. Check for any errors in recent alert processing
    console.log('\n4️⃣ Checking for pending CRITICAL_CALL alerts...\n');
    const pending = await client.query(`
      SELECT 
        id,
        status,
        scheduled_at,
        created_at
      FROM alerts 
      WHERE alert_type = 'MEETING_CRITICAL_CALL'
      AND status = 'PENDING'
      AND scheduled_at < NOW()
      ORDER BY scheduled_at
    `);
    
    if (pending.rows.length > 0) {
      console.log(`⚠️  Found ${pending.rows.length} OVERDUE PENDING calls:\n`);
      console.log('These should have been delivered but weren\'t!\n');
      pending.rows.forEach(row => {
        const timeSinceScheduled = (new Date() - new Date(row.scheduled_at)) / 1000;
        console.log(`  ID: ${row.id}`);
        console.log(`  Scheduled: ${row.scheduled_at}`);
        console.log(`  Overdue by: ${timeSinceScheduled.toFixed(0)} seconds`);
        console.log('');
      });
    } else {
      console.log('✅ No overdue pending calls');
    }
    
    // 5. Summary and recommendations
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 DIAGNOSIS SUMMARY\n');
    
    if (callAlerts.rows.length === 0) {
      console.log('🔴 PROBLEM: Call alerts are NOT being created\n');
      console.log('SOLUTIONS:');
      console.log('1. Check meeting is within 2-minute window before start');
      console.log('2. Verify rules.js has call alert rule enabled');
      console.log('3. Check meeting is not marked as cancelled');
      console.log('4. Monitor logs: look for "[RULE_ENGINE]" entries');
    } else {
      const deliveredCount = callAlerts.rows.filter(a => a.delivered_at).length;
      if (deliveredCount === 0) {
        console.log('🟡 PROBLEM: Call alerts created but NOT delivered\n');
        console.log('SOLUTIONS:');
        console.log('1. Check delivery worker is running');
        console.log('2. Verify Twilio credentials in .env');
        console.log('3. Check Twilio phone number is verified (trial accounts only)');
        console.log('4. Monitor logs: look for "[CALL]" entries');
        console.log('5. Check for: "[ERROR]" in logs');
      } else {
        console.log('🟢 Call alerts are being delivered');
        if (deliveredCount < callAlerts.rows.length) {
          console.log(`Note: ${callAlerts.rows.length - deliveredCount} alerts still pending`);
        }
      }
    }
    
    console.log('\n');
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error.message);
  } finally {
    await client.end();
  }
}

diagnose();
