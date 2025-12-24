#!/usr/bin/env node

/**
 * SIMPLIFIED DIAGNOSTIC: Why are calls not working?
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
    console.log('=' .repeat(70));
    
    // Check RECENT calls (last 30 minutes)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    console.log(`\n📋 Alerts created in last 30 minutes (since ${thirtyMinutesAgo.toLocaleTimeString()}):\n`);
    
    const recentAlerts = await client.query(`
      SELECT 
        alert_type,
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'DELIVERED' THEN 1 END) as delivered,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelled
      FROM alerts 
      WHERE created_at > $1
      GROUP BY alert_type
      ORDER BY alert_type
    `, [thirtyMinutesAgo]);
    
    if (recentAlerts.rows.length === 0) {
      console.log('❌ NO ALERTS created in the last 30 minutes!\n');
      console.log('This means:');
      console.log('  1. Calendar sync is not working, OR');
      console.log('  2. No meetings scheduled, OR');
      console.log('  3. Rules engine is not firing\n');
    } else {
      console.log('✅ Alert summary:\n');
      recentAlerts.rows.forEach(row => {
        console.log(`${row.alert_type}:`);
        console.log(`  Total: ${row.total} | Delivered: ${row.delivered} | Pending: ${row.pending} | Cancelled: ${row.cancelled}`);
        console.log('');
      });
    }
    
    // Check for CRITICAL_CALL specifically
    const callAlerts = await client.query(`
      SELECT 
        id,
        status,
        scheduled_at,
        delivered_at,
        created_at
      FROM alerts 
      WHERE alert_type = 'MEETING_CRITICAL_CALL'
      AND created_at > $1
      ORDER BY created_at DESC
    `, [thirtyMinutesAgo]);
    
    console.log('=' .repeat(70));
    console.log('\n🔴 CRITICAL_CALL Alerts Analysis:\n');
    
    if (callAlerts.rows.length === 0) {
      console.log('❌ NO CRITICAL_CALL alerts in last 30 minutes\n');
      console.log('Why calls aren\'t being scheduled:');
      console.log('  1. Meetings are NOT being created');
      console.log('  2. Meetings are too far in the future (> 2 min window)');
      console.log('  3. Rules for call alerts are disabled');
      console.log('\nCheck logs for: "[RULE_ENGINE]" entries');
    } else {
      console.log(`Found ${callAlerts.rows.length} CRITICAL_CALL alerts:\n`);
      
      const delivered = callAlerts.rows.filter(a => a.status === 'DELIVERED').length;
      const pending = callAlerts.rows.filter(a => a.status === 'PENDING').length;
      
      console.log(`Status: ${delivered} Delivered | ${pending} Pending`);
      console.log('');
      
      if (pending > 0) {
        console.log('⚠️  Pending alerts (not yet called):');
        callAlerts.rows.filter(a => a.status === 'PENDING').forEach(row => {
          const timeUntilScheduled = (new Date(row.scheduled_at) - Date.now()) / 1000 / 60;
          console.log(`  - Scheduled for: ${new Date(row.scheduled_at).toLocaleTimeString()} (in ${timeUntilScheduled.toFixed(1)} minutes)`);
        });
        console.log('');
      }
      
      if (delivered > 0) {
        console.log('✅ Successfully delivered alerts:');
        callAlerts.rows.filter(a => a.status === 'DELIVERED').slice(0, 3).forEach(row => {
          const deliveryTime = (new Date(row.delivered_at) - new Date(row.scheduled_at)) / 1000;
          console.log(`  - Delivered in ${deliveryTime.toFixed(0)} seconds of scheduling`);
        });
        console.log('');
      }
    }
    
    // Check if Twilio is configured
    console.log('=' .repeat(70));
    console.log('\n📱 Environment Check:\n');
    
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
    const callProvider = process.env.CALL_PROVIDER;
    const callEnabled = process.env.FEATURE_CALL_ENABLED;
    const devPhone = process.env.DEV_PHONE_NUMBER;
    
    console.log(`CALL_PROVIDER: ${callProvider || '❌ NOT SET'}`);
    console.log(`FEATURE_CALL_ENABLED: ${callEnabled}`);
    console.log(`TWILIO_PHONE_NUMBER: ${twilioPhone ? '✅ SET' : '❌ NOT SET'}`);
    console.log(`DEV_PHONE_NUMBER: ${devPhone ? '✅ SET' : '❌ NOT SET'}`);
    console.log('');
    
    // Final diagnosis
    console.log('=' .repeat(70));
    console.log('\n📊 DIAGNOSIS:\n');
    
    if (callAlerts.rows.length === 0) {
      console.log('🔴 ISSUE: Call alerts not being created\n');
      console.log('ACTION: Check if meetings are being scheduled within the call window');
      console.log('       (2 minutes before meeting start)');
    } else if (callAlerts.rows.every(a => a.status === 'PENDING')) {
      console.log('🟡 ISSUE: Call alerts created but not delivered\n');
      console.log('ACTION 1: Start the server: npm run dev');
      console.log('ACTION 2: Wait for delivery worker to process (5-second intervals)');
      console.log('ACTION 3: Check logs for [CALL] and [ERROR] entries');
    } else {
      console.log('✅ GOOD: Calls are being scheduled and delivered!\n');
      console.log('If you didn\'t receive the call:');
      console.log('  1. Check DEV_PHONE_NUMBER is a verified Twilio number');
      console.log('  2. Check Twilio trial account has enough balance');
      console.log('  3. Monitor logs for any API errors');
    }
    
    console.log('\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

diagnose();
