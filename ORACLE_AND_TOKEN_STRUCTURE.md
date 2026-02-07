# Oracle Setup & Token Structure

## ✅ BOUND and BREAK Tokens: **PER MARKET**

**Confirmed:** Each market gets its own unique token contracts!

### How It Works:

```solidity
// In BrimdexParimutuelMarketFactory.createMarket()
boundToken = address(new BrimdexParimutuelToken(...));  // NEW contract
breakToken = address(new BrimdexParimutuelToken(...));  // NEW contract
```

**Example:**
- **ETH-24h market:**
  - Market: `0xMarket1...`
  - BOUND token: `0xBound1...` (unique)
  - BREAK token: `0xBreak1...` (unique)

- **ETH-7d market:**
  - Market: `0xMarket2...`
  - BOUND token: `0xBound2...` (different!)
  - BREAK token: `0xBreak2...` (different!)

**Why per-market?**
- Complete isolation between markets
- Each market has its own token supply
- No cross-market interference
- Factory tracks: `marketToBoundToken[market]` and `marketToBreakToken[market]`

---

## 🔮 Oracle Options

### Current Setup: CoinGecko (Off-Chain API)

**Location:** `scripts/settle-markets.cjs`

```javascript
const ORACLE_TYPE = process.env.ORACLE_TYPE || "coingecko";
```

**Pros:**
- ✅ Free (no API key needed)
- ✅ Works on any chain
- ✅ Easy to use

**Cons:**
- ❌ Off-chain (requires bot to fetch)
- ❌ Rate limits (free tier)
- ❌ Not native to Somnia

### Alternative: Chainlink (On-Chain)

**Setup:**
```javascript
ORACLE_TYPE=chainlink
```

**Pros:**
- ✅ On-chain (no bot needed, can call directly from contract)
- ✅ Decentralized
- ✅ Standard oracle solution

**Cons:**
- ❌ Requires Chainlink feeds deployed on Somnia
- ❌ Need feed addresses for each token

### Somnia Native Oracles?

**Need to check:**
- Does Somnia have native oracle infrastructure?
- Are there Somnia-specific oracle solutions?
- What oracle services are deployed on Somnia testnet/mainnet?

**Recommendation:**
1. Check Somnia documentation for oracle integrations
2. Look for:
   - Chainlink on Somnia
   - Pyth Network on Somnia
   - Somnia's own oracle system
   - Other oracle providers

---

## 🔧 How to Switch Oracles

### Option 1: Use Chainlink (if available on Somnia)

1. Find Chainlink price feed addresses on Somnia
2. Update `settle-markets.cjs`:
   ```javascript
   const CHAINLINK_FEEDS = {
     "0xYourTokenAddress": "0xChainlinkFeedAddress",
   };
   ```
3. Set env var: `ORACLE_TYPE=chainlink`

### Option 2: Use Somnia Native Oracle

1. Research Somnia's oracle system
2. Update `getTokenPrice()` function in `settle-markets.cjs`
3. Add Somnia-specific oracle integration

### Option 3: Keep CoinGecko (Current)

- Works fine for now
- Can switch later when Somnia oracles are available
- Bot handles fetching off-chain

---

## 📋 Next Steps

1. **Research Somnia Oracles:**
   - Check Somnia docs: https://docs.somnia.network
   - Look for oracle integrations
   - Check if Chainlink/Pyth are deployed

2. **If Native Oracle Found:**
   - Update `settle-markets.cjs` to use it
   - Consider making settlement fully on-chain (no bot needed)

3. **Current Setup:**
   - CoinGecko works for testing
   - Bot fetches price and settles
   - Can upgrade later

---

## 🎯 Summary

- **Tokens:** ✅ Per market (each market = 2 new token contracts)
- **Oracle:** ⚠️ Currently CoinGecko (off-chain), need to research Somnia native options
- **Action:** Research Somnia oracle ecosystem and update if better options available
