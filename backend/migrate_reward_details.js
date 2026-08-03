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

  // Check if our new columns exist yet
  const colCheck = await pool.request().query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'RewardPointDetails'"
  );
  const existingCols = colCheck.recordset.map(r => r.COLUMN_NAME.toLowerCase());
  console.log('Current RewardPointDetails columns:', existingCols);

  const columnsNeeded = ['memberid', 'settlementid', 'billno', 'billamount', 'pointsearned', 'transtype', 'paymode', 'remarks', 'createdon'];
  const missing = columnsNeeded.filter(c => !existingCols.includes(c));
  console.log('Missing columns:', missing);

  if (missing.length > 0) {
    console.log('\nAdding missing columns to RewardPointDetails...');

    const alterStatements = [];
    if (!existingCols.includes('memberid')) alterStatements.push("ALTER TABLE [dbo].[RewardPointDetails] ADD MemberId UNIQUEIDENTIFIER NULL");
    if (!existingCols.includes('settlementid')) alterStatements.push("ALTER TABLE [dbo].[RewardPointDetails] ADD SettlementId UNIQUEIDENTIFIER NULL");
    if (!existingCols.includes('billno')) alterStatements.push("ALTER TABLE [dbo].[RewardPointDetails] ADD BillNo NVARCHAR(100) NULL");
    if (!existingCols.includes('billamount')) alterStatements.push("ALTER TABLE [dbo].[RewardPointDetails] ADD BillAmount DECIMAL(18,4) NULL DEFAULT 0");
    if (!existingCols.includes('pointsearned')) alterStatements.push("ALTER TABLE [dbo].[RewardPointDetails] ADD PointsEarned DECIMAL(18,4) NOT NULL DEFAULT 0");
    if (!existingCols.includes('transtype')) alterStatements.push("ALTER TABLE [dbo].[RewardPointDetails] ADD TransType NVARCHAR(20) NULL DEFAULT 'EARN'");
    if (!existingCols.includes('paymode')) alterStatements.push("ALTER TABLE [dbo].[RewardPointDetails] ADD PayMode NVARCHAR(50) NULL");
    if (!existingCols.includes('remarks')) alterStatements.push("ALTER TABLE [dbo].[RewardPointDetails] ADD Remarks NVARCHAR(500) NULL");
    if (!existingCols.includes('createdon')) alterStatements.push("ALTER TABLE [dbo].[RewardPointDetails] ADD CreatedOn DATETIME DEFAULT GETDATE()");

    for (const stmt of alterStatements) {
      try {
        await pool.request().query(stmt);
        console.log('✅ Executed:', stmt.substring(0, 80));
      } catch (e) {
        console.log('❌ Failed:', stmt.substring(0, 80), '->', e.message);
      }
    }

    // Optionally add an index on MemberId for faster lookups
    try {
      await pool.request().query(
        "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_RewardPointDetails_MemberId' AND object_id = OBJECT_ID('RewardPointDetails')) " +
        "CREATE NONCLUSTERED INDEX IX_RewardPointDetails_MemberId ON [dbo].[RewardPointDetails](MemberId)"
      );
      console.log('✅ Created index IX_RewardPointDetails_MemberId');
    } catch (e) {
      console.log('Index creation note:', e.message);
    }

    console.log('\n✅ Done! RewardPointDetails now has all required columns.');
  } else {
    console.log('\n✅ All required columns already exist!');
  }

  // Verify final schema
  const finalCols = await pool.request().query(
    "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'RewardPointDetails' ORDER BY ORDINAL_POSITION"
  );
  console.log('\nFinal RewardPointDetails schema:');
  finalCols.recordset.forEach(r => console.log(' -', r.COLUMN_NAME, ':', r.DATA_TYPE));

  await pool.close();
}

run().catch(e => {
  console.error('MIGRATION FAILED:', e.message);
  process.exit(1);
});
