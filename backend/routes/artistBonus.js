/**
 * Artist Incentive Management Module — Backend Routes
 * =====================================================
 * Architecture: Accounting Ledger Model
 *   - ArtistBonusTransaction: immutable bonus earned records (never updated)
 *   - ArtistBonusPayment:     payment ledger (multiple partial payments per transaction)
 *   - Status derived:         Pending | Partially Paid | Paid  (never stored)
 *   - BonusPaid/PendingBonus: always calculated from SUM(payments), never stored
 */

const express = require('express');
const router = express.Router();
const sql = require('mssql');
const crypto = require('crypto');
const { getPool } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Derive status string from earned and paid amounts */
const deriveStatus = (bonusEarned, bonusPaid) => {
  if (Number(bonusEarned) <= 0) return 'No Bonus';
  const pending = Number(bonusEarned) - Number(bonusPaid);
  if (pending <= 0) return 'Paid';
  if (Number(bonusPaid) > 0) return 'Partially Paid';
  return 'Pending';
};

/** Get current active business day StartDate string ('YYYY-MM-DD') from DateEntry */
async function getActiveStartDate(pool) {
  try {
    const result = await pool.request().query("SELECT TOP 1 StartDate FROM DateEntry ORDER BY CreatedDate DESC");
    if (result.recordset.length > 0) {
      const rawDate = result.recordset[0].StartDate;
      return rawDate instanceof Date ? rawDate.toISOString().split("T")[0] : String(rawDate).split("T")[0];
    }
  } catch (err) {
    console.error('[ArtistBonus] getActiveStartDate error:', err.message);
  }
  return null;
}

/**
 * Aggregate artist sales for a given artist DishId over a date range or active business day.
 * Sources: SettlementItemDetail (App) + RestaurantOrderDetail (Professional) + ArtistCashBox
 */
async function getArtistSales(pool, artistDishId, artistName, fromDate, toDate) {
  const request = pool.request();
  request.input('fromDate', sql.Date, fromDate);
  request.input('toDate', sql.Date, toDate);
  request.input('artistDishId', sql.UniqueIdentifier, artistDishId);
  request.input('artistName', sql.NVarChar(200), artistName);

  const result = await request.query(`
    DECLARE @sgtStart DATETIME = CAST(@fromDate AS DATETIME);
    DECLARE @sgtEnd   DATETIME = DATEADD(DAY, 1, CAST(@toDate AS DATETIME));

    WITH AppSales AS (
      SELECT
        ISNULL(SUM(CASE WHEN ISNULL(sid.Status, 'NORMAL') <> 'VOIDED'
                        THEN CAST(ISNULL(sid.Qty, 0) * ISNULL(sid.Price, 0) AS DECIMAL(18,2))
                        ELSE 0 END), 0) AS total
      FROM SettlementHeader sh
      INNER JOIN SettlementItemDetail sid ON sh.SettlementID = sid.SettlementID
      INNER JOIN DishMaster d ON (
        sid.DishId = d.DishId 
        OR LTRIM(RTRIM(sid.DishName)) = d.Name
        OR sid.DishName LIKE '%' + d.Name + '%'
      )
      WHERE sh.IsCancelled = 0
        AND ISNULL(sh.OrderType, '') <> 'CASHBOX'
        AND (
          (sh.start_date IS NOT NULL AND sh.start_date >= @fromDate AND sh.start_date <= @toDate)
          OR
          (sh.start_date IS NULL AND sh.LastSettlementDate >= @sgtStart AND sh.LastSettlementDate < @sgtEnd)
        )
        AND d.IsSplitDish = 1
        AND d.IsGroupDish = 0
        AND d.IsActive = 1
        AND d.DishId = @artistDishId
    ),
    ProfSales AS (
      SELECT
        ISNULL(SUM(CASE WHEN rod.StatusCode <> 0
                        THEN CAST(ISNULL(rod.TotalDetailLineAmount, 0) AS DECIMAL(18,2))
                        ELSE 0 END), 0) AS total
      FROM RestaurantOrderDetail rod
      INNER JOIN RestaurantOrder ro ON rod.OrderId = ro.OrderId
      INNER JOIN DishMaster d ON rod.DishId = d.DishId
      WHERE ISNULL(ro.StatusCode, 0) = 3
        AND (
          (ro.start_date IS NOT NULL AND ro.start_date >= @fromDate AND ro.start_date <= @toDate)
          OR
          (ro.start_date IS NULL AND ro.OrderDateTime >= @sgtStart AND ro.OrderDateTime < @sgtEnd)
        )
        AND d.IsSplitDish = 1
        AND d.IsGroupDish = 0
        AND d.IsActive = 1
        AND d.DishId = @artistDishId
        AND NOT EXISTS (
          SELECT 1 FROM SettlementHeader sh_dup WHERE sh_dup.BillNo = ro.OrderNumber
        )
    ),
    CashBoxSales AS (
      SELECT ISNULL(SUM(Amount), 0) AS total
      FROM ArtistCashBox
      WHERE LTRIM(RTRIM(ArtistName)) = @artistName
        AND (
          (start_date IS NOT NULL AND start_date >= @fromDate AND start_date <= @toDate)
          OR
          (start_date IS NULL AND CAST(CreatedDate AS DATE) >= @fromDate AND CAST(CreatedDate AS DATE) <= @toDate)
        )
    )
    SELECT
      (SELECT total FROM AppSales) +
      (SELECT total FROM ProfSales) +
      (SELECT total FROM CashBoxSales) AS TotalSales
  `);

  return Number(result.recordset[0]?.TotalSales) || 0;
}

/** Fetch sales for ALL active artists in a single optimized bulk query */
async function bulkGetArtistSales(pool, fromDate, toDate) {
  const request = pool.request();
  request.input('fromDate', sql.Date, fromDate);
  request.input('toDate', sql.Date, toDate);

  const result = await request.query(`
    DECLARE @sgtStart DATETIME = CAST(@fromDate AS DATETIME);
    DECLARE @sgtEnd   DATETIME = DATEADD(DAY, 1, CAST(@toDate AS DATETIME));

    WITH AppSales AS (
      SELECT
        d.DishId,
        ISNULL(SUM(CASE WHEN ISNULL(sid.Status, 'NORMAL') <> 'VOIDED'
                        THEN CAST(ISNULL(sid.Qty, 0) * ISNULL(sid.Price, 0) AS DECIMAL(18,2))
                        ELSE 0 END), 0) AS total
      FROM SettlementHeader sh
      INNER JOIN SettlementItemDetail sid ON sh.SettlementID = sid.SettlementID
      INNER JOIN DishMaster d ON (
        sid.DishId = d.DishId 
        OR LTRIM(RTRIM(sid.DishName)) = d.Name
        OR sid.DishName LIKE '%' + d.Name + '%'
      )
      WHERE sh.IsCancelled = 0
        AND ISNULL(sh.OrderType, '') <> 'CASHBOX'
        AND (
          (sh.start_date IS NOT NULL AND sh.start_date >= @fromDate AND sh.start_date <= @toDate)
          OR
          (sh.start_date IS NULL AND sh.LastSettlementDate >= @sgtStart AND sh.LastSettlementDate < @sgtEnd)
        )
        AND d.IsSplitDish = 1
        AND d.IsGroupDish = 0
        AND d.IsActive = 1
      GROUP BY d.DishId
    ),
    ProfSales AS (
      SELECT
        d.DishId,
        ISNULL(SUM(CASE WHEN rod.StatusCode <> 0
                        THEN CAST(ISNULL(rod.TotalDetailLineAmount, 0) AS DECIMAL(18,2))
                        ELSE 0 END), 0) AS total
      FROM RestaurantOrderDetail rod
      INNER JOIN RestaurantOrder ro ON rod.OrderId = ro.OrderId
      INNER JOIN DishMaster d ON rod.DishId = d.DishId
      WHERE ISNULL(ro.StatusCode, 0) = 3
        AND (
          (ro.start_date IS NOT NULL AND ro.start_date >= @fromDate AND ro.start_date <= @toDate)
          OR
          (ro.start_date IS NULL AND ro.OrderDateTime >= @sgtStart AND ro.OrderDateTime < @sgtEnd)
        )
        AND d.IsSplitDish = 1
        AND d.IsGroupDish = 0
        AND d.IsActive = 1
        AND NOT EXISTS (
          SELECT 1 FROM SettlementHeader sh_dup WHERE sh_dup.BillNo = ro.OrderNumber
        )
      GROUP BY d.DishId
    ),
    CashBoxSales AS (
      SELECT 
        d.DishId,
        ISNULL(SUM(acb.Amount), 0) AS total
      FROM ArtistCashBox acb
      INNER JOIN DishMaster d ON LTRIM(RTRIM(d.Name)) = LTRIM(RTRIM(acb.ArtistName))
      WHERE d.IsSplitDish = 1
        AND d.IsGroupDish = 0
        AND d.IsActive = 1
        AND (
          (acb.start_date IS NOT NULL AND acb.start_date >= @fromDate AND acb.start_date <= @toDate)
          OR
          (acb.start_date IS NULL AND CAST(acb.CreatedDate AS DATE) >= @fromDate AND CAST(acb.CreatedDate AS DATE) <= @toDate)
        )
      GROUP BY d.DishId
    )
    SELECT 
      d.DishId,
      d.Name,
      ISNULL(a.total, 0) + ISNULL(p.total, 0) + ISNULL(c.total, 0) AS TotalSales
    FROM DishMaster d
    LEFT JOIN AppSales a ON d.DishId = a.DishId
    LEFT JOIN ProfSales p ON d.DishId = p.DishId
    LEFT JOIN CashBoxSales c ON d.DishId = c.DishId
    WHERE d.IsSplitDish = 1 AND d.IsGroupDish = 0 AND d.IsActive = 1
  `);
  return result.recordset;
}

