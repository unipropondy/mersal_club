const { getPool } = require('./config/db');
async function main() {
  const pool = getPool();
  try {
    // Check PrintMaster
    const r1 = await pool.request().query('SELECT PrinterType, PrinterName, PrinterIP, PrinterPath, IsActive FROM PrintMaster');
    console.log('=== PrintMaster ===');
    console.log(JSON.stringify(r1.recordset, null, 2));
  } catch(e) { console.error('PrintMaster error:', e.message); }
  try {
    // Check recent jobs
    const r2 = await pool.request().query('SELECT TOP 5 JobId, PrinterIp, PrinterName, Status, CreatedOn FROM PrintJobQueue ORDER BY CreatedOn DESC');
    console.log('=== Recent PrintJobQueue ===');
    console.log(JSON.stringify(r2.recordset, null, 2));
  } catch(e) { console.error('PrintJobQueue error:', e.message); }
  try {
    // Check bridge heartbeat
    const r3 = await pool.request().query("SELECT LastBridgeHeartbeat, DATEDIFF(SECOND, LastBridgeHeartbeat, GETDATE()) AS SecsSince FROM CompanySettings WHERE Id = '1'");
    console.log('=== Bridge Heartbeat ===');
    console.log(JSON.stringify(r3.recordset, null, 2));
  } catch(e) { console.error('Heartbeat error:', e.message); }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
