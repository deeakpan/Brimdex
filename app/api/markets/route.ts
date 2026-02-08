import { NextResponse } from "next/server";
import { createPublicClient, http, defineChain } from "viem";
import deployments from "../../deployments.json";
// Import ABIs - need to use proper format for viem
const FACTORY_ABI = [
  {
    inputs: [],
    name: "getAllMarkets",
    outputs: [{ internalType: "address[]", name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "marketToBoundToken",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "marketToBreakToken",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const MARKET_ABI = [
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
] as const;

const TOKEN_ABI = [
  {
    inputs: [],
    name: "name",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Somnia Testnet configuration
const somniaTestnet = defineChain({
  id: 50312,
  name: "Somnia Testnet",
  nativeCurrency: { decimals: 18, name: "Somnia Test Token", symbol: "STT" },
  rpcUrls: { default: { http: ["https://dream-rpc.somnia.network"] } },
  blockExplorers: { default: { name: "Somnia Explorer", url: "https://shannon-explorer.somnia.network" } },
  testnet: true,
});

const CONTRACTS = {
  FACTORY: deployments.somniaTestnet.factory as `0x${string}`,
};

export async function GET() {
  try {
    const publicClient = createPublicClient({
      chain: somniaTestnet,
      transport: http(),
    });

    // Get all markets from factory
    const allMarkets = await publicClient.readContract({
      address: CONTRACTS.FACTORY,
      abi: FACTORY_ABI,
      functionName: "getAllMarkets",
    });

    if (!allMarkets || allMarkets.length === 0) {
      return NextResponse.json({ markets: [] });
    }

    // Fetch market details
    const marketsData = [];

    for (const marketAddress of allMarkets) {
      try {
        // Get token addresses and market config
        // Get bound and break tokens first
        const boundToken = await publicClient.readContract({
          address: CONTRACTS.FACTORY,
          abi: FACTORY_ABI,
          functionName: "marketToBoundToken",
          args: [marketAddress as `0x${string}`],
        }) as `0x${string}`;

        const breakToken = await publicClient.readContract({
          address: CONTRACTS.FACTORY,
          abi: FACTORY_ABI,
          functionName: "marketToBreakToken",
          args: [marketAddress as `0x${string}`],
        }) as `0x${string}`;

        // Get market config and token names
        let config: any;
        let boundName: any;
        let breakName: any;

        try {
          // Get market config - wrap in try-catch to handle any parsing errors
          config = await publicClient.readContract({
            address: marketAddress as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "marketConfig",
          });

          // Validate config is not a function or string
          if (typeof config === 'function' || (typeof config === 'string' && config.includes('function'))) {
            console.error(`Config is a function/string for market ${marketAddress}, skipping`);
            continue;
          }

          // Get token names
          [boundName, breakName] = await Promise.all([
            publicClient.readContract({
              address: boundToken,
              abi: TOKEN_ABI,
              functionName: "name",
            }).catch(() => ""),
            publicClient.readContract({
              address: breakToken,
              abi: TOKEN_ABI,
              functionName: "name",
            }).catch(() => ""),
          ]);
        } catch (configError: any) {
          console.error(`Error reading config for market ${marketAddress}:`, configError?.message || configError);
          continue;
        }

        // Handle config - viem returns tuples as arrays
        let marketConfigData: {
          name: string;
          lowerBound: bigint;
          upperBound: bigint;
          expiryTimestamp: bigint;
          creationTimestamp: bigint;
          startPrice: bigint;
          initialized: boolean;
          settled: boolean;
        };

        // Viem returns structs as arrays when using tuple format in ABI
        if (Array.isArray(config)) {
          // Tuple format - ensure we have enough elements
          if (config.length < 8) {
            console.error(`Config array too short for market ${marketAddress}:`, config.length);
            continue;
          }
          marketConfigData = {
            name: String(config[0] || ""),
            lowerBound: BigInt(config[1] || 0),
            upperBound: BigInt(config[2] || 0),
            expiryTimestamp: BigInt(config[3] || 0),
            creationTimestamp: BigInt(config[4] || 0),
            startPrice: BigInt(config[5] || 0),
            initialized: Boolean(config[6]),
            settled: Boolean(config[7]),
          };
        } else if (config && typeof config === 'object' && config !== null && !Array.isArray(config)) {
          // Object format (shouldn't happen with our ABI, but handle it)
          const configObj = config as Record<string, any>;
          marketConfigData = {
            name: String(configObj.name || configObj[0] || ""),
            lowerBound: BigInt(configObj.lowerBound || configObj[1] || 0),
            upperBound: BigInt(configObj.upperBound || configObj[2] || 0),
            expiryTimestamp: BigInt(configObj.expiryTimestamp || configObj[3] || 0),
            creationTimestamp: BigInt(configObj.creationTimestamp || configObj[4] || 0),
            startPrice: BigInt(configObj.startPrice || configObj[5] || 0),
            initialized: Boolean(configObj.initialized ?? configObj[6]),
            settled: Boolean(configObj.settled ?? configObj[7]),
          };
        } else {
          console.error(`Invalid config format for market ${marketAddress}:`, {
            type: typeof config,
            isArray: Array.isArray(config),
            value: config,
          });
          continue;
        }

        if (!boundToken || !breakToken || !marketConfigData.initialized) continue;

        // Parse timeframe from token name (e.g., "ETH-24h-BOUND" -> "24h")
        const timeframe = (boundName as string).match(/-(\d+[hd])-/)?.[1] || "24h";

        // Get symbol from name in config
        const symbol = marketConfigData.name || (boundName as string).split("-")[0] || "UNKNOWN";

        // Calculate rangePercent from bounds
        const startPrice = Number(marketConfigData.startPrice) / 1e6;
        const lowerBound = Number(marketConfigData.lowerBound) / 1e6;
        const upperBound = Number(marketConfigData.upperBound) / 1e6;
        const rangePercent = startPrice > 0
          ? ((upperBound - lowerBound) / 2 / startPrice) * 100
          : 1.5;

        marketsData.push({
          address: marketAddress,
          boundToken: boundToken as string,
          breakToken: breakToken as string,
          symbol,
          timeframe,
          rangePercent,
          startPrice,
          lowerBound,
          upperBound,
          expiryTimestamp: Number(marketConfigData.expiryTimestamp),
          creationTimestamp: Number(marketConfigData.creationTimestamp),
          settled: marketConfigData.settled,
          boundTokenName: boundName as string,
          breakTokenName: breakName as string,
        });
      } catch (err: any) {
        console.error(`Error loading market ${marketAddress}:`, err.message);
        // Continue with other markets
      }
    }

    return NextResponse.json({ markets: marketsData });
  } catch (error: any) {
    console.error("Error fetching markets:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch markets" },
      { status: 500 }
    );
  }
}
