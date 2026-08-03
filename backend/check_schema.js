require('dotenv').config({ path: __dirname + '/.env' });
const sql = require('mssql');

const config = {
  server: process.env.DB_SERVER || 'myerpcloud.dyndns.org',
  port: parseInt(process.env.DB_PORT || '9199'),
  database: process.env.DB_NAME || 'UCSMERSAL',
  user: process.env.DB_USER || 'ups',
  password: process.env.DB_PASSWORD,
  options: { encrypt: false, trustServerCertificate: true },
  connectionTimeout: 20000
};

async function run() {
  const pool = await sql.connect(config);

  // Check RewardPointDetails actual columns
  const rpd = await pool.request().query(
    "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'RewardPointDetails' ORDER BY ORDINAL_POSITION"
  );
  console.log('\n===== RewardPointDetails ACTUAL columns =====');
  rpd.recordset.forEach(r => console.log(' -', r.COLUMN_NAME, ':', r.DATA_TYPE));

  // Check SettlementHeader actual columns
  const sh = await pool.request().query(
    "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SettlementHeader' ORDER BY ORDINAL_POSITION"
  );
  console.log('\n===== SettlementHeader ACTUAL columns =====');
  sh.recordset.forEach(r => console.log(' -', r.COLUMN_NAME, ':', r.DATA_TYPE));

  // Get ALL rows from RewardPointDetails to see what's there
  try {
    const allRows = await pool.request().query('SELECT TOP 50 * FROM RewardPointDetails ORDER BY 9 DESC');
    console.log('\n===== RewardPointDetails ALL ROWS =====');
    if (allRows.recordset.length === 0) {
      console.log('>>> EMPTY — no reward points logged at all!');
    } else {
      console.table(allRows.recordset);
    }
  } catch (e) {
    console.log('Could not read RewardPointDetails:', e.message);
  }

  // Get recent settlements
  try {
    const recent = await pool.request().query(
      'SELECT TOP 10 BillNo, MemberId, LastSettlementDate FROM SettlementHeader WHERE MemberId IS NOT NULL ORDER BY LastSettlementDate DESC'
    );
    console.log('\n===== Recent Settlements with MemberId =====');
    if (recent.recordset.length === 0) {
      console.log('>>> NO settlements have MemberId — memberId is NOT being saved to SettlementHeader during checkout!');
    } else {
      console.table(recent.recordset);
    }
  } catch (e) {
    console.log('Settlement MemberId query error:', e.message);
  }

  await pool.close();
}

run().catch(e => {
  console.error('SCHEMA CHECK FAILED:', e.message);
  process.exit(1);
});
