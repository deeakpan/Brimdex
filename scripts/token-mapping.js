/**
 * Token Address to Symbol/Price Mapping
 * Maps token addresses (or placeholder addresses) to asset identifiers
 * for price lookup via CoinGecko API
 */

// Common placeholder address for native ETH
const ETH_PLACEHOLDER = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

// Token address to asset info mapping
const TOKEN_MAPPING = {
  // ETH (native) - placeholder address
  [ETH_PLACEHOLDER.toLowerCase()]: {
    symbol: "ETH",
    name: "Ethereum",
    coingeckoId: "ethereum",
  },
  // BTC (wrapped or placeholder)
  "0x0000000000000000000000000000000000000000": {
    symbol: "BTC",
    name: "Bitcoin",
    coingeckoId: "bitcoin",
  },
  // Add more token addresses here as needed
  // Example for wrapped tokens:
  // "0x...": {
  //   symbol: "SOL",
  //   name: "Solana",
  //   coingeckoId: "solana",
  // },
};

// Symbol to CoinGecko ID mapping (fallback if address not found)
// Supports both uppercase symbols (ETH) and lowercase CoinGecko IDs (ethereum)
const SYMBOL_TO_COINGECKO = {
  ETH: "ethereum",
  ETHEREUM: "ethereum", // Handle if name is "ethereum" instead of "ETH"
  BTC: "bitcoin",
  BITCOIN: "bitcoin",
  SOL: "solana",
  SOLANA: "solana",
  LINK: "chainlink",
  CHAINLINK: "chainlink",
  AAVE: "aave",
  BNB: "binancecoin",
  BINANCECOIN: "binancecoin",
};

/**
 * Get asset info from token address
 * @param {string} tokenAddress - Token address (case-insensitive)
 * @returns {object|null} - { symbol, name, coingeckoId } or null if not found
 */
function getAssetFromAddress(tokenAddress) {
  if (!tokenAddress) return null;
  
  const normalized = tokenAddress.toLowerCase();
  
  // Check direct mapping
  if (TOKEN_MAPPING[normalized]) {
    return TOKEN_MAPPING[normalized];
  }
  
  // Check if it's the ETH placeholder
  if (normalized === ETH_PLACEHOLDER.toLowerCase()) {
    return TOKEN_MAPPING[ETH_PLACEHOLDER.toLowerCase()];
  }
  
  return null;
}

/**
 * Get CoinGecko ID from symbol or name
 * @param {string} symbol - Token symbol (e.g., "ETH", "BTC") or CoinGecko ID (e.g., "ethereum")
 * @returns {string|null} - CoinGecko ID or null if not found
 */
function getCoinGeckoId(symbol) {
  if (!symbol) return null;
  const upper = symbol.toUpperCase();
  // Check if it's already a CoinGecko ID (lowercase) or a symbol (uppercase)
  // First try uppercase (symbol), then try lowercase (might be CoinGecko ID)
  return SYMBOL_TO_COINGECKO[upper] || SYMBOL_TO_COINGECKO[symbol.toLowerCase()] || null;
}

module.exports = {
  TOKEN_MAPPING,
  SYMBOL_TO_COINGECKO,
  ETH_PLACEHOLDER,
  getAssetFromAddress,
  getCoinGeckoId,
};
