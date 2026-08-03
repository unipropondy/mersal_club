const { poolPromise } = require('./config/db');

async function test() {
  try {
    const pool = await poolPromise;

    // 1. Dump DateEntry
    const dateEntry = await pool.request().query("SELECT * FROM DateEntry");
    console.log("--- DateEntry Content ---");
    console.log(dateEntry.recordset);

    // 2. Dump BusinessDayLog (last 5 rows)
    const dayLog = await pool.request().query("SELECT TOP 5 * FROM BusinessDayLog ORDER BY BusinessDate DESC");
    console.log("\n--- BusinessDayLog Content (TOP 5) ---");
    console.log(dayLog.recordset);

    // 3. Dump ArtistBonusTransaction (last 5 rows)
    const bonusTxns = await pool.request().query("SELECT TOP 5 * FROM ArtistBonusTransaction ORDER BY CreatedDate DESC");
    console.log("\n--- ArtistBonusTransaction Content (TOP 5) ---");
    console.log(bonusTxns.recordset);

  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

test();
