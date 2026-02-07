# Complete Flow: Market Creation → Trading → Resolution

## 📊 Overview Flow

```
1. Market Creation (Factory)
   ↓
2. Market Initialization (Bootstrap)
   ↓
3. Primary Trading (Parimutuel - Minting)
   ↓
4. Secondary Trading (OrderBook - Transfers)
   ↓
5. Settlement (Bot)
   ↓
6. Redemption (Users)
```

---

## 🔨 Phase 1: Market Creation

### Step 1.1: Factory Creates Market
**Who:** Protocol owner calls `factory.createMarket(...)`

**What happens:**
```solidity
factory.createMarket(
  tokenAddress: 0x...ETH,      // Token to track
  lowerBound: 3000_000000,     // $3000 (6 decimals)
  upperBound: 3100_000000,      // $3100 (6 decimals)
  expiryTimestamp: 1735689600,  // 20 minutes from now (for testing)
  boundTokenName: "ETH-24h-BOUND",
  boundTokenSymbol: "ETH24B",
  breakTokenName: "ETH-24h-BREAK",
  breakTokenSymbol: "ETH24R"
)
```

**Contract actions:**
1. Deploys **2 new token contracts** (BOUND + BREAK)
2. Deploys **1 new market contract**
3. Transfers token ownership to market
4. Calls `market.initialize(...)`
5. Registers market in factory
6. Emits `MarketCreated` event

**Result:**
- Market contract: `0xMarket123...`
- BOUND token: `0xBoundToken...`
- BREAK token: `0xBreakToken...`
- Factory registry updated

---

## 🚀 Phase 2: Market Initialization (Bootstrap)

### Step 2.1: Market Initializes
**Who:** Factory calls `market.initialize(...)` automatically

**What happens:**
```solidity
market.initialize(
  tokenAddress: 0x...ETH,
  lowerBound: 3000_000000,
  upperBound: 3100_000000,
  expiryTimestamp: 1735689600
)
```

**Contract actions:**
1. Sets market config (bounds, expiry, etc.)
2. Owner transfers $20 USDC to market:
   - $10 for BOUND pool
   - $10 for BREAK pool
3. Mints tokens to burn address:
   - 10 BOUND tokens → `0x0000...dEaD`
   - 10 BREAK tokens → `0x0000...dEaD`
4. Initializes pools:
   - `boundPool = $10`
   - `breakPool = $10`
5. Emits `MarketInitialized` event

**Result:**
- Initial price: **$0.50 / $0.50** (50/50 split)
- Market ready for trading
- Bootstrap tokens burned (protocol never holds)

**Bot action:**
- Settlement bot subscribes to `MarketCreated` event
- Bot adds market to `markets-storage.json`:
  ```json
  {
    "0xMarket123": {
      "expiry": 1735689600,
      "timeLeft": 1200
    }
  }
  ```

---

## 💰 Phase 3: Primary Trading (Parimutuel - Minting)

### Step 3.1: User Buys BOUND
**Who:** User calls `market.buyBound($100)`

**What happens:**
```solidity
market.buyBound(100_000000)  // $100 USDC
```

**Contract actions:**
1. Transfers $100 USDC from user → market
2. Calculates current price:
   ```
   totalPool = boundPool + breakPool = $10 + $10 = $20
   price = boundPool / totalPool = $10 / $20 = 0.5 (50%)
   ```
3. Calculates tokens to mint:
   ```
   tokens = $100 / 0.5 = 200 tokens
   ```
4. Mints 200 BOUND tokens → user's wallet
5. Updates pool: `boundPool += $100` → `boundPool = $110`
6. Emits `BoundPurchased` event

**Result:**
- User receives: **200 BOUND tokens**
- New price: **$110 / $120 = 91.67%** (BOUND more expensive now)
- Pool: `boundPool = $110`, `breakPool = $10`

### Step 3.2: Another User Buys BREAK
**Who:** User calls `market.buyBreak($50)`

**What happens:**
```solidity
market.buyBreak(50_000000)  // $50 USDC
```

**Contract actions:**
1. Transfers $50 USDC from user → market
2. Calculates current price:
   ```
   totalPool = $110 + $10 = $120
   price = breakPool / totalPool = $10 / $120 = 0.0833 (8.33%)
   ```
3. Calculates tokens:
   ```
   tokens = $50 / 0.0833 = 600 tokens
   ```
4. Mints 600 BREAK tokens → user's wallet
5. Updates pool: `breakPool += $50` → `breakPool = $60`
6. Emits `BreakPurchased` event

**Result:**
- User receives: **600 BREAK tokens**
- New price: **$110 / $170 = 64.7%** (BOUND) vs **35.3%** (BREAK)
- Pool: `boundPool = $110`, `breakPool = $60`

**Key point:** Price updates **dynamically** with each trade!

---

## 🔄 Phase 4: Secondary Trading (OrderBook - Early Exit)

### Step 4.1: User Sells BOUND (Early Exit)
**Who:** User calls `orderbook.placeSellOrder(...)`

**What happens:**
```solidity
orderbook.placeSellOrder(
  market: 0xMarket123,
  token: 0xBoundToken,
  price: 400000,      // $0.40 per token (6 decimals)
  amount: 100         // 100 BOUND tokens
)
```

**Contract actions:**
1. Transfers 100 BOUND tokens from user → orderbook (escrow)
2. Tries to match against existing buy orders
3. If no match → adds to sell orderbook
4. Emits `OrderPlaced` event

**Result:**
- User's tokens locked in orderbook
- Order visible to other users
- User can cancel anytime

