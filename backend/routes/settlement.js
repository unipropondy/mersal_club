const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../config/db");

// ===== TOTAL SALES =====
router.get("/total-sales/:terminal", async (req, res) => {
  try {
    console.log("🔥🔥🔥 TOTAL SALES ROUTE HIT NEW FILE");
    const { fromDate, toDate } = req.query;
    const pool = await poolPromise;
    const request = pool.request();

    let dateFilter = "start_date = CAST(GETDATE() AS DATE)";

    if (fromDate && toDate) {
      const fDate = fromDate.replace(/[^0-9T:.-]/g, '');
      const tDate = toDate.replace(/[^0-9T:.-]/g, '');
      dateFilter = `start_date BETWEEN CAST('${fDate}' AS DATE) AND CAST('${tDate}' AS DATE)`;
    }
    console.log("🔥🔥🔥 TOTAL SALES ROUTE HIT NEW FILE,fromDate", fromDate);
    console.log("🔥🔥🔥 TOTAL SALES ROUTE HIT NEW FILE,toDate", toDate);
    const result = await request.query(`
      SELECT
        ISNULL(SUM(SubTotal),0) AS SubTotal,
        ISNULL(SUM(DiscountAmount),0) AS DiscountAmount,
        ISNULL(SUM(VIPDiscountAmount),0) AS VIPDiscountAmount,
        ISNULL(SUM(ServiceCharge),0) AS ServiceCharge,
        ISNULL(SUM(TotalTax),0) AS TotalTax,
        ISNULL(SUM(RoundedBy),0) AS RoundedBy,
        COUNT(*) AS InvoiceCount,
        ISNULL(SUM(SysAmount),0) AS NetTotal
      FROM SettlementHeader
      WHERE IsCancelled = 0 AND ${dateFilter}
    `);
    const data = result.recordset[0] || {};
    console.log("🔥 TOTAL SALES API =>", data);
    res.json(data);
  } catch (err) {
    console.error("❌ TOTAL SALES ERROR:", err);
    res.status(500).send(err.message);
  }
});

// ===== PAYMENT DETAILS =====
router.get("/payment/:terminal/:userId", async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const pool = await poolPromise;
    const request = pool.request();

    request.input("UserId", sql.VarChar, req.params.userId);

    let dateFilter = "start_date = CAST(GETDATE() AS DATE)";
    if (fromDate && toDate) {
      const fDate = fromDate.replace(/[^0-9T:.-]/g, '');
      const tDate = toDate.replace(/[^0-9T:.-]/g, '');
      dateFilter = `start_date BETWEEN CAST('${fDate}' AS DATE) AND CAST('${tDate}' AS DATE)`;
    }

    const result = await request.query(`
      SELECT
        CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(Remarks, '')))) = 'CAS' THEN 'CASH' ELSE LTRIM(RTRIM(ISNULL(Remarks, ''))) END AS PaymodeName,
        ISNULL(SUM(Amount), 0) AS Amount,
        COUNT(*) AS PayCount
      FROM PaymentDetailCur
      WHERE ${dateFilter}
      GROUP BY 
        CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(Remarks, '')))) = 'CAS' THEN 'CASH' ELSE LTRIM(RTRIM(ISNULL(Remarks, ''))) END
    `);

    res.json(result.recordset || []);

  } catch (err) {
    console.error("❌ PAYMENT ERROR:", err);
    res.status(500).send(err.message);
  }
});


// ===== TRANSACTIONS =====
router.get("/transactions/:terminal/:userId", async (req, res) => {
  try {
    // [TEMP FIX]: Commenting this out because the 'Transactions' table is missing,
    // which was causing the tedious driver to throw a fatal unhandled rejection stream error
    /*
    const pool = await poolPromise;

    const result = await pool.request()
      .input("TerminalCode", sql.VarChar, req.params.terminal)
      .input("UserId", sql.VarChar, req.params.userId)
      .query(`SELECT 
              ISNULL(TransactionMode,'') AS TransactionMode,
              ISNULL(TransactionType,'') AS TransactionType,
              ISNULL(Amount,0) AS Amount
              FROM Transactions
              WHERE TerminalCode = @TerminalCode
         AND UserId = @UserId
      `);

    res.json(result.recordset || []);
    */

    res.json([]);

  } catch (err) {
    console.error("❌ TRANSACTION ERROR:", err);
    res.status(500).send(err.message);
  }
});


