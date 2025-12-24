const pool = require('./db');

async function fix() {
  try {
    // Drop old table
    await pool.query('DROP TABLE IF EXISTS escalations CASCADE');
    console.log('Dropped old escalations table');

    // Recreate with correct schema
    const sql = `
      CREATE TABLE escalations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
        escalation_level INT NOT NULL CHECK (escalation_level > 0),
        status TEXT NOT NULL DEFAULT 'PENDING',
        scheduled_at TIMESTAMP NOT NULL,
        executed_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_escalations_incident_id ON escalations(incident_id);
      CREATE INDEX idx_escalations_status ON escalations(status);
      CREATE INDEX idx_escalations_scheduled_at ON escalations(scheduled_at);
      CREATE INDEX idx_escalations_incident_status ON escalations(incident_id, status);
    `;

    await pool.query(sql);
    console.log('Created new escalations table with correct schema');

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

fix();
