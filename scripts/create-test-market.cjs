const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const https = require("https");

/**
 * Test Market Creation - Creates a single ETH 24h market with 20 minute expiry
 * 
 * Usage:
 *   npx hardhat run scripts/create-test-market.cjs --network somniaTestnet
 */

// Test configuration
const TEST_CONFIG = {
  name: "ETH", // Asset name (max 8 characters)
  coingeckoId: "ethereum",
  rangePercent: 3, // 3% range
  timeframe: "24h",
  expiryMinutes: 20, // 20 minutes for testing
};

// Price API mappings
const PRICE_SYMBOLS = {
  "ethereum": { symbol: "ETH", binance: "ETHUSDT", coincap: "ethereum", cryptocompare: "ETH" },
  "bitcoin": { symbol: "BTC", binance: "BTCUSDT", coincap: "bitcoin", cryptocompare: "BTC" },
  "solana": { symbol: "SOL", binance: "SOLUSDT", coincap: "solana", cryptocompare: "SOL" },
  "binancecoin": { symbol: "BNB", binance: "BNBUSDT", coincap: "binance-coin", cryptocompare: "BNB" },
  "cardano": { symbol: "ADA", binance: "ADAUSDT", coincap: "cardano", cryptocompare: "ADA" },
  "avalanche-2": { symbol: "AVAX", binance: "AVAXUSDT", coincap: "avalanche", cryptocompare: "AVAX" },
  "chainlink": { symbol: "LINK", binance: "LINKUSDT", coincap: "chainlink", cryptocompare: "LINK" },
  "zcash": { symbol: "ZEC", binance: "ZECUSDT", coincap: "zcash", cryptocompare: "ZEC" },
  "matic-network": { symbol: "MATIC", binance: "MATICUSDT", coincap: "polygon", cryptocompare: "MATIC" },
  "uniswap": { symbol: "UNI", binance: "UNIUSDT", coincap: "uniswap", cryptocompare: "UNI" },
  "litecoin": { symbol: "LTC", binance: "LTCUSDT", coincap: "litecoin", cryptocompare: "LTC" },
  "dogecoin": { symbol: "DOGE", binance: "DOGEUSDT", coincap: "dogecoin", cryptocompare: "DOGE" },
};

// Get price from Binance
async function getPriceFromBinance(symbol) {
  return new Promise((resolve, reject) => {
    const url = `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.price) {
            resolve(parseFloat(json.price));
          } else {
            reject(new Error(`Price not found in Binance response`));
          }
        } catch (error) {
          reject(new Error(`Failed to parse Binance response: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`Binance API error: ${error.message}`));
    });
  });
}

// Get price from CoinCap
async function getPriceFromCoinCap(id) {
  return new Promise((resolve, reject) => {
    const url = `https://api.coincap.io/v2/assets/${id}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.data && json.data.priceUsd) {
            resolve(parseFloat(json.data.priceUsd));
          } else {
            reject(new Error(`Price not found in CoinCap response`));
          }
        } catch (error) {
          reject(new Error(`Failed to parse CoinCap response: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`CoinCap API error: ${error.message}`));
    });
  });
}

// Get price from CryptoCompare
async function getPriceFromCryptoCompare(symbol) {
  return new Promise((resolve, reject) => {
    const url = `https://min-api.cryptocompare.com/data/price?fsym=${symbol}&tsyms=USD`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.USD) {
            resolve(parseFloat(json.USD));
          } else {
            reject(new Error(`Price not found in CryptoCompare response`));
          }
        } catch (error) {
          reject(new Error(`Failed to parse CryptoCompare response: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`CryptoCompare API error: ${error.message}`));
    });
  });
}

// Get price from CoinGecko
async function getPriceFromCoinGecko(coingeckoId) {
  return new Promise((resolve, reject) => {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json[coingeckoId] && json[coingeckoId].usd) {
            resolve(json[coingeckoId].usd);
          } else {
            reject(new Error(`Price not found for ${coingeckoId} in CoinGecko response`));
          }
        } catch (error) {
          reject(new Error(`Failed to parse CoinGecko response: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`CoinGecko API error: ${error.message}`));
    });
  });
}

// Get current price with multiple fallbacks
async function getCurrentPrice(coingeckoId) {
  const priceInfo = PRICE_SYMBOLS[coingeckoId];
  if (!priceInfo) {
    throw new Error(`Unknown token: ${coingeckoId}. Add it to PRICE_SYMBOLS mapping.`);
  }

  const sources = [
    { name: "Binance", fn: () => getPriceFromBinance(priceInfo.binance) },
    { name: "CoinCap", fn: () => getPriceFromCoinCap(priceInfo.coincap) },
    { name: "CryptoCompare", fn: () => getPriceFromCryptoCompare(priceInfo.cryptocompare) },
    { name: "CoinGecko", fn: () => getPriceFromCoinGecko(coingeckoId) },
  ];

  let lastError;
  for (const source of sources) {
    try {
      const price = await source.fn();
      console.log(`   ✅ Got price from ${source.name}: $${price.toFixed(2)}`);
      return price;
    } catch (error) {
      console.log(`   ⚠️  ${source.name} failed: ${error.message}`);
      lastError = error;
      continue;
    }
  }

  throw new Error(`All price sources failed. Last error: ${lastError.message}`);
}

