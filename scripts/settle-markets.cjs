const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const viem = require("viem");
const { SDK } = require("@somnia-chain/reactivity");

/**
 * Settlement Bot - Automatically settles expired markets
 * 
 * How it works:
 * 1. Subscribes to MarketCreated events (free off-chain) to track new markets
 * 2. Polls every 4 seconds: checks stored expiry timestamps against system time
 * 3. When market expires, fetches price from oracle and calls settle()
 * 
 * Usage:
 *   npx hardhat run scripts/settle-markets.cjs --network somniaTestnet
 */

// Oracle configuration
const ORACLE_TYPE = process.env.ORACLE_TYPE || "coingecko";
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || "";

// Import token mapping
const { getAssetFromAddress, getCoinGeckoId } = require("./token-mapping.js");

async function getPriceFromCoinGecko(tokenSymbol) {
  return new Promise((resolve, reject) => {
    try {
      const url = COINGECKO_API_KEY
        ? `https://api.coingecko.com/api/v3/simple/price?ids=${tokenSymbol}&vs_currencies=usd&x_cg_demo_api_key=${COINGECKO_API_KEY}`
        : `https://api.coingecko.com/api/v3/simple/price?ids=${tokenSymbol}&vs_currencies=usd`;
      
      https.get(url, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json[tokenSymbol] && json[tokenSymbol].usd) {
              resolve(BigInt(Math.floor(json[tokenSymbol].usd * 1e6)));
            } else {
              reject(new Error(`Price not found for ${tokenSymbol}`));
            }
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      }).on('error', (error) => {
        reject(new Error(`CoinGecko API error: ${error.message}`));
      });
    } catch (error) {
      reject(new Error(`CoinGecko API error: ${error.message}`));
    }
  });
}

async function getPriceFromBinance(symbol) {
  return new Promise((resolve, reject) => {
    https.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.price) {
            resolve(BigInt(Math.floor(parseFloat(json.price) * 1e6)));
          } else {
            reject(new Error(`Price not found for ${symbol}`));
          }
        } catch (error) {
          reject(new Error(`Binance API error: ${error.message}`));
        }
      });
    }).on('error', reject);
  });
}

async function getPriceFromCoinCap(symbol) {
  return new Promise((resolve, reject) => {
    https.get(`https://api.coincap.io/v2/assets/${symbol}`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.data && json.data.priceUsd) {
            resolve(BigInt(Math.floor(parseFloat(json.data.priceUsd) * 1e6)));
          } else {
            reject(new Error(`Price not found for ${symbol}`));
          }
        } catch (error) {
          reject(new Error(`CoinCap API error: ${error.message}`));
        }
      });
    }).on('error', reject);
  });
}

async function getPriceFromCryptoCompare(symbol) {
  return new Promise((resolve, reject) => {
    https.get(`https://min-api.cryptocompare.com/data/price?fsym=${symbol}&tsyms=USD`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.USD) {
            resolve(BigInt(Math.floor(json.USD * 1e6)));
          } else {
            reject(new Error(`Price not found for ${symbol}`));
          }
        } catch (error) {
          reject(new Error(`CryptoCompare API error: ${error.message}`));
        }
      });
    }).on('error', reject);
  });
}

// Price API mappings
const PRICE_SYMBOLS = {
  ETH: { binance: "ETH", coincap: "ethereum", cryptocompare: "ETH" },
  BTC: { binance: "BTC", coincap: "bitcoin", cryptocompare: "BTC" },
  SOL: { binance: "SOL", coincap: "solana", cryptocompare: "SOL" },
  LINK: { binance: "LINK", coincap: "chainlink", cryptocompare: "LINK" },
  AAVE: { binance: "AAVE", coincap: "aave", cryptocompare: "AAVE" },
  BNB: { binance: "BNB", coincap: "binance-coin", cryptocompare: "BNB" },
};

