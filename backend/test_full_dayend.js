const { poolPromise } = require('./config/db');
const sql = require('mssql');

(async () => {
  try {
    const pool = await poolPromise;
    const start = '2026-07-30';
    const end = '2026-07-30';

    const getReportDateWhereSqlForRange = (startDateStr, endDateStr, saleDateColumn = "sh.LastSettlementDate") => {
      const cleanCol = String(saleDateColumn).trim();
      const parts = cleanCol.split(".");
      const prefix = parts.length > 1 ? parts[0] : "";
      const colName = parts.length > 1 ? parts[1] : parts[0];
      const pStr = prefix ? `${prefix}.` : "";

      let resolvedCol = cleanCol;
      if (colName === "LastSettlementDate" || colName === "OrderDateTime" || colName === "InvoiceDate") {
        resolvedCol = `ISNULL(${pStr}start_date, CAST(${pStr}${colName} AS DATE))`;
      }
      return `CAST(${resolvedCol} AS DATE) >= CAST('${startDateStr}' AS DATE) AND CAST(${resolvedCol} AS DATE) <= CAST('${endDateStr}' AS DATE)`;
    };

    const whereSql = getReportDateWhereSqlForRange(start, end, "sh.LastSettlementDate");
    const ptdWhereSql = getReportDateWhereSqlForRange(start, end, "ptd.CreatedDate");

    console.log('--- 1. Paymode Query ---');
    const paymodeRes = await pool.request().query(`
      SELECT 
        Paymode,
        SUM(Amount) as Amount,
        SUM(Count) as Count
      FROM (
        SELECT 
          UPPER(ISNULL(
            (SELECT TOP 1 LTRIM(RTRIM(pm.Description)) 
             FROM Paymode pm 
             WHERE LTRIM(RTRIM(pm.PayMode)) = LTRIM(RTRIM(sd.Paymode)) 
                OR LTRIM(RTRIM(pm.Description)) = LTRIM(RTRIM(sd.Paymode))
                OR CAST(pm.Position AS NVARCHAR(10)) = LTRIM(RTRIM(sd.Paymode))
            ), 
            CASE 
              WHEN UPPER(LTRIM(RTRIM(sd.Paymode))) IN ('CASHBOX', 'CASH BOX', 'CASH BOX ENTRY') THEN 'Cash Box Entry'
              WHEN LTRIM(RTRIM(sd.Paymode)) = '2' THEN 'NETS'
              WHEN LTRIM(RTRIM(sd.Paymode)) = '3' THEN 'PAYNOW'
              WHEN LTRIM(RTRIM(sd.Paymode)) = '4' THEN 'UPI / GPAY'
              ELSE ISNULL(sd.Paymode, 'CASH')
            END
          )) as Paymode,
          ISNULL(sd.SysAmount, 0) as Amount,
          1 as Count
        FROM SettlementHeader sh
        INNER JOIN SettlementDetail sd ON sh.SettlementID = sd.SettlementId
        WHERE ${whereSql}
      ) RawData
      GROUP BY Paymode
    `);
    console.log('Paymodes:', paymodeRes.recordset);

    console.log('--- 2. Analysis Query ---');
    const analysisRes = await pool.request().query(`
      SELECT 
        SUM(ISNULL(sh.SubTotal, 0)) as BaseSales,
        SUM(ISNULL(sh.SysAmount, 0)) as TotalSales,
        SUM(ISNULL(sh.TotalTax, 0)) as TotalTax,
        SUM(ISNULL(sh.DiscountAmount, 0)) as TotalDiscount,
        SUM(ISNULL(sh.ServiceCharge, 0)) as TotalServiceCharge,
        SUM(ISNULL(sh.RoundedBy, 0)) as TotalRoundOff,
        SUM(ISNULL(sh.TakeawayCharge, 0)) as TotalTakeawayCharge,
        COUNT(sh.SettlementID) as TotalBills,
        SUM(ISNULL(sh.VoidItemQty, 0)) as VoidQty,
        SUM(ISNULL(sh.VoidItemAmount, 0)) as VoidAmount,
        SUM(CASE WHEN sh.IsCancelled = 1 THEN 1 ELSE 0 END) as CancelledCount,
        SUM(CASE WHEN sh.IsCancelled = 1 THEN ISNULL(sh.VoidItemAmount, 0) ELSE 0 END) as CancelledAmount,
        MAX(sh.TerminalCode) as TerminalCode,
        MAX(sh.RefNo) as RefNo
      FROM SettlementHeader sh
      WHERE ${whereSql}
    `);
    console.log('Analysis:', analysisRes.recordset[0]);

    console.log('--- 3. Actual Voids Query ---');
    const actualVoidsRes = await pool.request()
      .input("startDate", sql.VarChar, start)
      .input("endDate", sql.VarChar, end)
      .query(`
        SELECT 
          SUM(CAST(ISNULL(d.Quantity, 0) AS DECIMAL(18,2))) as VoidQty,
          SUM(CAST(ISNULL(d.Quantity, 0) * ISNULL(d.PricePerUnit, 0) AS DECIMAL(18, 2))) as VoidAmount
        FROM (
          SELECT Quantity, PricePerUnit, START_DATE, CreatedOn FROM RestaurantOrderDetailCur WHERE StatusCode = 0
          UNION ALL
          SELECT Quantity, PricePerUnit, START_DATE, CreatedOn FROM RestaurantOrderDetail WHERE StatusCode = 0
        ) d
        WHERE CAST(ISNULL(d.START_DATE, CAST(d.CreatedOn AS DATE)) AS DATE) >= CAST(@startDate AS DATE)
          AND CAST(ISNULL(d.START_DATE, CAST(d.CreatedOn AS DATE)) AS DATE) <= CAST(@endDate AS DATE)
      `);
    console.log('Actual Voids:', actualVoidsRes.recordset[0]);

    console.log('--- 4. Credit Payments Query ---');
    const creditPaymentsRes = await pool.request().query(`
      WITH RawCollections AS (
        SELECT 
          CASE WHEN mm.MemberId IS NOT NULL THEN 'MEMBER' ELSE 'CREDIT' END AS CustomerType,
          UPPER(ISNULL(pm.Description, 'CASH')) AS PaymodeName,
          ptd.Amount
        FROM PaymentTransactionDetails ptd
        INNER JOIN Paymode pm ON pm.Position = ptd.PayModeId
        LEFT JOIN MemberMaster mm ON ptd.ReferenceId = mm.MemberId
        WHERE ptd.ReferenceType = 'MEMBER'
          AND ${ptdWhereSql}
      )
      SELECT 
        CustomerType + ' PAYMENT (' + PaymodeName + ')' AS Paymode,
        SUM(Amount) AS Amount,
        COUNT(*) AS Count
      FROM RawCollections
      GROUP BY CustomerType, PaymodeName
    `);
    console.log('Credit Payments:', creditPaymentsRes.recordset);

    console.log('--- 5. Settlement Breakdown Query ---');
    const settlementRes = await pool.request().query(`
      SELECT 
        Paymode,
        SUM(ISNULL(SysAmount, 0)) as SysAmount,
        SUM(ISNULL(ManualAmount, 0)) as ManualAmount,
        SUM(ISNULL(SortageOrExces, 0)) as SortageOrExces,
        CAST(SUM(ISNULL(ReceiptCount, 0)) AS INT) as ReceiptCount
      FROM (
        SELECT 
          CASE
            WHEN UPPER(LTRIM(RTRIM(sd.Paymode))) IN ('CASHBOX', 'CASH BOX', 'CASH BOX ENTRY')
              OR UPPER(LTRIM(RTRIM(ISNULL(sh.OrderType,'')))) = 'CASHBOX'
            THEN 'Cash Box Entry'
            ELSE ISNULL(
              (SELECT TOP 1 LTRIM(RTRIM(Description)) FROM Paymode pm WHERE LTRIM(RTRIM(pm.PayMode)) = LTRIM(RTRIM(sd.Paymode))
                OR LTRIM(RTRIM(pm.Description)) = LTRIM(RTRIM(sd.Paymode))
                OR CAST(pm.Position AS NVARCHAR(10)) = LTRIM(RTRIM(sd.Paymode))
              ),
              sd.Paymode
            )
          END as Paymode,
          sd.SysAmount,
          sd.ManualAmount,
          sd.SortageOrExces,
          sd.ReceiptCount
        FROM SettlementHeader sh
        INNER JOIN SettlementDetail sd ON sh.SettlementID = sd.SettlementId
        WHERE ${whereSql}
      ) Sub
      GROUP BY Paymode
      ORDER BY SysAmount DESC
    `);
    console.log('Settlement Breakdown:', settlementRes.recordset);

    console.log('--- ALL QUERIES SUCCESSFUL ---');
    process.exit(0);
  } catch (e) {
    console.error('🔥 FAILURE IN QUERY:', e);
    process.exit(1);
  }
})();