// ===== SALES SUMMARY =====
router.get("/sales-summary/:terminal", async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const pool = await poolPromise;
    const request = pool.request();

    let dateFilter = "";
    if (fromDate && toDate) {
      const fDate = fromDate.replace(/[^0-9T:.-]/g, '');
      const tDate = toDate.replace(/[^0-9T:.-]/g, '');
      dateFilter = `AND start_date BETWEEN CAST('${fDate}' AS DATE) AND CAST('${tDate}' AS DATE)`;
    }

    const result = await request.query(`
      SELECT 
        ISNULL(Paymode,'') AS Paymode,
        ISNULL(SUM(Amount),0) AS Amount
      FROM PaymentDetailCur
      WHERE isSettlement = 0
      ${dateFilter}
      GROUP BY Paymode 
    `);

    res.json(result.recordset || []);

  } catch (err) {
    console.error("❌ SALES SUMMARY ERROR:", err);
    res.status(500).send(err.message);
  }
});


// ===== CHECK PENDING ORDERS =====
router.get("/pending-orders", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT * FROM RestaurantOrderCur
      WHERE StatusCode < 5
    `);

    res.json({
      hasPending: result.recordset.length > 0,
      data: result.recordset
    });

  } catch (err) {
    console.error("❌ PENDING ERROR:", err);
    res.status(500).send(err.message);
  }
});


// ===== SAVE SETTLEMENT =====
router.post("/settlement", async (req, res) => {
  const { terminal, userId } = req.body;

  try {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    const request = new sql.Request(transaction);

    // HEADER
    const result = await request
      .input("TerminalCode", sql.VarChar, terminal)
      .input("UserId", sql.VarChar, userId)
      .query(`
        INSERT INTO SettlementHeader (
          SettlementId,
          TerminalCode,
          CreatedBy,
          CreatedOn
        )
        OUTPUT INSERTED.SettlementId
        VALUES (NEWID(), @TerminalCode, @UserId, GETDATE())
      `);

    const settlementId = result.recordset[0].SettlementId;

    // UPDATE ONLY THIS TERMINAL
    await request
      .input("TerminalCode", sql.VarChar, terminal)
      .query(`
        UPDATE PaymentDetailCur
        SET isSettlement = 1
        WHERE isSettlement = 0
        AND TerminalCode = @TerminalCode
      `);

    await transaction.commit();

    res.json({
      message: "Settlement Completed ✅",
      settlementId
    });

  } catch (err) {
    console.error("❌ SETTLEMENT ERROR:", err);
    res.status(500).send(err.message);
  }
});


// ===== LAST SETTLEMENT =====
router.get("/last-settlement/:terminal", async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input("TerminalCode", sql.VarChar, req.params.terminal)
      .query(`
        SELECT 
          ISNULL(MAX(CreatedOn), DATEADD(DAY,-1,GETDATE())) AS LastSettlementDate
        FROM SettlementHeader
        WHERE TerminalCode = @TerminalCode
      `);

    res.json(result.recordset[0]);

  } catch (err) {
    console.error("❌ LAST SETTLEMENT ERROR:", err);
    res.status(500).send(err.message);
  }
});


// ===== TERMINAL LIST =====
router.get("/terminals", async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT TerminalCode, TerminalName FROM TerminalMaster
    `);

    console.log("🔥 TERMINALS FROM DB 👉", result.recordset);

    res.json(result.recordset);

  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});

module.exports = router;
