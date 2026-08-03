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

async function diagnose() {
  console.log('Connecting to DB:', config.server, config.database);
  const pool = await sql.connect(config);

  console.log('\n====== 1. RewardMaster Active Rules ======');
  const rules = await pool.request().query('SELECT * FROM RewardMaster ORDER BY Id DESC');
  console.table(rules.recordset);

  console.log('\n====== 2. MemberMaster - All Members Reward Credit ======');
  const members = await pool.request().query(
    'SELECT MemberId, Name, Phone, ISNULL(RewardCredit, 0) AS RewardCredit, CurrentBalance, IsActive FROM MemberMaster ORDER BY RewardCredit DESC'
  );
  console.table(members.recordset);

  console.log('\n====== 3. RewardPointDetails - All Logs ======');
  try {
    const logs = await pool.request().query(
      'SELECT TOP 50 rpd.BillNo, rpd.BillAmount, rpd.PointsEarned, rpd.PointsUsed, rpd.TransType, rpd.Remarks, rpd.CreatedOn, mm.Name ' +
      'FROM RewardPointDetails rpd LEFT JOIN MemberMaster mm ON rpd.MemberId = mm.MemberId ORDER BY rpd.CreatedOn DESC'
    );
    if (logs.recordset.length === 0) {
      console.log('>>> NO ROWS IN RewardPointDetails — Points are NOT being saved!');
    } else {
      console.table(logs.recordset);
    }
  } catch (e) {
    console.log('RewardPointDetails query error:', e.message);
  }

  console.log('\n====== 4. Recent Settlements with MemberId (SettlementHeader) ======');
  const settleCols = await pool.request().query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SettlementHeader'"
  );
  const colNames = settleCols.recordset.map(r => r.COLUMN_NAME.toLowerCase());
  console.log('SettlementHeader columns containing "member":', colNames.filter(c => c.includes('member')));

  if (colNames.includes('memberid')) {
    const sales = await pool.request().query(
      'SELECT TOP 10 BillNo, MemberId, TotalAmount, LastSettlementDate FROM SettlementHeader WHERE MemberId IS NOT NULL ORDER BY LastSettlementDate DESC'
    );
    if (sales.recordset.length === 0) {
      console.log('>>> NO rows with MemberId in SettlementHeader! memberId is not being saved during checkout.');
    } else {
      console.table(sales.recordset);
    }
  } else {
    console.log('>>> SettlementHeader does NOT have a MemberId column!');
  }

  console.log('\n====== 5. Check if RewardMaster has any active row ======');
  const activeRule = await pool.request().query('SELECT COUNT(*) AS cnt FROM RewardMaster WHERE IsActive = 1');
  console.log('Active rules count:', activeRule.recordset[0].cnt);

  console.log('\n====== 6. Recent settlements (last 5) to cross-check timing ======');
  const recent = await pool.request().query(
    'SELECT TOP 5 BillNo, TotalAmount, LastSettlementDate FROM SettlementHeader ORDER BY LastSettlementDate DESC'
  );
  console.table(recent.recordset);

  await pool.close();
  console.log('\n===== DIAGNOSTIC COMPLETE =====');
}

diagnose().catch(e => {
  console.error('DIAGNOSTIC FAILED:', e.message);
  process.exit(1);
});
