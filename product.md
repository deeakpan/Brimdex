## Brimdex — Product Overview

Brimdex is a **parimutuel prediction market DEX** on **Somnia**. Each market is a time-bounded bet on whether an asset’s final USD price ends **inside** or **outside** a defined range at expiry.

- **BOUND**: pays out if the final price finishes *inside* the chosen range.
- **BREAK**: pays out if the final price finishes *outside* that range.

When a user participates in a market, they are buying one of these two outcome tokens. At expiry, exactly one “side” wins and its holders share the pooled liquidity (after protocol fees); the losing side goes to zero. Each market is fully isolated from the others, with its own pools and outcome tokens.

## How a user experiences the product

- **Discover markets**: A user opens the app and sees a list of live and upcoming markets (e.g., “ETH in \$3,000–\$3,100 over the next 24h”). New markets appear in this list automatically as they are created.
- **View odds and ranges**: For each market they see:
  - the asset and timeframe (e.g., ETH, 24h)
  - the price range
  - an implied probability for BOUND vs BREAK based on how much liquidity is on each side.
- **Take a position**:
  - The user chooses **BOUND** (range holds) or **BREAK** (range breaks),
  - enters an amount (e.g., \$100),
  - and receives outcome tokens representing their claim on the final pool if that side wins.
- **Trade out early**:
  - Before expiry, they can sell their outcome tokens to other users in a secondary market,
  - or buy more from others if they want to increase or change their exposure.
- **Wait for settlement**:
  - At or after the market’s end time, the protocol reads a final reference price from an external price source,
  - decides which side won (inside vs outside the band),
  - and fixes a redemption rate for the winning token.
- **Redeem winnings**:
  - Holders of the winning side can redeem their tokens for stable collateral,
  - seeing exactly how much they receive per token based on the final pool size and fee.

Throughout this flow, the app stays “live” thanks to data streams and Somnia’s reactivity layer, so users see new markets, trades, and settlement status without needing to refresh.

## Data streams — what we stream into the UI

Brimdex treats on-chain activity as a set of **streams of facts** that drive the interface. Conceptually, there are three main data streams:

1. **Market stream** — “new or updated markets”
2. **Trading stream** — “buys, sells, and order matches”
3. **Position stream** — “what this wallet currently holds and what it’s worth”

### 1. Market stream (creation and lifecycle)

Whenever someone creates a new market, that fact is **pushed** into our system as a data event. The app doesn’t have to poll for changes; it simply listens for “a new market exists” and updates the list.

What this enables on the user side:
- The **markets list** updates in real time as new markets are created elsewhere.
- Each market card can show an accurate **expiry countdown**, start time, and price range.
- The app can keep **expired vs active** state in sync with the chain (no stale “active” markets that already ended).

Under the hood, we still occasionally reconcile this stream with a full list of markets (a “snapshot” read) to handle disconnects or missed updates. To the user, this just means the list is both **live** and **trustworthy**.

### 2. Trading stream (primary and secondary)

Every time someone buys BOUND or BREAK, or places / matches / cancels an order in the secondary market, that trade becomes an event in the **trading stream**.

What this enables in the UI:
- **Live odds and prices**:
  - When users buy BOUND or BREAK, the relative pools shift,
  - which immediately updates the implied probability displayed in the UI.
- **Market activity feeds**:
  - The app can show “recent trades” for each market (who bought which side and for how much),
  - giving users a sense of momentum and sentiment.
- **Orderbook visuals**:
  - Bids and asks in the secondary market can be drawn directly from live trade and order updates,
  - so best bid/ask, depth, and recent matches feel like a centralized exchange.

Because these changes arrive as a stream rather than via manual refresh, users see **their own trades land**, other people’s trades, and price moves in real time.

### 3. Position stream (wallet-centric view)

Positions are simply “which outcome tokens does this wallet currently own, and what are they worth right now?”.

The position stream combines:
- a **snapshot** of all markets and token balances for the connected wallet, and
- **incremental updates** every time something relevant happens (a trade, a transfer, a redemption, or settlement).

What this enables:
- The **positions page** always shows an up-to-date portfolio without the user needing to refresh.
- When a user **buys** into a market, that position appears almost instantly as a new line item.
- When the market **settles**, the status flips from “Active” to “Settled”, and the UI can show whether BOUND or BREAK won.
- When the user **redeems**, their token balance goes down and their stable balance (off-chain or in-wallet) increases, and both changes are reflected in near real time.

In addition, we “top up” this stream on each new block with fresh reads, which acts as a safety net so the portfolio view cannot silently drift over time.

## Somnia reactivity — why blocks matter

Somnia provides a **reactivity layer** that effectively says: “every time the chain moves forward, I’ll tell you.” We use that as a **block stream** that fires once per block.

Two big things this unlocks:

- **Accurate time-based UX**
  - Market expiry is expressed in block time.
  - By getting a signal every block, the app can run live countdown timers that are tightly aligned with the chain, not the user’s local clock.
  - As soon as a market passes its end time, the UI can immediately reflect that the market is now in “awaiting settlement” or “settled” state (once the outcome is known).

- **Automated settlement and housekeeping**
  - A background process listens to the block stream and maintains a list of markets it cares about.
  - On each new block, it checks: “which of these markets have just crossed their end time?”
  - For any market that has expired, it fetches an external reference price, determines the winner (BOUND vs BREAK), and finalizes the market so users can redeem.

Because this flow is tied to the **chain’s own heartbeat** (each new block), there is no fragile off-chain timer or cron job that might drift. This keeps market status, expiry, and redemption availability tightly in sync with the actual blockchain state.

## How this all feels to the user

Putting the data streams and reactivity together, a user gets an experience that feels closer to a centralized trading app than a typical slow DeFi UI:

- New markets appear in the list as soon as they’re created.
- Odds and ranges update immediately when someone trades.
- Their positions panel feels “alive” and wallet-aware without manual refresh.
- Expiry countdowns tick smoothly and flip over to settlement at the right time.
- As soon as the market is settled, the app clearly shows which side won and enables redemption.

All of this is powered by **streams of on-chain data** and Somnia’s per-block reactivity, but the user just experiences it as a **fast, responsive prediction market** that always reflects the true on-chain state.

