/**
 * Token Address to Symbol/Price Mapping
 * Maps token addresses (or placeholder addresses) to asset identifiers
 * for price lookup via CoinGecko API
 *
 * This should match scripts/token-mapping.js
 */

// Common placeholder address for native ETH
export const ETH_PLACEHOLDER = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

// Token address to asset info mapping
export const TOKEN_MAPPING: Record<string, {
  symbol: string;
  name: string;
  coingeckoId: string;
  image?: string;
}> = {
  // ETH (native) - placeholder address
  [ETH_PLACEHOLDER.toLowerCase()]: {
    symbol: "ETH",
    name: "Ethereum",
    coingeckoId: "ethereum",
    image: "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
  },
  // BTC (placeholder)
  "0x0000000000000000000000000000000000000000": {
    symbol: "BTC",
    name: "Bitcoin",
    coingeckoId: "bitcoin",
    image: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
  },
  // Add more token addresses here as needed
};

// Symbol to CoinGecko ID mapping (fallback if address not found)
export const SYMBOL_TO_COINGECKO: Record<string, string> = {
  ETH: "ethereum",
  BTC: "bitcoin",
  SOL: "solana",
  LINK: "chainlink",
  AAVE: "aave",
  BNB: "binancecoin",
};

// Symbol to image mapping
export const SYMBOL_TO_IMAGE: Record<string, string> = {
  ETH: "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
  BTC: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
  SOL: "https://assets.coingecko.com/coins/images/4128/large/solana.png",
  LINK: "https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png",
  AAVE: "https://assets.coingecko.com/coins/images/12645/large/aave.png",
  BNB: "https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png",
};

/**
 * Get asset info from token address
 * @param tokenAddress - Token address (case-insensitive)
 * @returns Asset info or null if not found
 */
export function getAssetFromAddress(tokenAddress: string | null | undefined): {
  symbol: string;
  name: string;
  coingeckoId: string;
  image?: string;
} | null {
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
 * Get CoinGecko ID from symbol
 * @param symbol - Token symbol (e.g., "ETH", "BTC")
 * @returns CoinGecko ID or null if not found
 */
export function getCoinGeckoId(symbol: string | null | undefined): string | null {
  if (!symbol) return null;
  return SYMBOL_TO_COINGECKO[symbol.toUpperCase()] || null;
}

/**
 * Get image URL from symbol
 * @param symbol - Token symbol (e.g., "ETH", "BTC")
 * @returns Image URL or default
 */
export function getImageFromSymbol(symbol: string | null | undefined): string {
  if (!symbol) return "";
  return SYMBOL_TO_IMAGE[symbol.toUpperCase()] || "";
}