### Step 4.2: Another User Buys from OrderBook
**Who:** User calls `orderbook.placeBuyOrder(...)`

**What happens:**
```solidity
orderbook.placeBuyOrder(
  market: 0xMarket123,
  token: 0xBoundToken,
  price: 400000,      // $0.40 per token
  amount: 100         // 100 tokens
)
```

**Contract actions:**
1. Transfers $40 USDC from user → orderbook
2. **Matches instantly** (Somnia reactivity - same transaction!)
3. Transfers 100 BOUND tokens → buyer
4. Transfers $40 USDC → seller
5. Emits `OrderMatched` event

**Result:**
- Seller exits early (got $40 instead of waiting for settlement)
- Buyer now holds tokens (will redeem if wins)
- No new tokens minted (just transfer)

**Key point:** OrderBook is **separate** from parimutuel - just transfers existing tokens!

---

## ⏰ Phase 5: Settlement (Bot)

### Step 5.1: Market Expires
**When:** `block.timestamp >= expiryTimestamp`

**What happens:**
- Settlement bot monitoring blocks via `provider.on("block")`
- Bot checks `markets-storage.json` for expired markets
- Finds market expired → triggers settlement

### Step 5.2: Bot Fetches Price
**Who:** Settlement bot calls oracle

**What happens:**
```javascript
// Bot gets price from CoinGecko/Chainlink
const finalPrice = await getPriceFromCoinGecko("ethereum");
// Returns: 3050_000000 ($3050 in 6 decimals)
```

### Step 5.3: Bot Settles Market
**Who:** Bot calls `market.settle($3050)`

**What happens:**
```solidity
market.settle(3050_000000)  // $3050 final price
```

**Contract actions:**
1. Checks: `$3050 >= $3000 && $3050 <= $3100` → **TRUE**
2. Sets `boundWins = true`
3. Calculates winnings:
   ```
   totalPool = $110 + $60 = $170
   fee = $170 * 2% = $3.40
   winnings = $170 - $3.40 = $166.60
   ```
4. Calculates redemption rate:
   ```
   totalBOUNDSupply = 200 (from user) + 10 (burned) = 210
   redemptionRate = $166.60 / 210 = $0.7933 per token
   ```
5. Transfers $3.40 fee → owner
6. Sets `marketConfig.settled = true`
7. Emits `MarketSettled` event

**Result:**
- Market settled: **BOUND wins** ✅
- Redemption rate: **$0.7933 per BOUND token**
- BREAK tokens: **worth $0** (losers)

**Bot action:**
- Removes market from `markets-storage.json`
- Bot continues monitoring other markets

---

## 💸 Phase 6: Redemption (Users)

### Step 6.1: Winner Redeems BOUND
**Who:** User calls `market.redeem(true, 200)`

**What happens:**
```solidity
market.redeem(
  isBound: true,    // Redeeming BOUND tokens
  amount: 200       // 200 tokens
)
```

**Contract actions:**
1. Checks: `boundWins == true` ✅
2. Checks: User has 200 BOUND tokens ✅
3. Burns 200 BOUND tokens from user
4. Calculates payout:
   ```
   payout = 200 * $0.7933 = $158.66
   ```
5. Transfers $158.66 USDC → user
6. Emits `TokensRedeemed` event

**Result:**
- User invested: **$100** (original buy)
- User received: **$158.66** (after fees)
- **Profit: $58.66** 🎉

### Step 6.2: Loser Tries to Redeem BREAK
**Who:** User calls `market.redeem(false, 600)`

**What happens:**
```solidity
market.redeem(
  isBound: false,   // Redeeming BREAK tokens
  amount: 600       // 600 tokens
)
```

**Contract actions:**
1. Checks: `boundWins == true` → **BREAK lost** ❌
2. **Reverts:** "BREAK did not win"
3. User keeps tokens (worthless, can't redeem)

**Result:**
- User invested: **$50**
- User received: **$0**
- **Loss: $50** 💸

---

## 📈 Complete Example Timeline

```
T+0min:   Factory creates market
          → Market initialized (bootstrap $10/$10)
          → Price: 50%/50%

T+1min:   Alice buys $100 BOUND
          → Receives 200 BOUND tokens
          → Price: 91.67%/8.33%

T+2min:   Bob buys $50 BREAK
          → Receives 600 BREAK tokens
          → Price: 64.7%/35.3%

T+5min:   Alice sells 100 BOUND on orderbook @ $0.40
          → Order placed (waiting for buyer)

T+6min:   Charlie buys 100 BOUND from orderbook @ $0.40
          → Alice gets $40 (early exit)
          → Charlie now holds 100 BOUND

T+20min:  Market expires
          → Bot detects expiry
          → Bot fetches price: $3050
          → Bot settles: BOUND wins
          → Redemption rate: $0.7933 per BOUND

T+21min:  Charlie redeems 100 BOUND
          → Gets $79.33 USDC

T+22min:  Bob tries to redeem 600 BREAK
          → Reverts (BREAK lost)
          → Bob keeps worthless tokens
```

---

## 🔑 Key Points

1. **Market Creation:** Factory deploys 3 contracts (market + 2 tokens)
2. **Bootstrap:** $20 initial liquidity sets 50/50 price
3. **Primary Trading:** Users buy → tokens minted → price updates dynamically
4. **Secondary Trading:** Users trade existing tokens (no minting)
5. **Settlement:** Bot monitors → fetches price → settles automatically
6. **Redemption:** Winners redeem for USDC, losers get nothing

**All on-chain, all automatic, all using Somnia's reactivity!** 🚀
