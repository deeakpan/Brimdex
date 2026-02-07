# BrimDex Parimutuel System

## Architecture

### Core Contracts

1. **BrimdexParimutuelMarket.sol** - Main market contract
   - `buyBound()` / `buyBreak()` - Users buy tokens, price updates dynamically
   - `settle()` - Oracle reports outcome, calculates redemption rate
   - `redeem()` - Users redeem winning tokens for USDC
   - Bootstrap: $10 BOUND + $10 BREAK to burn address

2. **BrimdexParimutuelOrderBook.sol** - Secondary market for early exits
   - `placeSellOrder()` - Sell tokens to other users
   - `placeBuyOrder()` - Buy tokens from other users
   - Simple matching, no minting (just transfers)
   - Per-market isolation

3. **BrimdexParimutuelToken.sol** - ERC20 tokens (BOUND/BREAK)
   - Mintable by market
   - Burnable on redemption
   - 6 decimals (same as USDC)

4. **BrimdexParimutuelMarketFactory.sol** - Creates markets
   - Deploys tokens + market
   - Sets up ownership
   - Registers markets

## How It Works

### Primary Market (Parimutuel)

**Buying:**
```
User: buyBound($100)
→ Price calculated: boundPool / (boundPool + breakPool)
→ Tokens minted: $100 / price
→ Pool updates: boundPool += $100
→ Price updates automatically
```

**Settlement:**
```
Oracle: Price = $3050 (within range)
→ BOUND wins
→ Redemption rate = winnings / totalBOUNDSupply
→ Users redeem tokens for USDC
```

### Secondary Market (OrderBook)

**Early Exit:**
```
Alice: placeSellOrder(200 BOUND @ $0.40)
Bob: placeBuyOrder(200 BOUND @ $0.40)
→ Match! Transfer tokens + USDC
→ Alice exits early, Bob holds until settlement
```

## Key Features

- ✅ Instant execution (parimutuel always accepts buys)
- ✅ Dynamic pricing (updates with each trade)
- ✅ Early exit option (orderbook)
- ✅ No liquidity providers needed
- ✅ Per-market isolation
- ✅ Simple contracts (~200 lines each)

## Bootstrap

Each market needs $20 bootstrap ($10 + $10):
- 12 markets = $240 total capital
- Sent to burn address (protocol never holds)
- Sets initial price at $0.50/$0.50

## Fees

- Parimutuel: 2% on settlement (from total pool)
- Orderbook: 0.1% on trades (from trade value)
