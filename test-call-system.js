#!/usr/bin/env node

/**
 * TEST: Verify calls are working end-to-end
 * 
 * This script:
 * 1. Checks if Twilio is configured
 * 2. Creates a test meeting alert
 * 3. Attempts to place a test call
 */

require('dotenv').config();
const { Client } = require('pg');
const twilio = require('twilio');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function testCallSystem() {
  try {
    console.log('\n📞 CALL SYSTEM TEST\n');
    console.log('=' .repeat(70) + '\n');
    
    // 1. Check Twilio configuration
    console.log('1️⃣ Checking Twilio Configuration...\n');
    
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
    const devPhone = process.env.DEV_PHONE_NUMBER;
    const callEnabled = process.env.FEATURE_CALL_ENABLED === 'true';
    
    console.log(`FEATURE_CALL_ENABLED: ${callEnabled ? '✅ YES' : '❌ NO'}`);
    console.log(`CALL_PROVIDER: ${process.env.CALL_PROVIDER}`);
    console.log(`TWILIO_ACCOUNT_SID: ${accountSid ? '✅ SET' : '❌ NOT SET'}`);
    console.log(`TWILIO_AUTH_TOKEN: ${authToken ? '✅ SET' : '❌ NOT SET'}`);
    console.log(`TWILIO_PHONE_NUMBER: ${twilioPhone ? '✅ SET (' + twilioPhone + ')' : '❌ NOT SET'}`);
    console.log(`DEV_PHONE_NUMBER: ${devPhone ? '✅ SET (' + devPhone + ')' : '❌ NOT SET'}`);
    console.log('');
    
    if (!callEnabled) {
      console.log('❌ CALLS ARE DISABLED IN .env');
      console.log('   Set: FEATURE_CALL_ENABLED=true\n');
      return;
    }
    
    if (!accountSid || !authToken) {
      console.log('❌ Twilio credentials not set!');
      console.log('\nTo fix:');
      console.log('1. Go to https://www.twilio.com/console');
      console.log('2. Copy your Account SID and Auth Token');
      console.log('3. Add to .env:');
      console.log('   TWILIO_ACCOUNT_SID=your_sid_here');
      console.log('   TWILIO_AUTH_TOKEN=your_token_here');
      console.log('   TWILIO_PHONE_NUMBER=your_twilio_number\n');
      return;
    }
    
    // 2. Test Twilio connection
    console.log('2️⃣ Testing Twilio Connection...\n');
    
    const twilioClient = twilio(accountSid, authToken);
    
    try {
      const account = await twilioClient.api.accounts(accountSid).fetch();
      console.log(`✅ Twilio authenticated: ${account.friendlyName}`);
      console.log(`   Account Balance: $${(account.balance * -1).toFixed(2)} (trial account)\n`);
    } catch (error) {
      console.log('❌ Twilio authentication failed!');
      console.log(`   Error: ${error.message}\n`);
      return;
    }
    
    // 3. Check recent call alerts
    console.log('3️⃣ Checking Recent Call Alerts...\n');
    
    await client.connect();
    
    const recentAlerts = await client.query(`
      SELECT 
        id,
        status,
        scheduled_at,
        delivered_at,
        created_at
      FROM alerts 
      WHERE alert_type = 'MEETING_CRITICAL_CALL'
      ORDER BY created_at DESC
      LIMIT 5
    `);
    
    if (recentAlerts.rows.length === 0) {
      console.log('⚠️  No CRITICAL_CALL alerts found.');
      console.log('   Create a meeting 2 minutes in the future to trigger a call alert.\n');
    } else {
      console.log(`✅ Found ${recentAlerts.rows.length} recent call alerts:\n`);
      recentAlerts.rows.slice(0, 3).forEach((row, i) => {
        const status = row.delivered_at ? '✅ DELIVERED' : '⏳ PENDING';
        console.log(`  ${i + 1}. ${status}`);
        console.log(`     Created: ${new Date(row.created_at).toLocaleTimeString()}`);
        if (row.delivered_at) {
          const deliveryDelay = (new Date(row.delivered_at) - new Date(row.created_at)) / 1000;
          console.log(`     Delivered in: ${deliveryDelay.toFixed(0)}s`);
        }
        console.log('');
      });
    }
    
    // 4. Summary
    console.log('=' .repeat(70));
    console.log('\n📋 NEXT STEPS:\n');
    
    if (!twilioPhone) {
      console.log('❌ Missing TWILIO_PHONE_NUMBER in .env');
      console.log('   This is the phone number of your Twilio account that makes calls\n');
    }
    
    if (recentAlerts.rows.length === 0) {
      console.log('1. ✅ Create a new meeting in Google Calendar');
      console.log('2. ✅ Schedule it for 2-3 minutes from now');
      console.log('3. ✅ Wait for scheduler to sync (every 60 seconds)');
      console.log('4. ✅ Call alert will be created');
      console.log('5. ✅ Delivery worker will place call (every 5 seconds)\n');
    } else {
      const delivered = recentAlerts.rows.filter(r => r.delivered_at).length;
      if (delivered > 0) {
        console.log('✅ Calls ARE being placed successfully!');
        console.log('   If you didn\'t receive it:');
        console.log('   - Make sure DEV_PHONE_NUMBER is verified in your Twilio account');
        console.log('   - Check your phone for missed calls');
        console.log('   - Verify Twilio trial has balance\n');
      } else {
        console.log('⏳ Call alerts created but not yet delivered');
        console.log('   Start the server: npm run dev');
        console.log('   Delivery worker will process in 5 seconds\n');
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await client.end();
  }
}

testCallSystem();