async function getTokenPrice(assetName) {
  // Get CoinGecko ID from mapping
  const coingeckoId = getCoinGeckoId(assetName);
  if (!coingeckoId) {
    throw new Error(`Price not found for ${assetName}`);
  }

  const priceInfo = PRICE_SYMBOLS[assetName.toUpperCase()] || {};
  
  // Try multiple APIs with fallbacks
  const apis = [
    { name: "CoinGecko", fn: () => getPriceFromCoinGecko(coingeckoId) },
    { name: "Binance", fn: () => getPriceFromBinance(priceInfo.binance) },
    { name: "CoinCap", fn: () => getPriceFromCoinCap(priceInfo.coincap) },
    { name: "CryptoCompare", fn: () => getPriceFromCryptoCompare(priceInfo.cryptocompare) },
  ];
  
  // Try each API in order until one succeeds
  let lastError = null;
  for (const api of apis) {
    try {
      const price = await api.fn();
      console.log(`   ✅ Got price from ${api.name}: $${(Number(price) / 1e6).toFixed(2)}`);
      return price;
    } catch (error) {
      console.warn(`   ⚠️ ${api.name} failed: ${error.message}`);
      lastError = error;
    }
  }
  
  throw new Error(`All price APIs failed. Last error: ${lastError.message}`);
}