// Calculate price bounds
function calculateBounds(currentPrice, rangePercent) {
  const range = (currentPrice * rangePercent) / 100;
  const lowerBound = Math.floor((currentPrice - range) * 1e6); // 6 decimals
  const upperBound = Math.ceil((currentPrice + range) * 1e6);
  return { lowerBound, upperBound };
}

async function main() {
  console.log("🧪 Creating Test Market (ETH 24h, 20 min expiry)...\n");
  console.log("=".repeat(60));

  const network = hre.network.name;
  const deploymentsPath = path.join(__dirname, "..", "deployments.json");
  
  if (!fs.existsSync(deploymentsPath)) {
    throw new Error("deployments.json not found. Deploy contracts first using deploy-parimutuel.cjs");
  }

  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  
  if (!deployments[network]) {
    throw new Error(`No deployments found for network: ${network}`);
  }

  const factoryAddress = deployments[network].factory;
  if (!factoryAddress) {
    throw new Error("Factory address not found in deployments.json. Deploy contracts first.");
  }

  console.log(`📋 Factory Address: ${factoryAddress}`);
  console.log(`🌐 Network: ${network}\n`);

  // Get factory contract
  const factoryABI = [
    "function createMarket(string memory name, uint256 lowerBound, uint256 upperBound, uint256 expiryTimestamp, uint256 timeframeDuration, uint256 startPrice, string memory boundTokenName, string memory boundTokenSymbol, string memory breakTokenName, string memory breakTokenSymbol) external returns (address market, address boundToken, address breakToken)",
    "function owner() external view returns (address)",
    "event MarketCreated(address indexed market, address indexed boundToken, address indexed breakToken, string name, uint256 lowerBound, uint256 upperBound, uint256 expiryTimestamp)"
  ];
  const factory = await ethers.getContractAt(factoryABI, factoryAddress);
  
  const [signer] = await ethers.getSigners();
  console.log(`👤 Creating as: ${signer.address}`);
  
  // Check if signer is the owner
  const owner = await factory.owner();
  console.log(`👑 Factory owner: ${owner}`);
  
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`❌ You are not the factory owner! Owner is ${owner}, but you are ${signer.address}. Please use the owner's private key in .env PRIVATE_KEY.`);
  }
  
  console.log("✅ Owner verified");

  console.log(`📝 Asset Name: ${TEST_CONFIG.name}\n`);

  // Get current price
  console.log("📊 Fetching current ETH price...");
  let currentPrice;
  try {
    currentPrice = await getCurrentPrice(TEST_CONFIG.coingeckoId);
    console.log(`   Current Price: $${currentPrice.toFixed(2)}\n`);
  } catch (error) {
    throw new Error(`❌ Failed to fetch price: ${error.message}`);
  }

  // Calculate bounds
  const { lowerBound, upperBound } = calculateBounds(currentPrice, TEST_CONFIG.rangePercent);
  
  // Calculate expiry (20 minutes from now)
  const expiryTimestamp = Math.floor(Date.now() / 1000) + (TEST_CONFIG.expiryMinutes * 60);
  
  // Calculate timeframe duration (for 24h markets, use 86400 seconds)
  // For test markets, use the actual expiry duration
  const timeframeDuration = TEST_CONFIG.timeframe === "24h" ? 86400 : (TEST_CONFIG.expiryMinutes * 60);
  
  // Start price is the current price (6 decimals)
  const startPrice = Math.floor(currentPrice * 1e6);
  
  // Token names
  const boundTokenName = `${TEST_CONFIG.name}-${TEST_CONFIG.timeframe}-BOUND`;
  const boundTokenSymbol = `${TEST_CONFIG.name}24B`;
  const breakTokenName = `${TEST_CONFIG.name}-${TEST_CONFIG.timeframe}-BREAK`;
  const breakTokenSymbol = `${TEST_CONFIG.name}24R`;
  
  console.log("📊 Market Details:");
  console.log(`   Asset: ${TEST_CONFIG.name}`);
  console.log(`   Timeframe: ${TEST_CONFIG.timeframe}`);
  console.log(`   Range: $${(lowerBound / 1e6).toFixed(2)} - $${(upperBound / 1e6).toFixed(2)}`);
  console.log(`   Expiry: ${new Date(expiryTimestamp * 1000).toLocaleString()} (${TEST_CONFIG.expiryMinutes} minutes from now)\n`);

  console.log("🚀 Creating market...");
  
  // Check USDC balance and approve factory
  const usdcABI = [
    "function balanceOf(address) external view returns (uint256)", 
    "function allowance(address, address) external view returns (uint256)",
    "function approve(address, uint256) external returns (bool)"
  ];
  const usdcAddress = deployments[network].usdc;
  if (!usdcAddress) {
    throw new Error("USDC address not found in deployments.json");
  }
  const usdc = await ethers.getContractAt(usdcABI, usdcAddress);
  const bootstrapAmount = BigInt(20_000_000); // $20 (10 + 10) - BigInt for comparison
  const balance = await usdc.balanceOf(signer.address);
  console.log(`   USDC Balance: ${ethers.formatUnits(balance, 6)} USDC`);
  console.log(`   Required: ${ethers.formatUnits(bootstrapAmount, 6)} USDC`);
  
  if (balance < bootstrapAmount) {
    throw new Error(`Insufficient USDC balance! Need ${ethers.formatUnits(bootstrapAmount, 6)} USDC but have ${ethers.formatUnits(balance, 6)} USDC. Market initialization requires bootstrap funds.`);
  }
  
  // Check and approve factory to pull USDC from owner
  // The factory will pull USDC from owner and send it to the market
  console.log("   Checking factory allowance...");
  const currentAllowance = await usdc.allowance(signer.address, factoryAddress);
  console.log(`   Current allowance: ${ethers.formatUnits(currentAllowance, 6)} USDC`);
  
  if (currentAllowance < bootstrapAmount) {
    console.log(`   ⚠️  Approving factory to spend ${ethers.formatUnits(bootstrapAmount, 6)} USDC...`);
    // Approve a bit more than needed to avoid needing to approve again
    const approveAmount = bootstrapAmount * BigInt(10); // Approve 10x for future markets
    const approveTx = await usdc.approve(factoryAddress, approveAmount);
    console.log(`   Approval transaction: ${approveTx.hash}`);
    await approveTx.wait();
    console.log(`   ✅ Approved factory to spend up to ${ethers.formatUnits(approveAmount, 6)} USDC`);
  } else {
    console.log(`   ✅ Factory already has sufficient allowance`);
  }
  
  try {
    // Try to estimate gas first to catch revert reasons
    try {
      await factory.createMarket.estimateGas(
        TEST_CONFIG.name,
        lowerBound,
        upperBound,
        expiryTimestamp,
        timeframeDuration,
        startPrice,
        boundTokenName,
        boundTokenSymbol,
        breakTokenName,
        breakTokenSymbol
      );
    } catch (estimateError) {
      console.error("❌ Gas estimation failed (this shows the revert reason):");
      if (estimateError.reason) {
        throw new Error(`Transaction will revert: ${estimateError.reason}`);
      } else if (estimateError.data) {
        throw new Error(`Transaction will revert. Error data: ${estimateError.data}`);
      } else {
        throw new Error(`Transaction will revert: ${estimateError.message}`);
      }
    }
    
    const tx = await factory.createMarket(
      TEST_CONFIG.name,
      lowerBound,
      upperBound,
      expiryTimestamp,
      timeframeDuration,
      startPrice,
      boundTokenName,
      boundTokenSymbol,
      breakTokenName,
      breakTokenSymbol
    );
    
    console.log(`   Transaction: ${tx.hash}`);
    console.log("   Waiting for confirmation...");
    
    const receipt = await tx.wait();
    
    // Find MarketCreated event
    const factoryInterface = new ethers.Interface([
      "event MarketCreated(address indexed market, address indexed boundToken, address indexed breakToken, string name, uint256 lowerBound, uint256 upperBound, uint256 expiryTimestamp)"
    ]);
    
    const event = receipt.logs.find(log => {
      try {
        const parsed = factoryInterface.parseLog(log);
        return parsed && parsed.name === "MarketCreated";
      } catch {
        return false;
      }
    });
    
    if (event) {
      const parsed = factoryInterface.parseLog(event);
      const marketAddress = parsed.args.market;
      const boundToken = parsed.args.boundToken;
      const breakToken = parsed.args.breakToken;
      
      console.log("\n✅ Market Created Successfully!");
      console.log("=".repeat(60));
      console.log(`   Market Address: ${marketAddress}`);
      console.log(`   BOUND Token: ${boundToken}`);
      console.log(`   BREAK Token: ${breakToken}`);
      console.log(`   Lower Bound: $${(lowerBound / 1e6).toFixed(2)}`);
      console.log(`   Upper Bound: $${(upperBound / 1e6).toFixed(2)}`);
      console.log(`   Expiry: ${new Date(expiryTimestamp * 1000).toLocaleString()}`);
      console.log("\n💡 Next steps:");
      console.log("   1. Wait 20 minutes for market to expire");
      console.log("   2. Run settlement bot: npm run settle:somnia");
      console.log("   3. Or manually settle using the market address above");
    } else {
      console.log("\n⚠️  Market created but event not found. Check transaction receipt.");
    }
  } catch (error) {
    console.error("\n❌ Error creating market:");
    console.error(error.message);
    if (error.reason) {
      console.error(`   Reason: ${error.reason}`);
    }
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