/** Calculate bonus given sales, threshold, bonus amount, and repeating flag */
function calculateBonus(totalSales, thresholdAmount, bonusAmount, isRepeating) {
  if (totalSales < thresholdAmount) return 0;
  if (isRepeating) {
    return Math.floor(totalSales / thresholdAmount) * bonusAmount;
  }
  return bonusAmount; // one-time: just the flat bonus
}

/**
 * Synchronize (insert or update) the ArtistBonusTransaction record for the active business day.
 * If the active day is ongoing, sales and earned bonus can grow, so we update the record.
 */
async function syncActiveDayTransactions(pool, specificArtistDishId = null) {
  try {
    let activeDay = await getActiveStartDate(pool);
    if (!activeDay) {
      const latestLog = await pool.request().query("SELECT TOP 1 BusinessDate FROM BusinessDayLog ORDER BY BusinessDate DESC");
      if (latestLog.recordset.length > 0) {
        const rawDate = latestLog.recordset[0].BusinessDate;
        activeDay = rawDate instanceof Date ? rawDate.toISOString().split("T")[0] : String(rawDate).split("T")[0];
      }
    }
    if (!activeDay) return;

    // 1. Fetch active global bonus rule
    const ruleRes = await pool.request().query(`
      SELECT TOP 1 Id, ThresholdAmount, BonusAmount, IsRepeating
      FROM ArtistBonusMaster WHERE IsActive = 1 AND ArtistDishId IS NULL
      ORDER BY CreatedDate DESC
    `);
    const globalRule = ruleRes.recordset[0];
    if (!globalRule) return;

    // 2. Fetch artist sales
    let artistSales = [];
    if (specificArtistDishId) {
      const artistRes = await pool.request()
        .input('dishId', sql.UniqueIdentifier, specificArtistDishId)
        .query("SELECT DishId, Name FROM DishMaster WHERE DishId = @dishId AND IsActive = 1 AND IsSplitDish = 1 AND IsGroupDish = 0");
      if (artistRes.recordset.length > 0) {
        const singleSales = await getArtistSales(pool, specificArtistDishId, artistRes.recordset[0].Name, activeDay, activeDay);
        artistSales = [{ DishId: specificArtistDishId, Name: artistRes.recordset[0].Name, TotalSales: singleSales }];
      }
    } else {
      artistSales = await bulkGetArtistSales(pool, activeDay, activeDay);
    }

    // 3. Fetch all active artist overrides to avoid querying inside loop
    const overridesRes = await pool.request().query(`
      SELECT ArtistDishId, ThresholdAmount, BonusAmount, IsRepeating
      FROM ArtistBonusMaster
      WHERE IsActive = 1 AND ArtistDishId IS NOT NULL
    `);
    const overridesMap = new Map(overridesRes.recordset.map(o => [o.ArtistDishId.toLowerCase(), o]));

    // 4. Fetch existing transactions for activeDay to avoid querying inside loop
    const existingTxnsRes = await pool.request()
      .input('activeDay', sql.Date, activeDay)
      .query(`
        SELECT Id, ArtistDishId, TotalSales, BonusEarned 
        FROM ArtistBonusTransaction 
        WHERE CAST(SalesFromDate AS DATE) = @activeDay
          AND CAST(SalesToDate AS DATE) = @activeDay
      `);
    const existingTxnsMap = new Map(existingTxnsRes.recordset.map(t => [t.ArtistDishId.toLowerCase(), t]));

    for (const artist of artistSales) {
      const rule = overridesMap.get(artist.DishId.toLowerCase()) || globalRule;
      const totalSales = artist.TotalSales;
      const bonusEarned = calculateBonus(totalSales, rule.ThresholdAmount, rule.BonusAmount, rule.IsRepeating);

      const existingTxn = existingTxnsMap.get(artist.DishId.toLowerCase());

      if (existingTxn) {
        if (Number(existingTxn.TotalSales) !== totalSales || Number(existingTxn.BonusEarned) !== bonusEarned) {
          await pool.request()
            .input('id', sql.UniqueIdentifier, existingTxn.Id)
            .input('totalSales', sql.Decimal(18, 2), totalSales)
            .input('bonusEarned', sql.Decimal(18, 2), bonusEarned)
            .query(`
              UPDATE ArtistBonusTransaction
              SET TotalSales = @totalSales,
                  BonusEarned = @bonusEarned
              WHERE Id = @id
            `);
        }
      } else {
        if (totalSales > 0) {
          const newId = crypto.randomUUID();
          await pool.request()
            .input('id', sql.UniqueIdentifier, newId)
            .input('artistDishId', sql.UniqueIdentifier, artist.DishId)
            .input('artistName', sql.NVarChar(200), artist.Name)
            .input('fromDate', sql.DateTime, activeDay)
            .input('toDate', sql.DateTime, activeDay)
            .input('totalSales', sql.Decimal(18, 2), totalSales)
            .input('threshold', sql.Decimal(18, 2), rule.ThresholdAmount)
            .input('bonusRuleAmount', sql.Decimal(18, 2), rule.BonusAmount)
            .input('bonusEarned', sql.Decimal(18, 2), bonusEarned)
            .input('isRepeating', sql.Bit, rule.IsRepeating)
            .query(`
              INSERT INTO ArtistBonusTransaction
                (Id, ArtistDishId, ArtistName, SalesFromDate, SalesToDate, TotalSales,
                 ThresholdAmount, BonusRuleAmount, BonusEarned, IsRepeating)
              VALUES
                (@id, @artistDishId, @artistName, @fromDate, @toDate, @totalSales,
                 @threshold, @bonusRuleAmount, @bonusEarned, @isRepeating)
            `);
        }
      }
    }
  } catch (err) {
    console.error('[ArtistBonus] syncActiveDayTransactions error:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. BONUS MASTER CRUD
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/artist-bonus/master
router.get('/master', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT
        abm.Id, abm.ThresholdAmount, abm.BonusAmount, abm.IsRepeating,
        abm.IsActive, abm.ArtistDishId, abm.ArtistType, abm.CreatedDate,
        d.Name AS ArtistDishName
      FROM ArtistBonusMaster abm
      LEFT JOIN DishMaster d ON abm.ArtistDishId = d.DishId
      ORDER BY abm.IsActive DESC, abm.CreatedDate DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('[ArtistBonus] GET /master error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/artist-bonus/master
router.post('/master', async (req, res) => {
  try {
    const { thresholdAmount, bonusAmount, isRepeating, artistDishId, artistType } = req.body;
    if (!thresholdAmount || thresholdAmount <= 0) return res.status(400).json({ error: 'ThresholdAmount must be > 0' });
    if (!bonusAmount || bonusAmount <= 0) return res.status(400).json({ error: 'BonusAmount must be > 0' });

    const pool = getPool();

    // Validate: only one active global rule at a time
    if (!artistDishId) {
      const existing = await pool.request().query(
        "SELECT COUNT(*) AS cnt FROM ArtistBonusMaster WHERE IsActive = 1 AND ArtistDishId IS NULL"
      );
      if (existing.recordset[0].cnt > 0) {
        return res.status(409).json({ error: 'An active global bonus rule already exists. Deactivate it first.' });
      }
    }

    const id = crypto.randomUUID();
    await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .input('thresholdAmount', sql.Decimal(18, 2), thresholdAmount)
      .input('bonusAmount', sql.Decimal(18, 2), bonusAmount)
      .input('isRepeating', sql.Bit, isRepeating ? 1 : 0)
      .input('artistDishId', sql.UniqueIdentifier, artistDishId || null)
      .input('artistType', sql.NVarChar(100), artistType || null)
      .query(`
        INSERT INTO ArtistBonusMaster (Id, ThresholdAmount, BonusAmount, IsRepeating, IsActive, ArtistDishId, ArtistType)
        VALUES (@id, @thresholdAmount, @bonusAmount, @isRepeating, 1, @artistDishId, @artistType)
      `);

    res.json({ success: true, id });
  } catch (err) {
    console.error('[ArtistBonus] POST /master error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/artist-bonus/master/:id
router.put('/master/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { thresholdAmount, bonusAmount, isRepeating, isActive, artistDishId, artistType } = req.body;
    const pool = getPool();

    // If activating a global rule, deactivate all other global rules first
    if (isActive && !artistDishId) {
      await pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .query("UPDATE ArtistBonusMaster SET IsActive = 0 WHERE IsActive = 1 AND ArtistDishId IS NULL AND Id <> @id");
    }

    await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .input('thresholdAmount', sql.Decimal(18, 2), thresholdAmount)
      .input('bonusAmount', sql.Decimal(18, 2), bonusAmount)
      .input('isRepeating', sql.Bit, isRepeating ? 1 : 0)
      .input('isActive', sql.Bit, isActive ? 1 : 0)
      .input('artistDishId', sql.UniqueIdentifier, artistDishId || null)
      .input('artistType', sql.NVarChar(100), artistType || null)
      .query(`
        UPDATE ArtistBonusMaster
        SET ThresholdAmount = @thresholdAmount, BonusAmount = @bonusAmount,
            IsRepeating = @isRepeating, IsActive = @isActive,
            ArtistDishId = @artistDishId, ArtistType = @artistType
        WHERE Id = @id
      `);

    res.json({ success: true });
  } catch (err) {
    console.error('[ArtistBonus] PUT /master/:id error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/artist-bonus/master/:id  (soft-delete)
router.delete('/master/:id', async (req, res) => {
  try {
    const pool = getPool();
    await pool.request()
      .input('id', sql.UniqueIdentifier, req.params.id)
      .query("UPDATE ArtistBonusMaster SET IsActive = 0 WHERE Id = @id");
    res.json({ success: true });
  } catch (err) {
    console.error('[ArtistBonus] DELETE /master/:id error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SALES SUMMARY & DASHBOARD CARDS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/artist-bonus/sales-summary?fromDate=&toDate=
// If no dates provided, defaults to the active business day (StartDate from DateEntry).
// GET /api/artist-bonus/sales-summary?fromDate=&toDate=
// If no dates provided, defaults to the active business day (StartDate from DateEntry).
router.get('/sales-summary', async (req, res) => {
  try {
    const pool = getPool();
    await syncActiveDayTransactions(pool);
    let { fromDate, toDate } = req.query;

    // Default to active business day if no dates supplied
    if (!fromDate || !toDate) {
      const activeDay = await getActiveStartDate(pool);
      if (activeDay) {
        fromDate = fromDate || activeDay;
        toDate   = toDate   || activeDay;
      }
    }

    if (fromDate && isNaN(new Date(fromDate).getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid fromDate format. Please use YYYY-MM-DD.' });
    }
    if (toDate && isNaN(new Date(toDate).getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid toDate format. Please use YYYY-MM-DD.' });
    }

    const today = new Date().toISOString().split('T')[0];
    const fromStr = fromDate || today;
    const toStr   = toDate   || today;

    // Determine if we're looking at the active business day
    const activeDay = await getActiveStartDate(pool);
    const isDayActive = !!activeDay;
    const activeDayStr = activeDay || today;
    const isActiveDayView = fromStr === activeDayStr && toStr === activeDayStr;

    // 1. Get all live sales in a single optimized bulk query
    const artistListSales = await bulkGetArtistSales(pool, fromStr, toStr);

    // Get active bonus master rule (global)
    const ruleRes = await pool.request().query(`
      SELECT TOP 1 Id, ThresholdAmount, BonusAmount, IsRepeating
      FROM ArtistBonusMaster WHERE IsActive = 1 AND ArtistDishId IS NULL
      ORDER BY CreatedDate DESC
    `);
    const globalRule = ruleRes.recordset[0] || null;

    // 2. Fetch overrides in bulk
    const overridesRes = await pool.request().query(`
      SELECT ArtistDishId, ThresholdAmount, BonusAmount, IsRepeating
      FROM ArtistBonusMaster
      WHERE IsActive = 1 AND ArtistDishId IS NOT NULL
    `);
    const overridesMap = new Map(overridesRes.recordset.map(o => [o.ArtistDishId.toLowerCase(), o]));

    // 3. Fetch period transactions in bulk
    const periodTxnsRes = await pool.request()
      .input('fromDate', sql.Date, fromStr)
      .input('toDate', sql.Date, toStr)
      .query(`
        SELECT ArtistDishId, SUM(BonusEarned) AS BonusEarned
        FROM ArtistBonusTransaction
        WHERE CAST(SalesFromDate AS DATE) >= @fromDate
          AND CAST(SalesToDate   AS DATE) <= @toDate
        GROUP BY ArtistDishId
      `);
    const periodTxnsMap = new Map(periodTxnsRes.recordset.map(t => [t.ArtistDishId.toLowerCase(), Number(t.BonusEarned) || 0]));

    // 4. Fetch period payments in bulk
    const periodPaysRes = await pool.request()
      .input('fromDate', sql.Date, fromStr)
      .input('toDate', sql.Date, toStr)
      .query(`
        SELECT abp.ArtistDishId, ISNULL(SUM(abp.PaymentAmount), 0) AS PeriodPaid
        FROM ArtistBonusPayment abp
        WHERE abp.BonusTransactionId IN (
          SELECT Id FROM ArtistBonusTransaction
          WHERE CAST(SalesFromDate AS DATE) >= @fromDate
            AND CAST(SalesToDate   AS DATE) <= @toDate
        )
        GROUP BY abp.ArtistDishId
      `);
    const periodPaysMap = new Map(periodPaysRes.recordset.map(p => [p.ArtistDishId.toLowerCase(), Number(p.PeriodPaid) || 0]));

    // 5. Fetch lifetime totals in bulk
    const lifetimeEarnedRes = await pool.request().query(`
      SELECT ArtistDishId, ISNULL(SUM(BonusEarned), 0) AS LifetimeEarned
      FROM ArtistBonusTransaction
      GROUP BY ArtistDishId
    `);
    const lifetimeEarnedMap = new Map(lifetimeEarnedRes.recordset.map(l => [l.ArtistDishId.toLowerCase(), Number(l.LifetimeEarned) || 0]));

    const lifetimePaidRes = await pool.request().query(`
      SELECT ArtistDishId, ISNULL(SUM(PaymentAmount), 0) AS LifetimePaid
      FROM ArtistBonusPayment
      GROUP BY ArtistDishId
    `);
    const lifetimePaidMap = new Map(lifetimePaidRes.recordset.map(l => [l.ArtistDishId.toLowerCase(), Number(l.LifetimePaid) || 0]));

    const artistList = artistListSales.map((artist) => {
      const dishIdKey = artist.DishId.toLowerCase();
      const totalSales = Number(artist.TotalSales) || 0;

      const bonusEarned = periodTxnsMap.get(dishIdKey) || 0;
      const bonusPaid   = periodPaysMap.get(dishIdKey) || 0;

      const lifetimeEarned = lifetimeEarnedMap.get(dishIdKey) || 0;
      const lifetimePaid   = lifetimePaidMap.get(dishIdKey) || 0;

      const rule = overridesMap.get(dishIdKey) || globalRule;
      let expectedBonus = 0;
      let thresholdAmount = rule ? Number(rule.ThresholdAmount) : 0;
      if (rule) {
        expectedBonus = calculateBonus(totalSales, rule.ThresholdAmount, rule.BonusAmount, rule.IsRepeating);
      }

      const finalEarned = bonusEarned || expectedBonus;
      const pendingBonus = Math.max(0, finalEarned - bonusPaid);

      // Live progress toward bonus threshold (for active day view)
      const progressPct = thresholdAmount > 0 ? Math.min(100, (totalSales % thresholdAmount) / thresholdAmount * 100) : 0;
      const thresholdReached = thresholdAmount > 0 && totalSales >= thresholdAmount;
      const remainingToThreshold = thresholdAmount > 0 ? Math.max(0, thresholdAmount - (totalSales % thresholdAmount)) : 0;

      // Status derivation: if paid >= earned -> Paid, else if in active day view & unfinalized -> Accruing
      let status = deriveStatus(finalEarned, bonusPaid);
      if (bonusPaid < finalEarned && isActiveDayView && !bonusEarned && finalEarned > 0) {
        status = 'Accruing';
      }

      return {
        dishId: artist.DishId,
        name: artist.Name,
        totalSales,
        bonusEarned: finalEarned,
        bonusPaid,
        pendingBonus,
        status,
        lifetimeOutstanding: Math.max(0, lifetimeEarned - lifetimePaid),
        // Live day progress info
        thresholdAmount,
        thresholdReached,
        progressPct,
        remainingToThreshold,
      };
    });

    // Summary cards
    const totalArtistSales  = artistList.reduce((s, a) => s + a.totalSales, 0);
    const totalBonusEarned  = artistList.reduce((s, a) => s + a.bonusEarned, 0);
    const totalBonusPaid    = artistList.reduce((s, a) => s + a.bonusPaid, 0);
    const pendingBonus      = Math.max(0, totalBonusEarned - totalBonusPaid);

    res.json({
      success: true,
      cards: { totalArtistSales, totalBonusEarned, totalBonusPaid, pendingBonus },
      activeRule: globalRule,
      artists: artistList.sort((a, b) => b.totalSales - a.totalSales),
      // Day status context
      activeDay: activeDayStr,
      isDayActive,
      isActiveDayView,
      fromDate: fromDate || activeDayStr,
      toDate: toDate || activeDayStr,
    });
  } catch (err) {
    console.error('[ArtistBonus] GET /sales-summary error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. ARTIST DETAIL (sales history + bonus history + progress to next bonus)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/artist-bonus/artist/:dishId?fromDate=&toDate=
// If no dates provided, returns ALL-TIME data (bonus history always visible regardless of day state).
router.get('/artist/:dishId', async (req, res) => {
  try {
    const pool = getPool();
    const { dishId } = req.params;
    await syncActiveDayTransactions(pool, dishId);
    let { fromDate, toDate } = req.query;

    // NOTE: We intentionally do NOT default to active business day here.
    // Bonus settlements must be possible at any time, even after Day End.

    if (fromDate && isNaN(new Date(fromDate).getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid fromDate format. Please use YYYY-MM-DD.' });
    }
    if (toDate && isNaN(new Date(toDate).getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid toDate format. Please use YYYY-MM-DD.' });
    }

    const today = new Date().toISOString().split('T')[0];
    // When explicit date range is given, use it; otherwise null = all-time
    const hasDates = !!(fromDate && toDate);
    // For sales history display: default to last 30 days if no date filter
    const salesFrom = fromDate || new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0];
    const salesTo   = toDate   || today;

    // Get artist info
    const artistRes = await pool.request()
      .input('dishId', sql.UniqueIdentifier, dishId)
      .query("SELECT DishId, Name FROM DishMaster WHERE DishId = @dishId");
    if (!artistRes.recordset.length) return res.status(404).json({ error: 'Artist not found' });
    const artist = artistRes.recordset[0];

    // Active rule (per-artist or global)
    const ruleRes = await pool.request()
      .input('dishId', sql.UniqueIdentifier, dishId)
      .query(`
        SELECT TOP 1 Id, ThresholdAmount, BonusAmount, IsRepeating, ArtistDishId
        FROM ArtistBonusMaster
        WHERE IsActive = 1
          AND (ArtistDishId = @dishId OR ArtistDishId IS NULL)
        ORDER BY CASE WHEN ArtistDishId IS NOT NULL THEN 0 ELSE 1 END, CreatedDate DESC
      `);
    const activeRule = ruleRes.recordset[0] || null;

    // Sales history from SettlementItemDetail (last 30 days default, or explicit date range)
    const salesHistRes = await pool.request()
      .input('dishId', sql.UniqueIdentifier, dishId)
      .input('fromDate', sql.Date, salesFrom)
      .input('toDate', sql.Date, salesTo)
      .input('artistName', sql.NVarChar(200), artist.Name)
      .query(`
        DECLARE @sgtStart DATETIME = CAST(@fromDate AS DATETIME);
        DECLARE @sgtEnd   DATETIME = DATEADD(DAY, 1, CAST(@toDate AS DATETIME));
        SELECT
          sh.LastSettlementDate AS SaleDate,
          sh.BillNo,
          sid.DishName AS ItemName,
          sid.Qty,
          CAST(sid.Qty * sid.Price AS DECIMAL(18,2)) AS Amount
        FROM SettlementHeader sh
        INNER JOIN SettlementItemDetail sid ON sh.SettlementID = sid.SettlementID
        INNER JOIN DishMaster d ON (
          sid.DishId = d.DishId 
          OR LTRIM(RTRIM(sid.DishName)) = d.Name
          OR sid.DishName LIKE '%' + d.Name + '%'
        )
        WHERE sh.IsCancelled = 0
          AND ISNULL(sh.OrderType, '') <> 'CASHBOX'
          AND sh.LastSettlementDate >= @sgtStart
          AND sh.LastSettlementDate <  @sgtEnd
          AND ISNULL(sid.Status, 'NORMAL') <> 'VOIDED'
          AND d.IsSplitDish = 1
          AND d.IsGroupDish = 0
          AND d.IsActive = 1
          AND d.DishId = @dishId
        UNION ALL
        SELECT
          acb.CreatedDate AS SaleDate,
          'CASHBOX' AS BillNo,
          'Cash Box Entry' AS ItemName,
          1 AS Qty,
          acb.Amount
        FROM ArtistCashBox acb
        WHERE LTRIM(RTRIM(acb.ArtistName)) = @artistName
          AND acb.CreatedDate >= @sgtStart
          AND acb.CreatedDate <  @sgtEnd
        ORDER BY SaleDate DESC
      `);

    // Bonus history (transactions + payments)
    const bonusHistRes = await pool.request()
      .input('dishId', sql.UniqueIdentifier, dishId)
      .query(`
        SELECT
          abt.Id,
          abt.SalesFromDate,
          abt.SalesToDate,
          abt.TotalSales,
          abt.BonusEarned,
          abt.ThresholdAmount,
          abt.BonusRuleAmount,
          abt.CreatedDate,
          ISNULL(pay.TotalPaid, 0) AS BonusPaid
        FROM ArtistBonusTransaction abt
        OUTER APPLY (
          SELECT SUM(PaymentAmount) AS TotalPaid
          FROM ArtistBonusPayment abp
          WHERE abp.BonusTransactionId = abt.Id
        ) pay
        WHERE abt.ArtistDishId = @dishId
        ORDER BY abt.SalesFromDate DESC
      `);

    const bonusHistory = bonusHistRes.recordset.map(r => ({
      ...r,
      pendingBonus: Math.max(0, Number(r.BonusEarned) - Number(r.BonusPaid)),
      status: deriveStatus(r.BonusEarned, r.BonusPaid),
    }));

    // Payment history
    const payHistRes = await pool.request()
      .input('dishId', sql.UniqueIdentifier, dishId)
      .query(`
        SELECT abp.Id, abp.BonusTransactionId, abp.PaymentAmount, abp.PaidDate, abp.PaidBy, abp.Remarks, abp.CreatedDate
        FROM ArtistBonusPayment abp
        WHERE abp.ArtistDishId = @dishId
        ORDER BY abp.PaidDate DESC
      `);

    // Summary totals — all-time from bonus history
    const totalSales = salesHistRes.recordset.reduce((s, r) => s + Number(r.Amount), 0);
    const totalPaidFromHistory = payHistRes.recordset.reduce((s, r) => s + Number(r.PaymentAmount), 0);
    const totalPaidFromTxns    = bonusHistory.reduce((s, r) => s + Number(r.BonusPaid), 0);
    const bonusPaid  = Math.max(totalPaidFromTxns, totalPaidFromHistory);

    const bonusEarned = bonusHistory.reduce((s, r) => s + Number(r.BonusEarned), 0);
    const pendingBonus = Math.max(0, bonusEarned - bonusPaid);

    // Period-specific values (only meaningful when explicit dates provided)
    const parsedFrom = hasDates ? new Date(fromDate) : null;
    const parsedTo   = hasDates ? new Date(toDate)   : null;

    const periodTxns = hasDates ? bonusHistory.filter(r => {
      const fromD = new Date(r.SalesFromDate);
      const toD = new Date(r.SalesToDate);
      return fromD >= parsedFrom && toD <= parsedTo;
    }) : bonusHistory;

    const periodBonusEarned = hasDates
      ? (periodTxns.reduce((s, r) => s + Number(r.BonusEarned), 0) || (
          activeRule ? calculateBonus(totalSales, activeRule.ThresholdAmount, activeRule.BonusAmount, activeRule.IsRepeating) : 0
        ))
      : bonusEarned;

    const periodTxnIds = new Set(periodTxns.map(t => t.Id));
    const periodPayments = payHistRes.recordset.filter(r => {
      if (periodTxnIds.has(r.BonusTransactionId)) return true;
      if (!hasDates) return true;
      const paidD = new Date(r.PaidDate);
      return paidD >= parsedFrom && paidD <= parsedTo;
    });
    const periodBonusPaid = periodPayments.reduce((s, r) => s + Number(r.PaymentAmount), 0);
    const periodPending = Math.max(0, periodBonusEarned - periodBonusPaid);

    const activeDayCtx = await getActiveStartDate(pool);
    const isDayActive = !!activeDayCtx;
    const activeDayStr = activeDayCtx || today;

    // Progress to next bonus milestone (use active business day if no dates provided)
    let progressToNext = null;
    if (activeRule) {
      const { ThresholdAmount, BonusAmount, IsRepeating } = activeRule;
      const progressSalesFrom = fromDate || activeDayStr;
      const progressSalesTo   = toDate   || activeDayStr;
      const currentSalesTotal = await getArtistSales(pool, dishId, artist.Name, progressSalesFrom, progressSalesTo);
      const currentTier = Math.floor(currentSalesTotal / ThresholdAmount);
      const nextMilestone = (currentTier + 1) * ThresholdAmount;
      const remaining = nextMilestone - currentSalesTotal;
      progressToNext = {
        currentSales: currentSalesTotal,
        nextMilestone,
        remaining: Math.max(0, remaining),
        currentBonus: calculateBonus(currentSalesTotal, ThresholdAmount, BonusAmount, IsRepeating),
        nextBonus: BonusAmount,
        progressPct: Math.min(100, (currentSalesTotal % ThresholdAmount) / ThresholdAmount * 100),
      };
    }

    res.json({
      success: true,
      artist: { dishId: artist.DishId, name: artist.Name },
      summary: { 
        totalSales, 
        bonusEarned, 
        bonusPaid, 
        pendingBonus,
        periodSales: totalSales,
        periodEarned: periodBonusEarned,
        periodPaid: periodBonusPaid,
        periodPending: periodPending,
        lifetimeEarned: bonusEarned,
        lifetimePaid: bonusPaid,
        lifetimePending: pendingBonus
      },
      activeRule,
      progressToNext,
      salesHistory: salesHistRes.recordset,
      bonusHistory,
      paymentHistory: payHistRes.recordset,
      // Day context
      isDayActive,
      activeDay: activeDayStr,
      isActiveDayView: false,
      fromDate: fromDate || null,
      toDate: toDate || null,
    });
  } catch (err) {
    console.error('[ArtistBonus] GET /artist/:dishId error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. BONUS TRANSACTIONS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/artist-bonus/transactions?fromDate=&toDate=&artistDishId=&status=
router.get('/transactions', async (req, res) => {
  try {
    const pool = getPool();
    const { fromDate, toDate, artistDishId, status } = req.query;

    const request = pool.request();
    let where = '1=1';

    if (fromDate) {
      request.input('fromDate', sql.Date, new Date(fromDate));
      where += ' AND CAST(abt.SalesFromDate AS DATE) >= @fromDate';
    }
    if (toDate) {
      request.input('toDate', sql.Date, new Date(toDate));
      where += ' AND CAST(abt.SalesToDate AS DATE) <= @toDate';
    }
    if (artistDishId) {
      request.input('artistDishId', sql.UniqueIdentifier, artistDishId);
      where += ' AND abt.ArtistDishId = @artistDishId';
    }

    const result = await request.query(`
      SELECT
        abt.Id, abt.ArtistDishId, abt.ArtistName,
        abt.SalesFromDate, abt.SalesToDate, abt.TotalSales,
        abt.ThresholdAmount, abt.BonusRuleAmount, abt.BonusEarned,
        abt.IsRepeating, abt.CreatedDate,
        ISNULL(pay.TotalPaid, 0) AS BonusPaid
      FROM ArtistBonusTransaction abt
      OUTER APPLY (
        SELECT SUM(PaymentAmount) AS TotalPaid
        FROM ArtistBonusPayment abp
        WHERE abp.BonusTransactionId = abt.Id
      ) pay
      WHERE ${where}
      ORDER BY abt.CreatedDate DESC
    `);

    let rows = result.recordset.map(r => ({
      ...r,
      pendingBonus: Math.max(0, Number(r.BonusEarned) - Number(r.BonusPaid)),
      status: deriveStatus(r.BonusEarned, r.BonusPaid),
    }));

    // Filter by derived status if requested
    if (status && status !== 'All') {
      rows = rows.filter(r => r.status === status);
    }

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[ArtistBonus] GET /transactions error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/artist-bonus/pending
router.get('/pending', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT
        abt.Id, abt.ArtistDishId, abt.ArtistName,
        abt.SalesFromDate, abt.SalesToDate, abt.TotalSales,
        abt.BonusEarned, abt.ThresholdAmount, abt.BonusRuleAmount, abt.CreatedDate,
        ISNULL(pay.TotalPaid, 0) AS BonusPaid
      FROM ArtistBonusTransaction abt
      OUTER APPLY (
        SELECT SUM(PaymentAmount) AS TotalPaid
        FROM ArtistBonusPayment abp
        WHERE abp.BonusTransactionId = abt.Id
      ) pay
      WHERE abt.BonusEarned > ISNULL(pay.TotalPaid, 0)
      ORDER BY abt.CreatedDate DESC
    `);

    const rows = result.recordset.map(r => ({
      ...r,
      pendingBonus: Math.max(0, Number(r.BonusEarned) - Number(r.BonusPaid)),
      status: deriveStatus(r.BonusEarned, r.BonusPaid),
    }));

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[ArtistBonus] GET /pending error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. CALCULATE BONUS TRANSACTIONS (Idempotent)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/artist-bonus/calculate
// Body: { fromDate?, toDate? }  — if omitted, defaults to the active business day
router.post('/calculate', async (req, res) => {
  try {
    const pool = getPool();
    let { fromDate, toDate } = req.body;

    // Default to active business day if no dates supplied
    if (!fromDate || !toDate) {
      const activeDay = await getActiveStartDate(pool);
      if (!activeDay) {
        return res.status(400).json({ error: 'No active business day found. Please start a day first.' });
      }
      fromDate = fromDate || activeDay;
      toDate   = toDate   || activeDay;
    }

    if (isNaN(new Date(fromDate).getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid fromDate format. Please use YYYY-MM-DD.' });
    }
    if (isNaN(new Date(toDate).getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid toDate format. Please use YYYY-MM-DD.' });
    }

    const parsedFrom = new Date(fromDate);
    const parsedTo   = new Date(toDate);

    // 1. Fetch active global bonus rule
    const ruleRes = await pool.request().query(`
      SELECT TOP 1 Id, ThresholdAmount, BonusAmount, IsRepeating
      FROM ArtistBonusMaster WHERE IsActive = 1 AND ArtistDishId IS NULL
      ORDER BY CreatedDate DESC
    `);
    const globalRule = ruleRes.recordset[0];
    if (!globalRule) return res.status(400).json({ error: 'No active bonus rule found. Please create one in Bonus Master.' });

    // 2. Fetch all artist dishes
    const artistsResult = await pool.request().query(`
      SELECT DishId, Name FROM DishMaster
      WHERE IsSplitDish = 1 AND IsGroupDish = 0 AND IsActive = 1
    `);
    const artists = artistsResult.recordset;

    const results = [];

    for (const artist of artists) {
      // 2a. Check for per-artist rule override
      const artistRuleRes = await pool.request()
        .input('dishId', sql.UniqueIdentifier, artist.DishId)
        .query(`
          SELECT TOP 1 Id, ThresholdAmount, BonusAmount, IsRepeating
          FROM ArtistBonusMaster
          WHERE IsActive = 1 AND ArtistDishId = @dishId
          ORDER BY CreatedDate DESC
        `);
      const rule = artistRuleRes.recordset[0] || globalRule;

      // 2b. Aggregate sales
      const totalSales = await getArtistSales(pool, artist.DishId, artist.Name, parsedFrom, parsedTo);

      // 2c. Calculate bonus
      const bonusEarned = calculateBonus(totalSales, rule.ThresholdAmount, rule.BonusAmount, rule.IsRepeating);

      // 2d. Idempotency: conditional insert inside a concurrent-safe lock to prevent race conditions
      const newId = crypto.randomUUID();
      const insertResult = await pool.request()
        .input('id', sql.UniqueIdentifier, newId)
        .input('artistDishId', sql.UniqueIdentifier, artist.DishId)
        .input('artistName', sql.NVarChar(200), artist.Name)
        .input('fromDate', sql.DateTime, parsedFrom)
        .input('toDate', sql.DateTime, parsedTo)
        .input('totalSales', sql.Decimal(18, 2), totalSales)
        .input('threshold', sql.Decimal(18, 2), rule.ThresholdAmount)
        .input('bonusRuleAmount', sql.Decimal(18, 2), rule.BonusAmount)
        .input('bonusEarned', sql.Decimal(18, 2), bonusEarned)
        .input('isRepeating', sql.Bit, rule.IsRepeating)
        .query(`
          IF NOT EXISTS (
            SELECT 1 FROM ArtistBonusTransaction WITH (UPDLOCK, HOLDLOCK)
            WHERE ArtistDishId = @artistDishId
              AND CAST(SalesFromDate AS DATE) <= @toDate
              AND CAST(SalesToDate   AS DATE) >= @fromDate
          )
          BEGIN
            INSERT INTO ArtistBonusTransaction
              (Id, ArtistDishId, ArtistName, SalesFromDate, SalesToDate, TotalSales,
               ThresholdAmount, BonusRuleAmount, BonusEarned, IsRepeating)
            VALUES
              (@id, @artistDishId, @artistName, @fromDate, @toDate, @totalSales,
               @threshold, @bonusRuleAmount, @bonusEarned, @isRepeating);
            SELECT 1 AS inserted;
          END
          ELSE
          BEGIN
            SELECT 0 AS inserted;
          END
        `);

      const inserted = insertResult.recordset?.[0]?.inserted === 1;
      if (inserted) {
        results.push({ artist: artist.Name, totalSales, bonusEarned, action: 'created' });
      } else {
        results.push({ artist: artist.Name, totalSales, bonusEarned, action: 'skipped_exists' });
      }
    }

    res.json({ success: true, results, fromDate, toDate });
  } catch (err) {
    console.error('[ArtistBonus] POST /calculate error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. PAYMENTS (partial/multiple payments per transaction)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/artist-bonus/payments?transactionId=&artistDishId=
router.get('/payments', async (req, res) => {
  try {
    const pool = getPool();
    const { transactionId, artistDishId } = req.query;
    const request = pool.request();
    let where = '1=1';
    if (transactionId) {
      request.input('transactionId', sql.UniqueIdentifier, transactionId);
      where += ' AND BonusTransactionId = @transactionId';
    }
    if (artistDishId) {
      request.input('artistDishId', sql.UniqueIdentifier, artistDishId);
      where += ' AND ArtistDishId = @artistDishId';
    }
    const result = await request.query(`
      SELECT Id, BonusTransactionId, ArtistDishId, ArtistName,
             PaymentAmount, PaidDate, PaidBy, Remarks, CreatedDate
      FROM ArtistBonusPayment WHERE ${where}
      ORDER BY PaidDate DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('[ArtistBonus] GET /payments error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/artist-bonus/pay
// Body: { transactionId, paymentAmount, remarks }
router.post('/pay', async (req, res) => {
  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  let isTransactionActive = false;
  try {
    const { transactionId, paymentAmount, remarks } = req.body;
    const paidBy = req.user?.userName || req.user?.username || 'Admin';

    if (!transactionId) return res.status(400).json({ error: 'transactionId is required' });
    if (!paymentAmount || Number(paymentAmount) <= 0) return res.status(400).json({ error: 'paymentAmount must be > 0' });

    await transaction.begin();
    isTransactionActive = true;

    // Fetch transaction with lock to prevent race conditions
    const txnRes = await transaction.request()
      .input('id', sql.UniqueIdentifier, transactionId)
      .query("SELECT Id, ArtistDishId, ArtistName, BonusEarned FROM ArtistBonusTransaction WITH (UPDLOCK, HOLDLOCK) WHERE Id = @id");
    
    if (!txnRes.recordset.length) {
      await transaction.rollback();
      isTransactionActive = false;
      return res.status(404).json({ error: 'Bonus transaction not found' });
    }
    const txn = txnRes.recordset[0];

    // Compute current total paid using the active transaction
    const paidRes = await transaction.request()
      .input('txnId', sql.UniqueIdentifier, transactionId)
      .query("SELECT ISNULL(SUM(PaymentAmount), 0) AS TotalPaid FROM ArtistBonusPayment WHERE BonusTransactionId = @txnId");
    const currentPaid = Number(paidRes.recordset[0].TotalPaid);
    const pending     = Number(txn.BonusEarned) - currentPaid;

    if (pending <= 0) {
      await transaction.rollback();
      isTransactionActive = false;
      return res.status(409).json({ error: 'This bonus has already been fully paid.' });
    }
    if (Number(paymentAmount) > pending) {
      await transaction.rollback();
      isTransactionActive = false;
      return res.status(400).json({ error: `Payment amount ($${paymentAmount}) exceeds pending bonus ($${pending.toFixed(2)}).` });
    }

    // Insert payment record
    const payId = crypto.randomUUID();
    await transaction.request()
      .input('id', sql.UniqueIdentifier, payId)
      .input('txnId', sql.UniqueIdentifier, transactionId)
      .input('artistDishId', sql.UniqueIdentifier, txn.ArtistDishId)
      .input('artistName', sql.NVarChar(200), txn.ArtistName)
      .input('amount', sql.Decimal(18, 2), Number(paymentAmount))
      .input('paidBy', sql.NVarChar(100), paidBy)
      .input('remarks', sql.NVarChar(500), remarks || null)
      .query(`
        INSERT INTO ArtistBonusPayment
          (Id, BonusTransactionId, ArtistDishId, ArtistName, PaymentAmount, PaidBy, Remarks)
        VALUES
          (@id, @txnId, @artistDishId, @artistName, @amount, @paidBy, @remarks)
      `);

    await transaction.commit();
    isTransactionActive = false;

    const newPaid    = currentPaid + Number(paymentAmount);
    const newPending = Math.max(0, Number(txn.BonusEarned) - newPaid);

    res.json({
      success: true,
      paymentId: payId,
      bonusEarned: txn.BonusEarned,
      totalPaid: newPaid,
      pendingBonus: newPending,
      status: deriveStatus(txn.BonusEarned, newPaid),
    });
  } catch (err) {
    console.error('[ArtistBonus] POST /pay error:', err.message);
    if (isTransactionActive) {
      try {
        await transaction.rollback();
      } catch (rollbackErr) {
        console.error('[ArtistBonus] Rollback error:', rollbackErr.message);
      }
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. REPORTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/artist-bonus/reports/sales?fromDate=&toDate=
router.get('/reports/sales', async (req, res) => {
  try {
    const pool = getPool();
    const { fromDate, toDate } = req.query;
    const request = pool.request();
    let where = '1=1';
    if (fromDate) { request.input('fromDate', sql.Date, new Date(fromDate)); where += ' AND CAST(abt.SalesFromDate AS DATE) >= @fromDate'; }
    if (toDate)   { request.input('toDate',   sql.Date, new Date(toDate));   where += ' AND CAST(abt.SalesToDate   AS DATE) <= @toDate'; }

    const result = await request.query(`
      SELECT
        abt.ArtistName,
        SUM(abt.TotalSales)  AS TotalSales,
        SUM(abt.BonusEarned) AS BonusEarned,
        ISNULL(SUM(pay.TotalPaid), 0) AS BonusPaid
      FROM ArtistBonusTransaction abt
      OUTER APPLY (
        SELECT SUM(PaymentAmount) AS TotalPaid
        FROM ArtistBonusPayment abp
        WHERE abp.BonusTransactionId = abt.Id
      ) pay
      WHERE ${where}
      GROUP BY abt.ArtistName
      ORDER BY TotalSales DESC
    `);

    const rows = result.recordset.map(r => ({
      ...r,
      PendingBonus: Math.max(0, Number(r.BonusEarned) - Number(r.BonusPaid)),
    }));

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[ArtistBonus] GET /reports/sales error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/artist-bonus/reports/bonus-ledger?fromDate=&toDate=
router.get('/reports/bonus-ledger', async (req, res) => {
  try {
    const pool = getPool();
    const { fromDate, toDate } = req.query;
    const request = pool.request();
    let where = '1=1';
    if (fromDate) { request.input('fromDate', sql.Date, new Date(fromDate)); where += ' AND CAST(abt.SalesFromDate AS DATE) >= @fromDate'; }
    if (toDate)   { request.input('toDate',   sql.Date, new Date(toDate));   where += ' AND CAST(abt.SalesToDate   AS DATE) <= @toDate'; }

    const result = await request.query(`
      SELECT
        abt.Id, abt.ArtistName, abt.SalesFromDate, abt.SalesToDate,
        abt.TotalSales, abt.ThresholdAmount, abt.BonusRuleAmount,
        abt.BonusEarned, abt.IsRepeating, abt.CreatedDate,
        ISNULL(pay.TotalPaid, 0) AS BonusPaid
      FROM ArtistBonusTransaction abt
      OUTER APPLY (
        SELECT SUM(PaymentAmount) AS TotalPaid
        FROM ArtistBonusPayment abp
        WHERE abp.BonusTransactionId = abt.Id
      ) pay
      WHERE ${where}
      ORDER BY abt.CreatedDate DESC
    `);

    const rows = result.recordset.map(r => ({
      ...r,
      PendingBonus: Math.max(0, Number(r.BonusEarned) - Number(r.BonusPaid)),
      Status: deriveStatus(r.BonusEarned, r.BonusPaid),
    }));

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[ArtistBonus] GET /reports/bonus-ledger error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/artist-bonus/reports/payment-ledger?fromDate=&toDate=&artistDishId=
router.get('/reports/payment-ledger', async (req, res) => {
  try {
    const pool = getPool();
    const { fromDate, toDate, artistDishId } = req.query;
    const request = pool.request();
    let where = '1=1';
    if (fromDate)    { request.input('fromDate', sql.Date, new Date(fromDate)); where += ' AND CAST(abp.PaidDate AS DATE) >= @fromDate'; }
    if (toDate)      { request.input('toDate',   sql.Date, new Date(toDate));   where += ' AND CAST(abp.PaidDate AS DATE) <= @toDate'; }
    if (artistDishId){ request.input('artistDishId', sql.UniqueIdentifier, artistDishId); where += ' AND abp.ArtistDishId = @artistDishId'; }

    const result = await request.query(`
      SELECT
        abp.Id, abp.ArtistName, abp.PaymentAmount,
        abp.PaidDate, abp.PaidBy, abp.Remarks, abp.CreatedDate,
        abt.BonusEarned, abt.SalesFromDate, abt.SalesToDate
      FROM ArtistBonusPayment abp
      INNER JOIN ArtistBonusTransaction abt ON abp.BonusTransactionId = abt.Id
      WHERE ${where}
      ORDER BY abp.PaidDate DESC
    `);

    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('[ArtistBonus] GET /reports/payment-ledger error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/artist-bonus/reports/pending
router.get('/reports/pending', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT
        abt.ArtistName,
        abt.SalesFromDate, abt.SalesToDate,
        abt.BonusEarned, abt.CreatedDate,
        ISNULL(pay.TotalPaid, 0) AS BonusPaid
      FROM ArtistBonusTransaction abt
      OUTER APPLY (
        SELECT SUM(PaymentAmount) AS TotalPaid
        FROM ArtistBonusPayment abp
        WHERE abp.BonusTransactionId = abt.Id
      ) pay
      WHERE abt.BonusEarned > ISNULL(pay.TotalPaid, 0)
      ORDER BY abt.CreatedDate DESC
    `);

    const rows = result.recordset.map(r => ({
      ...r,
      PendingBonus: Math.max(0, Number(r.BonusEarned) - Number(r.BonusPaid)),
      Status: deriveStatus(r.BonusEarned, r.BonusPaid),
    }));

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[ArtistBonus] GET /reports/pending error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/artist-bonus/reports/performance?fromDate=&toDate=
// fromDate/toDate optional: when provided, also returns CustomSales for that period
router.get('/reports/performance', async (req, res) => {
  try {
    const pool = getPool();
    let { fromDate, toDate } = req.query;

    // Default to active business day if no dates supplied
    if (!fromDate || !toDate) {
      const activeDay = await getActiveStartDate(pool);
      if (activeDay) {
        fromDate = fromDate || activeDay;
        toDate   = toDate   || activeDay;
      }
    }

    const today = new Date();

    const dailyFrom  = new Date(today); dailyFrom.setHours(0,0,0,0);
    const weeklyFrom = new Date(today); weeklyFrom.setDate(today.getDate() - 6); weeklyFrom.setHours(0,0,0,0);
    const monthlyFrom = new Date(today.getFullYear(), today.getMonth(), 1);
    const yearlyFrom  = new Date(today.getFullYear(), 0, 1);

    const toLocalIsoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const dailyStr   = toLocalIsoDate(dailyFrom);
    const weeklyStr  = toLocalIsoDate(weeklyFrom);
    const monthlyStr = toLocalIsoDate(monthlyFrom);
    const yearlyStr  = toLocalIsoDate(yearlyFrom);
    const endStr     = toLocalIsoDate(new Date(today.getTime() + 86400000));

    const request = pool.request()
      .input('daily',   sql.VarChar, dailyStr)
      .input('weekly',  sql.VarChar, weeklyStr)
      .input('monthly', sql.VarChar, monthlyStr)
      .input('yearly',  sql.VarChar, yearlyStr)
      .input('sgtEnd',  sql.VarChar, endStr);

    // Build optional custom range inputs
    const hasCustomRange = !!(fromDate && toDate);
    if (hasCustomRange) {
      request.input('customFrom', sql.VarChar, fromDate);
      const nextDayOfTo = new Date(new Date(toDate).getTime() + 86400000);
      request.input('customTo',   sql.VarChar, toLocalIsoDate(nextDayOfTo));
    }

    function getSalesSumSubquery(fromDateParam, toDateParam, isLessThanToDate = true) {
      const toDateCompare = isLessThanToDate ? `< ${toDateParam}` : `<= ${toDateParam}`;
      return `(
        -- 1. App Sales
        ISNULL((
          SELECT SUM(CAST(sid.Qty*sid.Price AS DECIMAL(18,2)))
          FROM SettlementItemDetail sid
          INNER JOIN SettlementHeader sh ON sid.SettlementID = sh.SettlementID
          WHERE (sid.DishId = d.DishId OR LTRIM(RTRIM(sid.DishName)) = d.Name)
            AND sh.IsCancelled = 0 AND ISNULL(sid.Status,'NORMAL') <> 'VOIDED'
            AND ISNULL(sh.OrderType, '') <> 'CASHBOX'
            AND (
              (sh.start_date IS NOT NULL AND sh.start_date >= ${fromDateParam} AND sh.start_date ${toDateCompare})
              OR
              (sh.start_date IS NULL AND sh.LastSettlementDate >= ${fromDateParam} AND sh.LastSettlementDate ${toDateCompare})
            )
        ), 0) +
        -- 2. Professional Sales
        ISNULL((
          SELECT SUM(CAST(rod.TotalDetailLineAmount AS DECIMAL(18,2)))
          FROM RestaurantOrderDetail rod
          INNER JOIN RestaurantOrder ro ON rod.OrderId = ro.OrderId
          WHERE rod.DishId = d.DishId
            AND ISNULL(rod.StatusCode, 0) <> 0
            AND ISNULL(ro.StatusCode, 0) = 3
            AND (
              (ro.start_date IS NOT NULL AND ro.start_date >= ${fromDateParam} AND ro.start_date ${toDateCompare})
              OR
              (ro.start_date IS NULL AND ro.OrderDateTime >= ${fromDateParam} AND ro.OrderDateTime ${toDateCompare})
            )
            AND NOT EXISTS (SELECT 1 FROM SettlementHeader sh_dup WHERE sh_dup.BillNo = ro.OrderNumber)
        ), 0) +
        -- 3. CashBox Sales
        ISNULL((
          SELECT SUM(Amount)
          FROM ArtistCashBox acb
          WHERE LTRIM(RTRIM(acb.ArtistName)) = d.Name
            AND (
              (acb.start_date IS NOT NULL AND acb.start_date >= ${fromDateParam} AND acb.start_date ${toDateCompare})
              OR
              (acb.start_date IS NULL AND CAST(acb.CreatedDate AS DATE) >= ${fromDateParam} AND CAST(acb.CreatedDate AS DATE) ${toDateCompare})
            )
        ), 0)
      )`;
    }

    const customSalesExpr = hasCustomRange
      ? getSalesSumSubquery('@customFrom', '@customTo', true)
      : `0`;

    const dailySalesExpr  = getSalesSumSubquery('@daily', '@sgtEnd', true);
    const weeklySalesExpr = getSalesSumSubquery('@weekly', '@sgtEnd', true);
    const monthlySalesExpr = getSalesSumSubquery('@monthly', '@sgtEnd', true);
    const yearlySalesExpr = getSalesSumSubquery('@yearly', '@sgtEnd', true);

    const bonusEarnedExpr = hasCustomRange
      ? `ISNULL((SELECT SUM(abt.BonusEarned) FROM ArtistBonusTransaction abt WHERE abt.ArtistDishId = d.DishId AND abt.SalesFromDate >= @customFrom AND abt.SalesToDate < @customTo), 0)`
      : `ISNULL((SELECT SUM(abt.BonusEarned) FROM ArtistBonusTransaction abt WHERE abt.ArtistDishId = d.DishId), 0)`;

    const bonusPaidExpr = hasCustomRange
      ? `ISNULL((SELECT SUM(abp.PaymentAmount) FROM ArtistBonusPayment abp WHERE abp.ArtistDishId = d.DishId AND abp.PaidDate >= @customFrom AND abp.PaidDate < @customTo), 0)`
      : `ISNULL((SELECT SUM(abp.PaymentAmount) FROM ArtistBonusPayment abp WHERE abp.ArtistDishId = d.DishId), 0)`;

    const result = await request.query(`
      SELECT
        d.Name AS ArtistName,
        d.DishId AS ArtistDishId,

        -- Custom date range sales (if provided)
        ${customSalesExpr} AS CustomSales,

        -- Daily
        ${dailySalesExpr} AS DailySales,

        -- Weekly
        ${weeklySalesExpr} AS WeeklySales,

        -- Monthly
        ${monthlySalesExpr} AS MonthlySales,

        -- Yearly
        ${yearlySalesExpr} AS YearlySales,

        -- Bonus totals
        ${bonusEarnedExpr} AS TotalBonusEarned,
        ${bonusPaidExpr} AS TotalBonusPaid

      FROM DishMaster d
      WHERE d.IsSplitDish = 1 AND d.IsGroupDish = 0 AND d.IsActive = 1
      ORDER BY d.Name
    `);

    const rows = result.recordset.map(r => ({
      ...r,
      PendingBonus: Math.max(0, Number(r.TotalBonusEarned) - Number(r.TotalBonusPaid)),
    }));

    res.json({
      success: true,
      data: rows,
      fromDate: fromDate || null,
      toDate: toDate || null,
      hasCustomRange,
    });
  } catch (err) {
    console.error('[ArtistBonus] GET /reports/performance error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: processDayEndBonusCalculations
// Called by settlementRoutes.js during POST /day-end
// Reads the current active StartDate, finalizes bonus transactions for all
// artists for that day, then returns a summary of what was calculated.
// ─────────────────────────────────────────────────────────────────────────────
async function processDayEndBonusCalculations(pool) {
  const activeDay = await getActiveStartDate(pool);
  if (!activeDay) {
    console.warn('[ArtistBonus] processDayEndBonusCalculations: no active business day found, skipping.');
    return { skipped: true, reason: 'no_active_day' };
  }

  const parsedFrom = new Date(activeDay);
  const parsedTo   = new Date(activeDay);

  // Fetch global bonus rule
  const ruleRes = await pool.request().query(`
    SELECT TOP 1 Id, ThresholdAmount, BonusAmount, IsRepeating
    FROM ArtistBonusMaster WHERE IsActive = 1 AND ArtistDishId IS NULL
    ORDER BY CreatedDate DESC
  `);
  const globalRule = ruleRes.recordset[0];
  if (!globalRule) {
    console.warn('[ArtistBonus] processDayEndBonusCalculations: no active global rule, skipping.');
    return { skipped: true, reason: 'no_rule' };
  }

  // Fetch all active artist dishes
  const artistsResult = await pool.request().query(`
    SELECT DishId, Name FROM DishMaster
    WHERE IsSplitDish = 1 AND IsGroupDish = 0 AND IsActive = 1
  `);
  const artists = artistsResult.recordset;

  const results = [];
  for (const artist of artists) {
    try {
      // Per-artist rule override
      const artistRuleRes = await pool.request()
        .input('dishId', sql.UniqueIdentifier, artist.DishId)
        .query(`
          SELECT TOP 1 ThresholdAmount, BonusAmount, IsRepeating
          FROM ArtistBonusMaster
          WHERE IsActive = 1 AND ArtistDishId = @dishId
          ORDER BY CreatedDate DESC
        `);
      const rule = artistRuleRes.recordset[0] || globalRule;

      // Aggregate sales for this active day
      const totalSales = await getArtistSales(pool, artist.DishId, artist.Name, parsedFrom, parsedTo);

      // Calculate bonus earned
      const bonusEarned = calculateBonus(totalSales, rule.ThresholdAmount, rule.BonusAmount, rule.IsRepeating);

      // Idempotency: conditional insert inside a concurrent-safe lock to prevent race conditions
      const newId = crypto.randomUUID();
      const insertResult = await pool.request()
        .input('id', sql.UniqueIdentifier, newId)
        .input('artistDishId', sql.UniqueIdentifier, artist.DishId)
        .input('artistName', sql.NVarChar(200), artist.Name)
        .input('fromDate', sql.DateTime, parsedFrom)
        .input('toDate', sql.DateTime, parsedTo)
        .input('totalSales', sql.Decimal(18, 2), totalSales)
        .input('threshold', sql.Decimal(18, 2), rule.ThresholdAmount)
        .input('bonusRuleAmount', sql.Decimal(18, 2), rule.BonusAmount)
        .input('bonusEarned', sql.Decimal(18, 2), bonusEarned)
        .input('isRepeating', sql.Bit, rule.IsRepeating)
        .query(`
          IF NOT EXISTS (
            SELECT 1 FROM ArtistBonusTransaction WITH (UPDLOCK, HOLDLOCK)
            WHERE ArtistDishId = @artistDishId
              AND CAST(SalesFromDate AS DATE) <= @toDate
              AND CAST(SalesToDate   AS DATE) >= @fromDate
          )
          BEGIN
            INSERT INTO ArtistBonusTransaction
              (Id, ArtistDishId, ArtistName, SalesFromDate, SalesToDate, TotalSales,
               ThresholdAmount, BonusRuleAmount, BonusEarned, IsRepeating)
            VALUES
              (@id, @artistDishId, @artistName, @fromDate, @toDate, @totalSales,
               @threshold, @bonusRuleAmount, @bonusEarned, @isRepeating);
            SELECT 1 AS inserted;
          END
          ELSE
          BEGIN
            SELECT 0 AS inserted;
          END
        `);

      const inserted = insertResult.recordset?.[0]?.inserted === 1;
      if (inserted) {
        results.push({ artist: artist.Name, totalSales, bonusEarned, action: 'created' });
      } else {
        results.push({ artist: artist.Name, totalSales, bonusEarned, action: 'skipped_exists' });
      }
    } catch (artistErr) {
      console.error(`[ArtistBonus] processDayEndBonusCalculations error for ${artist.Name}:`, artistErr.message);
      results.push({ artist: artist.Name, error: artistErr.message, action: 'error' });
    }
  }

  console.log(`[ArtistBonus] Day-End bonus finalization for ${activeDay}:`, results);
  return { success: true, activeDay, results };
}

module.exports = router;
module.exports.processDayEndBonusCalculations = processDayEndBonusCalculations;