async function main() {
  console.log("🤖 Starting Settlement Bot (Simple Polling)...\n");
  console.log("=".repeat(60));

  const network = hre.network.name;
  const deploymentsPath = path.join(__dirname, "..", "deployments.json");
  
  if (!fs.existsSync(deploymentsPath)) {
    throw new Error("deployments.json not found. Deploy contracts first.");
  }

  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  
  if (!deployments[network]) {
    throw new Error(`No deployments found for network: ${network}`);
  }

  const factoryAddress = deployments[network].factory;
  if (!factoryAddress) {
    throw new Error("Factory address not found in deployments.json");
  }

  console.log(`📋 Factory Address: ${factoryAddress}`);
  console.log(`🌐 Network: ${network}`);
  console.log(`🔮 Oracle Type: ${ORACLE_TYPE}`);
  console.log(`⏱️  Polling Interval: 4 seconds\n`);

  // Get factory contract
  const factoryABI = [
    {
      type: "function",
      name: "getAllMarkets",
      inputs: [],
      outputs: [{ type: "address[]" }],
      stateMutability: "view"
    },
    {
      type: "event",
      name: "MarketCreated",
      inputs: [
        { name: "market", type: "address", indexed: true },
        { name: "boundToken", type: "address", indexed: true },
        { name: "breakToken", type: "address", indexed: true },
        { name: "name", type: "string", indexed: false },
        { name: "lowerBound", type: "uint256", indexed: false },
        { name: "upperBound", type: "uint256", indexed: false },
        { name: "expiryTimestamp", type: "uint256", indexed: false }
      ]
    }
  ];
  
  const factory = await ethers.getContractAt(factoryABI, factoryAddress);
  
  // Get market contract ABI
  const marketABI = [
    "function marketConfig() external view returns (string name, uint256 lowerBound, uint256 upperBound, uint256 expiryTimestamp, uint256 creationTimestamp, uint256 startPrice, bool initialized, bool settled)",
    "function settle(uint256 finalPrice) external",
    "function owner() external view returns (address)",
    "event MarketSettled(bool boundWins, uint256 totalPool, uint256 winnings)"
  ];

  const [signer] = await ethers.getSigners();
  const provider = signer.provider || await ethers.getDefaultProvider();
  
  console.log(`👤 Settling as: ${signer.address}\n`);

  // Get RPC URL from Hardhat config (for HTTP calls)
  const rpcUrl = hre.network.config.url;
  if (!rpcUrl) {
    throw new Error("RPC URL not found in Hardhat network config");
  }

  // Use Dream RPC WebSocket endpoint explicitly for Somnia Reactivity SDK
  // Dream RPC is the official Somnia endpoint and supports WebSocket subscriptions
  const DREAM_RPC_WS = "wss://dream-rpc.somnia.network/ws";
  const wsUrl = DREAM_RPC_WS;

  function toWebSocketUrl(httpUrl) {
    // Helper function for other WebSocket conversions if needed
    // Somnia reactivity subscribe requires a WS transport.
    // Somnia public WS endpoint uses `/ws`.
    // Examples:
    // - https://dream-rpc.somnia.network     -> wss://dream-rpc.somnia.network/ws
    // - http://localhost:8545               -> ws://localhost:8545
    // - wss://dream-rpc.somnia.network/ws   -> unchanged
    if (!httpUrl) throw new Error("Missing RPC URL");
    if (httpUrl.startsWith("ws://") || httpUrl.startsWith("wss://")) return httpUrl;
    const ws = httpUrl.startsWith("https://")
      ? "wss://" + httpUrl.slice("https://".length)
      : httpUrl.startsWith("http://")
        ? "ws://" + httpUrl.slice("http://".length)
        : httpUrl;
    return ws.endsWith("/ws") ? ws : `${ws.replace(/\/$/, "")}/ws`;
  }

  // Setup Somnia Reactivity SDK for MarketCreated events (free off-chain subscription)
  // IMPORTANT: the Somnia Reactivity SDK internally creates a WS client using `webSocket()` *without* a URL,
  // which means the chain config MUST include `rpcUrls.default.webSocket`.
  const somniaTestnet = viem.defineChain({
    id: 50312,
    name: "Somnia Testnet",
    nativeCurrency: {
      decimals: 18,
      name: "Somnia Test Token",
      symbol: "STT",
    },
    rpcUrls: {
      default: {
        http: [rpcUrl],
        webSocket: [wsUrl],
      },
    },
  });

  // Initialize SDK with explicit WebSocket URL
  const publicClient = viem.createPublicClient({
    chain: somniaTestnet,
    transport: viem.webSocket(wsUrl),  // Explicit URL
  });

  const sdk = new SDK({
    public: publicClient,
  });

  // JSON file for persistent storage
  const storagePath = path.join(__dirname, "..", "markets-storage.json");
  const subscriptionPath = path.join(__dirname, "..", "subscription.json");
  
  // Load existing subscription ID
  function loadSubscriptionId() {
    if (!fs.existsSync(subscriptionPath)) {
      return null;
    }
    try {
      const data = JSON.parse(fs.readFileSync(subscriptionPath, "utf8"));
      return data.subscriptionId || null;
    } catch (error) {
      console.warn(`⚠️  Error loading subscription ID: ${error.message}`);
      return null;
    }
  }

  // Save subscription ID
  function saveSubscriptionId(subscriptionId) {
    try {
      fs.writeFileSync(subscriptionPath, JSON.stringify({ subscriptionId }, null, 2), "utf8");
    } catch (error) {
      console.warn(`⚠️  Error saving subscription ID: ${error.message}`);
    }
  }

  // Clear subscription ID
  function clearSubscriptionId() {
    try {
      if (fs.existsSync(subscriptionPath)) {
        fs.unlinkSync(subscriptionPath);
      }
    } catch (error) {
      console.warn(`⚠️  Error clearing subscription ID: ${error.message}`);
    }
  }
  
  // Atomic write function
  function atomicWrite(data) {
    try {
      const tempPath = storagePath + ".tmp";
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf8");
      try {
        fs.renameSync(tempPath, storagePath);
      } catch (renameError) {
        // Windows file locking issue - try direct write
        if (renameError.code === 'EPERM' || renameError.code === 'EBUSY') {
          fs.writeFileSync(storagePath, JSON.stringify(data, null, 2), "utf8");
          try { fs.unlinkSync(tempPath); } catch {}
        } else {
          throw renameError;
        }
      }
    } catch (error) {
      console.warn(`⚠️  Atomic write failed, using direct write: ${error.message}`);
      fs.writeFileSync(storagePath, JSON.stringify(data, null, 2), "utf8");
    }
  }

  // Load markets from JSON and normalize addresses to lowercase
  function loadMarkets() {
    if (!fs.existsSync(storagePath)) {
      return {};
    }
    try {
      const data = fs.readFileSync(storagePath, "utf8");
      const raw = JSON.parse(data);
      // Normalize all addresses to lowercase to prevent duplicates
      const normalized = {};
      for (const [addr, info] of Object.entries(raw)) {
        normalized[addr.toLowerCase()] = info;
      }
      return normalized;
    } catch (error) {
      console.warn(`⚠️  Error loading markets from ${storagePath}: ${error.message}`);
      return {};
    }
  }

  // Save markets to JSON (ensures all addresses are lowercase to prevent duplicates)
  function saveMarkets(markets) {
    // Normalize all addresses to lowercase before saving
    const normalized = {};
    for (const [addr, info] of Object.entries(markets)) {
      normalized[addr.toLowerCase()] = info;
    }
    atomicWrite(normalized);
  }

  // Track markets that need settlement (load from JSON)
  let marketsToSettle = loadMarkets();
  console.log(`📁 Loaded ${Object.keys(marketsToSettle).length} market(s) from storage (markets-storage.json)`);
  if (Object.keys(marketsToSettle).length > 0) {
    console.log(`   Storage markets: ${Object.keys(marketsToSettle).join(", ")}`);
  }
  
  // Get all markets from factory to verify which ones are valid
  console.log(`\n📊 Fetching all markets from factory contract...`);
  const allFactoryMarkets = await factory.getAllMarkets();
  console.log(`   Found ${allFactoryMarkets.length} market(s) in factory`);
  if (allFactoryMarkets.length > 0) {
    console.log(`   Factory markets: ${allFactoryMarkets.map(m => m.toLowerCase()).join(", ")}`);
  }
  
  const validMarketAddresses = new Set(allFactoryMarkets.map(addr => addr.toLowerCase()));
  
  // Remove old markets from storage that aren't in the factory
  let removedCount = 0;
  for (const marketAddress of Object.keys(marketsToSettle)) {
    if (!validMarketAddresses.has(marketAddress.toLowerCase())) {
      console.log(`   ⚠️  Removing old market from storage (not in factory): ${marketAddress}`);
      delete marketsToSettle[marketAddress];
      removedCount++;
    }
  }
  if (removedCount > 0) {
    saveMarkets(marketsToSettle);
    console.log(`   ✅ Removed ${removedCount} old market(s) from storage\n`);
  } else {
    console.log(`   ✅ All markets in storage are valid\n`);
  }

  // Function to check and settle a market
  async function checkAndSettleMarket(marketAddress) {
    try {
      const marketAddrLower = marketAddress.toLowerCase();
      let market, config, initialized, settled, expiryTimestamp, assetName;
      
      try {
        market = await ethers.getContractAt(marketABI, marketAddress);
        config = await market.marketConfig();
        
        // Parse config tuple
        initialized = config[6];
        settled = config[7];
        expiryTimestamp = config[3];
        assetName = config[0];
      } catch (decodeError) {
        if (decodeError.message && decodeError.message.includes("could not decode")) {
          console.log(`   ⚠️  Market ${marketAddress} uses old ABI, removing from storage...`);
          delete marketsToSettle[marketAddrLower];
          saveMarkets(marketsToSettle);
          return;
        }
        throw decodeError;
      }
      
      if (!initialized) {
        console.log(`   ⚠️  Market ${marketAddress} not initialized, skipping...`);
        return;
      }
      if (settled) {
        console.log(`   ✅ Market ${marketAddress} already settled, removing from storage...`);
        delete marketsToSettle[marketAddrLower];
        saveMarkets(marketsToSettle);
        console.log(`   🗑️  Removed from storage (markets-storage.json)`);
        return;
      }

      // Get current system time (no blockchain call needed!)
      const currentTime = Math.floor(Date.now() / 1000);

      // Check if expired
      if (currentTime >= Number(expiryTimestamp)) {
        console.log(`\n🎯 ========== MARKET EXPIRED ==========`);
        console.log(`   Market Address: ${marketAddress}`);
        console.log(`   Asset Name: ${assetName}`);
        console.log(`   Expiry Time: ${new Date(Number(expiryTimestamp) * 1000).toLocaleString()}`);
        console.log(`   Current Time: ${new Date(currentTime * 1000).toLocaleString()}`);
        console.log(`   Overdue by: ${Math.floor((currentTime - Number(expiryTimestamp)) / 60)} minutes`);

        // Check if asset is supported by DIA oracle
        const normalizedName = assetName ? assetName.trim().toUpperCase() : null;
        if (!normalizedName) {
          throw new Error(`Invalid asset name: ${assetName}`);
        }

        const marketContract = await ethers.getContractAt(marketABI, marketAddress);
        
        // DIA-supported assets: BTC, ETH, SOL, ARB, SOMI
        const diaSupportedAssets = ["BTC", "ETH", "SOL", "ARB", "SOMI"];
        const isDiaSupported = diaSupportedAssets.includes(normalizedName);

        let tx;
        if (isDiaSupported) {
          // Use onchain DIA oracle - contract fetches price itself
          console.log(`   📡 Using DIA onchain oracle for ${normalizedName}...`);
          tx = await marketContract.settle();
          console.log(`   Transaction: ${tx.hash}`);
        } else {
          // Fallback to offchain oracle
          console.log(`   🌐 ${normalizedName} not supported by DIA, using offchain oracle...`);
          const finalPrice = await getTokenPrice(normalizedName);
          console.log(`   Final Price: $${(Number(finalPrice) / 1e6).toFixed(2)}`);
          tx = await marketContract.settleWithPrice(finalPrice);
        console.log(`   Transaction: ${tx.hash}`);
        }
        
        await tx.wait();
        console.log(`   ✅ Settled!\n`);
        
        // Remove from tracking and storage
        delete marketsToSettle[marketAddrLower];
        saveMarkets(marketsToSettle);
        console.log(`   🗑️  Removed from storage (markets-storage.json)`);
      } else {
        // Not expired yet, update tracking
        const timeLeft = Number(expiryTimestamp) - currentTime;
        marketsToSettle[marketAddrLower] = {
          expiry: Number(expiryTimestamp),
          assetName: assetName,
          timeLeft
        };
        saveMarkets(marketsToSettle);
      }
    } catch (error) {
      console.error(`   ❌ Error checking market ${marketAddress}: ${error.message}`);
      if (error.message && error.message.includes("Price not found")) {
        console.log(`   ⚠️  Removing market from storage (invalid asset name)`);
        const marketAddrLower = marketAddress.toLowerCase();
        delete marketsToSettle[marketAddrLower];
        saveMarkets(marketsToSettle);
      }
    }
  }

  // Markets will be discovered via subscription events only (no polling)
  console.log("📊 Markets will be discovered via MarketCreated events only\n");

  // Subscribe to MarketCreated events (free off-chain subscription)
  console.log("📡 Setting up MarketCreated event subscription...\n");
  
  const marketCreatedEventSig = "MarketCreated(address,address,address,string,uint256,uint256,uint256)";
  const marketCreatedTopic = viem.keccak256(viem.toHex(marketCreatedEventSig));
  
  console.log(`   MarketCreated topic: ${marketCreatedTopic}`);
  console.log(`   Factory address: ${factoryAddress}\n`);
  
  console.log(`   RPC (HTTP): ${rpcUrl}`);
  console.log(`   RPC (WS):   ${wsUrl} (Dream RPC)\n`);

  // Check for existing subscription and unsubscribe first
  const existingSubscriptionId = loadSubscriptionId();
  if (existingSubscriptionId) {
    console.log(`🔄 Found existing subscription ID: ${existingSubscriptionId}`);
    console.log(`   Attempting to unsubscribe from old subscription...`);
    try {
      // Try to unsubscribe using the precompile contract directly
      // The SDK doesn't expose a way to unsubscribe by ID, so we'll use the contract
      const SOMNIA_REACTIVITY_PRECOMPILE = "0x0000000000000000000000000000000000000400"; // Somnia reactivity precompile address
      const precompileABI = [
        "function unsubscribe(uint256 subscriptionId) external"
      ];
      const precompile = await ethers.getContractAt(precompileABI, SOMNIA_REACTIVITY_PRECOMPILE);
      const tx = await precompile.unsubscribe(existingSubscriptionId);
      await tx.wait();
      console.log(`   ✅ Unsubscribed from old subscription\n`);
      clearSubscriptionId();
    } catch (error) {
      console.warn(`   ⚠️  Could not unsubscribe (subscription may have expired): ${error.message}\n`);
      // Clear it anyway so we can try to create a new one
      clearSubscriptionId();
    }
  }

  // Subscribe to MarketCreated events (required - no polling fallback)
  // Retry logic: subscriptions might need a moment to clear or there might be rate limits
  let marketCreatedSubscription = null;
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 5000; // 5 seconds
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`   ⏳ Retry attempt ${attempt}/${MAX_RETRIES} (waiting ${RETRY_DELAY/1000}s)...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
      
      marketCreatedSubscription = await sdk.subscribe({
        ethCalls: [],
        eventContractSources: [factoryAddress],
        topicOverrides: [marketCreatedTopic],
        onData: async (data) => {
        try {
          console.log("\n📨 ========== MarketCreated EVENT RECEIVED ==========");
          console.log(`   Raw event data:`, JSON.stringify(data, null, 2));
          
          const decoded = viem.decodeEventLog({
            abi: factoryABI,
            topics: data.result.topics,
            data: data.result.data,
          });
          
          const marketAddress = decoded.args.market;
          const boundToken = decoded.args.boundToken;
          const breakToken = decoded.args.breakToken;
          const assetName = decoded.args.name;
          const lowerBound = decoded.args.lowerBound;
          const upperBound = decoded.args.upperBound;
          const expiryTimestamp = decoded.args.expiryTimestamp;
          
          console.log(`🆕 NEW MARKET CREATED:`);
          console.log(`   Market Address: ${marketAddress}`);
          console.log(`   Asset Name: ${assetName}`);
          console.log(`   BOUND Token: ${boundToken}`);
          console.log(`   BREAK Token: ${breakToken}`);
          console.log(`   Lower Bound: $${(Number(lowerBound) / 1e6).toFixed(2)}`);
          console.log(`   Upper Bound: $${(Number(upperBound) / 1e6).toFixed(2)}`);
          console.log(`   Expiry: ${new Date(Number(expiryTimestamp) * 1000).toLocaleString()}`);
          console.log(`   Expires in: ${Math.floor((Number(expiryTimestamp) - Math.floor(Date.now() / 1000)) / 60)} minutes`);
          
          const marketAddrLower = marketAddress.toLowerCase();
          
          // Add to tracking
          marketsToSettle[marketAddrLower] = {
            expiry: Number(expiryTimestamp),
            assetName: assetName,
            timeLeft: Number(expiryTimestamp) - Math.floor(Date.now() / 1000)
          };
          saveMarkets(marketsToSettle);
          console.log(`   ✅ Added to storage and tracking`);
          console.log(`==========================================\n`);
          
          // Check if already expired
          await checkAndSettleMarket(marketAddress);
        } catch (error) {
          console.error(`⚠️  Error processing MarketCreated event: ${error.message}`);
          console.error(`   Stack: ${error.stack}`);
        }
      },
      onError: (error) => {
        console.error(`⚠️  Subscription error: ${error.message}`);
      },
    });

    if (marketCreatedSubscription instanceof Error) {
      throw marketCreatedSubscription;
    }

      console.log(`   ✅ Subscribed to MarketCreated events`);
      console.log(`   Subscription ID: ${marketCreatedSubscription.subscriptionId}\n`);
      
      // Save subscription ID for next time
      saveSubscriptionId(marketCreatedSubscription.subscriptionId);
      console.log(`   💾 Saved subscription ID to subscription.json\n`);
      
      break; // Success, exit retry loop
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        // Last attempt failed
        console.error(`❌ Failed to subscribe after ${MAX_RETRIES} attempts: ${error.message}`);
        if (error.message && error.message.includes("Too many subscriptions")) {
          console.error(`\n💡 ERROR: Too many subscriptions for this wallet address.`);
          console.error(`💡 Subscriptions are tied to your wallet address (${signer.address}).`);
          console.error(`💡 Possible solutions:`);
          console.error(`   1. Wait a few minutes for old subscriptions to expire/clear`);
          console.error(`   2. Use a different wallet address`);
          console.error(`   3. Contact Somnia support about subscription limits`);
          console.error(`   4. Check if subscriptions auto-expire after inactivity\n`);
        }
        throw error;
      } else {
        console.warn(`   ⚠️  Attempt ${attempt} failed: ${error.message}`);
        // Continue to next retry
      }
    }
  }
  
  if (!marketCreatedSubscription) {
    throw new Error("Failed to create subscription after all retries");
  }

  // Check expiry periodically (only for markets already in storage)
  console.log("⏱️  Starting expiry checker (every 4 seconds)...\n");
  
  const POLL_INTERVAL = 4000; // 4 seconds
  let pollInterval = setInterval(async () => {
    try {
      const currentTime = Math.floor(Date.now() / 1000);
      
      // Reload markets from storage in case they were updated
      marketsToSettle = loadMarkets();
      
      if (Object.keys(marketsToSettle).length === 0) {
        return; // No markets to check
      }
      
      // Check all tracked markets for expiry
      const expiredMarkets = [];
      for (const marketAddress of Object.keys(marketsToSettle)) {
        const info = marketsToSettle[marketAddress];
        if (currentTime >= info.expiry) {
          expiredMarkets.push(marketAddress);
        }
      }
      
      if (expiredMarkets.length > 0) {
        console.log(`\n⏰ ========== EXPIRY CHECK: Found ${expiredMarkets.length} expired market(s) ==========`);
        for (const marketAddress of expiredMarkets) {
          console.log(`   Checking: ${marketAddress}`);
          await checkAndSettleMarket(marketAddress);
        }
        console.log(`==========================================\n`);
      }
    } catch (error) {
      console.error(`⚠️  Error in expiry checker: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
    }
  }, POLL_INTERVAL);

  console.log("✅ Bot running!");
  console.log("   - MarketCreated events: Real-time (push-based subscription)");
  console.log("   - Expiry checks: Every 4 seconds (for markets in storage)");
  console.log("   - No polling for new markets - subscription only");
  console.log("   Press Ctrl+C to stop\n");

  // Keep process alive
  process.stdin.resume();

  // Handle errors gracefully
  process.on('uncaughtException', (error) => {
    console.error(`⚠️  Uncaught error: ${error.message}`);
  });
  
  process.on('unhandledRejection', (reason) => {
    console.error(`⚠️  Unhandled rejection: ${reason}`);
  });

  // Cleanup on exit
  process.on('SIGINT', async () => {
    console.log("\n\n🛑 Stopping bot...");
    try {
      if (marketCreatedSubscription && typeof marketCreatedSubscription.unsubscribe === 'function') {
        console.log("   Unsubscribing from MarketCreated events...");
        await marketCreatedSubscription.unsubscribe();
        console.log("   ✅ Unsubscribed");
        clearSubscriptionId();
      } else {
        // Try to unsubscribe using stored ID if subscription object doesn't have unsubscribe method
        const storedId = loadSubscriptionId();
        if (storedId) {
          try {
            const SOMNIA_REACTIVITY_PRECOMPILE = "0x0000000000000000000000000000000000000400";
            const precompileABI = ["function unsubscribe(uint256 subscriptionId) external"];
            const precompile = await ethers.getContractAt(precompileABI, SOMNIA_REACTIVITY_PRECOMPILE);
            const tx = await precompile.unsubscribe(storedId);
            await tx.wait();
            console.log(`   ✅ Unsubscribed using stored ID: ${storedId}`);
          } catch (error) {
            console.warn(`   ⚠️  Could not unsubscribe using stored ID: ${error.message}`);
          }
          clearSubscriptionId();
        }
      }
      if (pollInterval) {
        clearInterval(pollInterval);
        console.log("   ✅ Stopped expiry checker");
      }
    } catch (error) {
      console.error(`   ⚠️  Error cleaning up: ${error.message}`);
    }
    process.exit(0);
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
