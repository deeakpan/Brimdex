import deployments from "../deployments.json";

// Contract addresses from deployments
const somniaTestnet = deployments.somniaTestnet as {
  factory: string;
  orderBook: string;
  usdc: string;
};

export const CONTRACTS = {
  somniaTestnet: {
    FACTORY: somniaTestnet.factory,
    ORDERBOOK: somniaTestnet.orderBook,
    USDC: somniaTestnet.usdc,
  },
};

// Factory ABI (key functions only)
export const FACTORY_ABI = [
  {
    inputs: [],
    name: "getAllMarkets",
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "address" }],
    name: "isMarket",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "address" }],
    name: "marketToBoundToken",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "address" }],
    name: "marketToBreakToken",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "market", type: "address" },
      { indexed: true, name: "boundToken", type: "address" },
      { indexed: true, name: "breakToken", type: "address" },
      { indexed: false, name: "name", type: "string" },
      { indexed: false, name: "lowerBound", type: "uint256" },
      { indexed: false, name: "upperBound", type: "uint256" },
      { indexed: false, name: "expiryTimestamp", type: "uint256" },
    ],
    name: "MarketCreated",
    type: "event",
  },
] as const;

// Market ABI
export const MARKET_ABI = [
  {
    inputs: [],
    name: "marketConfig",
    outputs: [
      { name: "name", type: "string" },
      { name: "lowerBound", type: "uint256" },
      { name: "upperBound", type: "uint256" },
      { name: "expiryTimestamp", type: "uint256" },
      { name: "creationTimestamp", type: "uint256" },
      { name: "startPrice", type: "uint256" },
      { name: "initialized", type: "bool" },
      { name: "settled", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "amount", type: "uint256" }],
    name: "buyBound",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "amount", type: "uint256" }],
    name: "buyBreak",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "getBoundPrice",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getBreakPrice",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "isBound", type: "bool" },
      { name: "amount", type: "uint256" },
    ],
    name: "getEstimatedTokens",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "isBound", type: "bool" },
      { name: "tokens", type: "uint256" },
    ],
    name: "getEstimatedPayout",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "isBound", type: "bool" },
      { name: "amount", type: "uint256" },
    ],
    name: "redeem",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "boundPool",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "breakPool",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "boundWins",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "redemptionRate",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "buyer", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "tokens", type: "uint256" },
      { indexed: false, name: "price", type: "uint256" },
    ],
    name: "BoundPurchased",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "buyer", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "tokens", type: "uint256" },
      { indexed: false, name: "price", type: "uint256" },
    ],
    name: "BreakPurchased",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, name: "boundWins", type: "bool" },
      { indexed: false, name: "totalPool", type: "uint256" },
      { indexed: false, name: "winnings", type: "uint256" },
    ],
    name: "MarketSettled",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "tokens", type: "uint256" },
      { indexed: false, name: "payout", type: "uint256" },
    ],
    name: "TokensRedeemed",
    type: "event",
  },
] as const;

// OrderBook ABI
export const ORDERBOOK_ABI = [
  {
    inputs: [
      { name: "market", type: "address" },
      { name: "token", type: "address" },
      { name: "price", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    name: "placeSellOrder",
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "market", type: "address" },
      { name: "token", type: "address" },
      { name: "price", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    name: "placeBuyOrder",
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "market", type: "address" },
      { name: "token", type: "address" },
      { name: "price", type: "uint256" },
      { name: "orderId", type: "bytes32" },
    ],
    name: "cancelSellOrder",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "market", type: "address" },
      { name: "token", type: "address" },
      { name: "price", type: "uint256" },
      { name: "orderId", type: "bytes32" },
    ],
    name: "cancelBuyOrder",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "market", type: "address" },
      { name: "token", type: "address" },
    ],
    name: "getBestBid",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "market", type: "address" },
      { name: "token", type: "address" },
    ],
    name: "getBestAsk",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "market", type: "address" },
      { indexed: true, name: "token", type: "address" },
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "price", type: "uint256" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "orderId", type: "bytes32" },
      { indexed: false, name: "isBuy", type: "bool" },
    ],
    name: "OrderPlaced",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "market", type: "address" },
      { indexed: true, name: "token", type: "address" },
      { indexed: true, name: "maker", type: "address" },
      { indexed: false, name: "taker", type: "address" },
      { indexed: false, name: "price", type: "uint256" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
    name: "OrderMatched",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "market", type: "address" },
      { indexed: true, name: "token", type: "address" },
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "price", type: "uint256" },
      { indexed: false, name: "orderId", type: "bytes32" },
    ],
    name: "OrderCancelled",
    type: "event",
  },
] as const;

// Token ABI (ERC20 + custom) - explicit object format for viem
export const TOKEN_ABI = [
  {
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
