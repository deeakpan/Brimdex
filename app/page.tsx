"use client";

import { useEffect, useMemo, useState, useRef, memo } from "react";
import Link from "next/link";
import { AdvancedRealTimeChart } from "react-ts-tradingview-widgets";
import { ConnectKitButton } from "connectkit";
import {
  useAccount,
  useChainId,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSignMessage,
  useSwitchChain,
  usePublicClient,
} from "wagmi";
import { erc20Abi, formatUnits, parseUnits, zeroAddress, decodeEventLog } from "viem";
import { CONTRACTS, FACTORY_ABI, MARKET_ABI, ORDERBOOK_ABI, TOKEN_ABI } from "./contracts";
import { getAssetFromAddress, getImageFromSymbol, getCoinGeckoId, ETH_PLACEHOLDER } from "./token-mapping";

type Side = "BOUND" | "BREAK";
type OrderType = "MARKET" | "LIMIT";

type OrderBookLevel = {
  price: number;
  size: number;
};

function formatAmountForDisplay(amount: string, maxDecimals = 2) {
  const [iRaw, fRaw = ""] = amount.split(".");
  const sign = iRaw.startsWith("-") ? "-" : "";
  const i = iRaw.replace("-", "");
  const withCommas = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = fRaw.slice(0, maxDecimals).replace(/0+$/, "");
  return frac.length ? `${sign}${withCommas}.${frac}` : `${sign}${withCommas}`;
}

type Position = {
  id: string;
  assetId: string;
  side: Side;
  size: number;
  avgPrice: number;
  status: "OPEN" | "SETTLED";
};

type CoinGeckoCoin = {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap?: number;
  total_volume?: number;
  price_change_percentage_24h?: number;
};

// TradingView widget is sensitive to frequent re-renders (it may re-init and "reload").
// Memoize it so it only re-renders when the symbol actually changes.
const TradingViewChart = memo(function TradingViewChart({ symbol }: { symbol: string }) {
  return (
    <AdvancedRealTimeChart
      symbol={symbol}
      interval="60"
      timezone="Etc/UTC"
      theme="dark"
      style="1"
      locale="en"
      autosize
      hide_side_toolbar={false}
      allow_symbol_change={false}
      save_image={false}
      details={false}
      hotlist={false}
      calendar={false}
      studies={[]}
    />
  );
});

type MarketConfig = {
  id: string;
  symbol: string;
  name: string;
  image: string;
  startPrice: number;
  rangePercent: number;
  coingeckoId: string;
  volume24h?: number;
  marketCap?: number;
  priceChange24h?: number;
  timeframe?: string; // e.g., "24h", "7d", "30d"
  hasMarket?: boolean; // Whether this market exists on-chain
  creationTimestamp?: number; // When market was created
  expiryTimestamp?: number; // When market expires
  settled?: boolean; // Whether market is settled
};

// Order books will be fetched from contract
const orderBooks: Record<
  string,
  {
    bound: OrderBookLevel[];
    break: OrderBookLevel[];
  }
> = {};

const FALLBACK_MARKETS: MarketConfig[] = [
  {
    id: "ethereum",
    symbol: "ETH",
    name: "Ethereum",
    image: "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
    startPrice: 3450,
    rangePercent: 1.5,
    coingeckoId: "ethereum",
  },
  {
    id: "bitcoin",
    symbol: "BTC",
    name: "Bitcoin",
    image: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
    startPrice: 68500,
    rangePercent: 1.5,
    coingeckoId: "bitcoin",
  },
  {
    id: "solana",
    symbol: "SOL",
    name: "Solana",
    image: "https://assets.coingecko.com/coins/images/4128/large/solana.png",
    startPrice: 165,
    rangePercent: 1.5,
    coingeckoId: "solana",
  },
];

const initialPositions: Position[] = [
  {
    id: "1",
    assetId: "ethereum",
    side: "BOUND",
    size: 25,
    avgPrice: 0.51,
    status: "OPEN",
  },
  {
    id: "2",
    assetId: "ethereum",
    side: "BREAK",
    size: 10,
    avgPrice: 0.49,
    status: "OPEN",
  },
];

export default function Home() {
  const [markets, setMarkets] = useState<MarketConfig[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<MarketConfig | null>(
    null
  );
  const [side, setSide] = useState<Side>("BOUND");
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [limitOrderSide, setLimitOrderSide] = useState<"buy" | "sell">("buy");
  // User inputs USDC amount; we derive units from amount / price-per-unit
  const [size, setSize] = useState<string>("10");
  const [price, setPrice] = useState<string>("0.51");
  const [positions, setPositions] = useState<Position[]>([]);
  const [realMarkets, setRealMarkets] = useState<Array<{
    address: string;
    boundToken: string;
    breakToken: string;
    config: any;
    boundTokenName: string;
    breakTokenName: string;
    symbol: string;
    timeframe: string;
  }>>([]);
  const [selectedMarketAddress, setSelectedMarketAddress] = useState<string | null>(null);
  const [marketsLoading, setMarketsLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [connectKitShow, setConnectKitShow] = useState<(() => void) | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<"24h" | "7d" | "30d">("24h");
  const [durationDropdownOpen, setDurationDropdownOpen] = useState(false);
  const [selectedBand, setSelectedBand] = useState<1.5 | 3 | 5>(3);
  const [bandDropdownOpen, setBandDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));
  const [isClientMounted, setIsClientMounted] = useState(false);
  const connectKitShowRef = useRef<(() => void) | null>(null);

  // Update current time every second for expiry countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // TradingView widget is not React-friendly in dev when repeatedly mounted/unmounted.
  // Only render after client mount to avoid hydration/DOM timing issues.
  useEffect(() => {
    setIsClientMounted(true);
  }, []);

  // Wagmi hooks
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const SOMNIA_TESTNET_CHAIN_ID = 50312;
  const USDC_ADDRESS = CONTRACTS.somniaTestnet.USDC as `0x${string}`;

  const { data: usdcBalanceRaw } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    query: {
      enabled: !!address,
      refetchInterval: 10_000,
    },
  });

  // Markets are now fetched from API route (see loadRealMarkets useEffect below)

  const { writeContract: buyTokens, data: buyHash, error: buyError, status: buyStatus } = useWriteContract();
  const { writeContract: placeOrder } = useWriteContract();
  const { writeContract: approveUsdc, data: approveHash, error: approveError } = useWriteContract();
  const { isLoading: isBuying, isSuccess: isBuySuccess } = useWaitForTransactionReceipt({ hash: buyHash });
  const { isLoading: isApproving, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });
  const [showBuySuccess, setShowBuySuccess] = useState(false);
  const [showApproveSuccess, setShowApproveSuccess] = useState(false);
  const [lastSuccessOrderType, setLastSuccessOrderType] = useState<OrderType | null>(null);
  const [lastSuccessAmount, setLastSuccessAmount] = useState<string>("");
  const [lastSuccessSide, setLastSuccessSide] = useState<Side | null>(null);
  const [allPositions, setAllPositions] = useState<Position[]>([]);
  const [recentTrades, setRecentTrades] = useState<
    Array<{
      kind: "PARI" | "LIMIT";
      side: "BOUND" | "BREAK";
      amountUsdc: string;
      tokens: string;
      price: string;
      timestamp: number;
    }>
  >([]);

  const publicClient = usePublicClient();
  
  // Get user's token balances for selected market
  const realMarket = selectedMarketAddress ? realMarkets.find(m => m.address === selectedMarketAddress) : null;
  const { data: boundTokenBalance } = useReadContract({
    address: realMarket?.boundToken as `0x${string}` | undefined,
    abi: TOKEN_ABI,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    query: {
      enabled: !!realMarket?.boundToken && !!address,
      refetchInterval: 10_000,
    },
  });
  const { data: breakTokenBalance } = useReadContract({
    address: realMarket?.breakToken as `0x${string}` | undefined,
    abi: TOKEN_ABI,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    query: {
      enabled: !!realMarket?.breakToken && !!address,
      refetchInterval: 10_000,
    },
  });

  // Check USDC allowance for the selected market contract
  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address ?? zeroAddress, (selectedMarketAddress as `0x${string}`) ?? zeroAddress],
    query: {
      enabled: !!address && !!selectedMarketAddress,
      refetchInterval: 5_000,
    },
  });

  // Map market symbols to TradingView format
  const getTradingViewSymbol = (symbol: string): string => {
    const symbolMap: Record<string, string> = {
      BTC: "BINANCE:BTCUSDT",
      ETH: "BINANCE:ETHUSDT",
      SOL: "BINANCE:SOLUSDT",
      BNB: "BINANCE:BNBUSDT",
      ADA: "BINANCE:ADAUSDT",
      AVAX: "BINANCE:AVAXUSDT",
      MATIC: "BINANCE:MATICUSDT",
      LINK: "BINANCE:LINKUSDT",
    };
    return symbolMap[symbol] || `BINANCE:${symbol}USDT`;
  };

  // Stable chart symbol (only changes when the market symbol changes)
  const chartSymbol = useMemo(() => {
    return selectedMarket ? getTradingViewSymbol(selectedMarket.symbol) : "";
  }, [selectedMarket?.symbol]);

  // Order books will be loaded from orderbook contract (TODO: implement)
  // For now, show empty orderbook

  // Always show all popular tokens in dropdown, even if no market exists
  const ALL_TOKENS: MarketConfig[] = [
    {
      id: "bitcoin",
      symbol: "BTC",
      name: "Bitcoin",
      image: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
      startPrice: 68500,
      rangePercent: 1.5,
      coingeckoId: "bitcoin",
    },
    {
      id: "ethereum",
      symbol: "ETH",
      name: "Ethereum",
      image: "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
      startPrice: 3450,
      rangePercent: 1.5,
      coingeckoId: "ethereum",
    },
    {
      id: "solana",
      symbol: "SOL",
      name: "Solana",
      image: "https://assets.coingecko.com/coins/images/4128/large/solana.png",
      startPrice: 165,
      rangePercent: 1.5,
      coingeckoId: "solana",
    },
    {
      id: "binancecoin",
      symbol: "BNB",
      name: "BNB",
      image: "https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png",
      startPrice: 600,
      rangePercent: 1.5,
      coingeckoId: "binancecoin",
    },
    {
      id: "cardano",
      symbol: "ADA",
      name: "Cardano",
      image: "https://assets.coingecko.com/coins/images/975/large/cardano.png",
      startPrice: 0.5,
      rangePercent: 1.5,
      coingeckoId: "cardano",
    },
    {
      id: "avalanche-2",
      symbol: "AVAX",
      name: "Avalanche",
      image: "https://assets.coingecko.com/coins/images/12559/large/avalanche-avax-logo.png",
      startPrice: 40,
      rangePercent: 1.5,
      coingeckoId: "avalanche-2",
    },
    {
      id: "chainlink",
      symbol: "LINK",
      name: "Chainlink",
      image: "https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png",
      startPrice: 15,
      rangePercent: 1.5,
      coingeckoId: "chainlink",
    },
    {
      id: "zcash",
      symbol: "ZEC",
      name: "Zcash",
      image: "https://assets.coingecko.com/coins/images/486/large/zcash.png",
      startPrice: 25,
      rangePercent: 1.5,
      coingeckoId: "zcash",
    },
    {
      id: "polygon",
      symbol: "MATIC",
      name: "Polygon",
      image: "https://assets.coingecko.com/coins/images/4713/large/polygon.png",
      startPrice: 0.8,
      rangePercent: 1.5,
      coingeckoId: "polygon",
    },
    {
      id: "uniswap",
      symbol: "UNI",
      name: "Uniswap",
      image: "https://assets.coingecko.com/coins/images/12504/large/uniswap-uni.png",
      startPrice: 7,
      rangePercent: 1.5,
      coingeckoId: "uniswap",
    },
    {
      id: "litecoin",
      symbol: "LTC",
      name: "Litecoin",
      image: "https://assets.coingecko.com/coins/images/2/large/litecoin.png",
      startPrice: 95,
      rangePercent: 1.5,
      coingeckoId: "litecoin",
    },
    {
      id: "dogecoin",
      symbol: "DOGE",
      name: "Dogecoin",
      image: "https://assets.coingecko.com/coins/images/5/large/dogecoin.png",
      startPrice: 0.08,
      rangePercent: 1.5,
      coingeckoId: "dogecoin",
    },
  ];

  // Fetch 24h price changes from CoinGecko
  useEffect(() => {
    const fetchPriceChanges = async () => {
      if (markets.length === 0) return;
      
      try {
        const coinIds = markets.map(m => m.coingeckoId).filter(Boolean).join(",");
        if (!coinIds) return;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd&include_24hr_change=true`,
          { 
            headers: { Accept: "application/json" },
            signal: controller.signal
          }
        );
        
        clearTimeout(timeoutId);
        
        if (res.ok) {
          const data = await res.json();
          setMarkets(prev => {
            const updated = prev.map(market => {
              const coinData = data[market.coingeckoId];
              if (coinData) {
                return {
                  ...market,
                  startPrice: coinData.usd || market.startPrice,
                  priceChange24h: coinData.usd_24h_change,
                };
              }
              return market;
            });
            
            return updated;
          });
        }
      } catch (err) {
        console.error("Error fetching price changes:", err);
      }
    };

    if (markets.length > 0) {
      fetchPriceChanges();
      const interval = setInterval(fetchPriceChanges, 60_000); // Update every minute
      return () => clearInterval(interval);
    }
  }, [markets.length]);

  // Update selectedMarket when markets are updated with price changes
  useEffect(() => {
    if (selectedMarket && markets.length > 0) {
      const updatedMarket = markets.find(m => m.id === selectedMarket.id);
      if (updatedMarket && updatedMarket.priceChange24h !== selectedMarket.priceChange24h) {
        setSelectedMarket(updatedMarket);
      }
    }
  }, [markets, selectedMarket?.id]);

  // Fetch real markets from API route
  useEffect(() => {
    const loadRealMarkets = async () => {
      console.log("🔄 Loading markets from API...");

      try {
        const response = await fetch("/api/markets");
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.error) {
          throw new Error(data.error);
        }

        const marketsData = data.markets || [];
        console.log(`✅ Found ${marketsData.length} markets from API`);

        // Transform API data to match frontend format
        const transformedMarkets = marketsData.map((m: any) => ({
          address: m.address,
          boundToken: m.boundToken,
          breakToken: m.breakToken,
          config: {
            name: m.symbol,
            lowerBound: BigInt(Math.floor(m.lowerBound * 1e6)),
            upperBound: BigInt(Math.floor(m.upperBound * 1e6)),
            expiryTimestamp: BigInt(m.expiryTimestamp),
            creationTimestamp: BigInt(m.creationTimestamp),
            startPrice: BigInt(Math.floor(m.startPrice * 1e6)),
            initialized: true,
            settled: m.settled,
          },
          boundTokenName: m.boundTokenName,
          breakTokenName: m.breakTokenName,
          symbol: m.symbol,
          timeframe: m.timeframe,
        }));

        setRealMarkets(transformedMarkets);
        
        console.log("🔍 Raw markets data:", transformedMarkets);
        console.log("🔍 Selected duration:", selectedDuration);
        console.log("🔍 Selected band:", selectedBand);
        
        // Create MarketConfig for UI compatibility
        const marketConfigs: MarketConfig[] = transformedMarkets.map((m: any) => {
          const symbol = m.symbol;
          const coingeckoId = getCoinGeckoId(symbol) || symbol.toLowerCase();
          const image = getImageFromSymbol(symbol);
          
          console.log(`📊 Market ${m.address}:`, {
            symbol,
            timeframe: m.timeframe,
            boundTokenName: m.boundTokenName,
            startPrice: m.config.startPrice,
            lowerBound: m.config.lowerBound,
            upperBound: m.config.upperBound,
            rangePercent: marketsData.find((md: any) => md.address === m.address)?.rangePercent,
            settled: m.config.settled
          });
          
          const marketApiData = marketsData.find((md: any) => md.address === m.address);
          
          return {
            id: m.address,
            symbol: symbol,
            name: `${symbol} ${m.timeframe}`,
            image: image,
            startPrice: marketApiData?.startPrice || Number(m.config.startPrice) / 1e6,
            rangePercent: marketApiData?.rangePercent || 1.5,
            coingeckoId: coingeckoId,
            timeframe: m.timeframe,
            hasMarket: true,
            creationTimestamp: Number(m.config.creationTimestamp),
            expiryTimestamp: Number(m.config.expiryTimestamp),
            settled: m.config.settled,
          };
        });

        console.log("📋 All market configs:", marketConfigs);

        // Filter markets by selectedDuration, selectedBand, show only active (not settled), and not expired
        const now = Math.floor(Date.now() / 1000); // Current timestamp in seconds
        const filteredMarkets = marketConfigs.filter(m => {
          const matchesTimeframe = m.timeframe === selectedDuration;
          const matchesBand = Math.abs(m.rangePercent - selectedBand) < 0.5;
          const isActive = !m.settled;
          const isNotExpired = m.expiryTimestamp ? m.expiryTimestamp > now : true; // Check timestamp even if not settled
          const passes = matchesTimeframe && matchesBand && isActive && isNotExpired;
          
          if (!passes) {
            console.log(`❌ Market ${m.id} filtered out:`, {
              matchesTimeframe,
              matchesBand,
              isActive,
              isNotExpired,
              timeframe: m.timeframe,
              rangePercent: m.rangePercent,
              selectedBand,
              settled: m.settled,
              expiryTimestamp: m.expiryTimestamp,
              currentTime: now,
              diff: Math.abs(m.rangePercent - selectedBand)
            });
          } else {
            console.log(`✅ Market ${m.id} passed filter:`, {
              symbol: m.symbol,
              timeframe: m.timeframe,
              rangePercent: m.rangePercent,
              selectedBand,
              expiryTimestamp: m.expiryTimestamp,
              currentTime: now
            });
          }
          
          return passes;
        });
        
        console.log("✅ Filtered markets:", filteredMarkets);
        
        // Show filtered active markets, plus tokens without markets
        const marketsWithStatus: MarketConfig[] = [];
        
        filteredMarkets.forEach(market => {
          marketsWithStatus.push({
            ...market,
            hasMarket: true,
            priceChange24h: ALL_TOKENS.find(t => t.symbol === market.symbol)?.priceChange24h
          });
        });
        
        ALL_TOKENS.forEach(token => {
          const hasActiveMarket = filteredMarkets.some(m => m.symbol === token.symbol);
          if (!hasActiveMarket) {
            marketsWithStatus.push({ ...token, hasMarket: false });
          }
        });

        setMarkets(marketsWithStatus);
        if (marketsWithStatus.length > 0 && !selectedMarket) {
          const marketWithData = marketsWithStatus.find(m => marketConfigs.some(cm => cm.id === m.id)) || marketsWithStatus[0];
          setSelectedMarket(marketWithData);
          if (marketConfigs.some(cm => cm.id === marketWithData.id)) {
            setSelectedMarketAddress(marketWithData.id);
          }
        }
      } catch (err: any) {
        console.error("Error loading markets:", err);
        // Fallback - show all tokens
        setMarkets(ALL_TOKENS);
        if (ALL_TOKENS.length > 0 && !selectedMarket) {
          setSelectedMarket(ALL_TOKENS[0]);
        }
      } finally {
        setMarketsLoading(false);
      }
    };

    void loadRealMarkets();
    
    // Refetch every 30 seconds
    const interval = setInterval(loadRealMarkets, 30_000);
    return () => clearInterval(interval);
  }, [selectedDuration, selectedBand]);

  // Handle network switching and signature after connection
  useEffect(() => {
    const handleConnection = async () => {
      if (isConnected && address) {
        const signedKey = `brimdex:signed:${SOMNIA_TESTNET_CHAIN_ID}:${address.toLowerCase()}`;
        const alreadySigned = typeof window !== "undefined" && window.localStorage.getItem(signedKey) === "1";
        if (alreadySigned && !hasSigned) setHasSigned(true);

        // Switch to Somnia testnet if not already on it
        if (chainId !== SOMNIA_TESTNET_CHAIN_ID) {
          try {
            await switchChain({ chainId: SOMNIA_TESTNET_CHAIN_ID });
          } catch (error) {
            console.error("Failed to switch chain:", error);
          }
        }

        // Request signature to prove ownership (only once)
        if (!alreadySigned && !hasSigned && chainId === SOMNIA_TESTNET_CHAIN_ID) {
          try {
            const message = `Welcome to BrimDex!\n\nSign this message to prove ownership of your wallet.\n\nWallet: ${address}\nTimestamp: ${Date.now()}`;
            await signMessageAsync({ message });
            setHasSigned(true);
            window.localStorage.setItem(signedKey, "1");
          } catch (error) {
            console.error("Signature rejected:", error);
          }
        }
      }
    };

    void handleConnection();
  }, [isConnected, address, chainId, switchChain, signMessageAsync, hasSigned]);

  const band = useMemo(() => {
    if (!selectedMarket) return { lower: 0, upper: 0 };
    
    // Use real market bounds if available
    if (selectedMarketAddress) {
      const realMarket = realMarkets.find(m => m.address === selectedMarketAddress);
      if (realMarket?.config) {
        return {
          lower: Number(realMarket.config.lowerBound) / 1e6,
          upper: Number(realMarket.config.upperBound) / 1e6,
        };
      }
    }
    
    // Fallback to calculated bounds
    const delta = (selectedMarket.startPrice * selectedBand) / 100;
    return {
      lower: selectedMarket.startPrice - delta,
      upper: selectedMarket.startPrice + delta,
    };
  }, [selectedMarket, selectedBand, selectedMarketAddress, realMarkets]);

  // Get current market prices from contract
  const { data: boundPrice } = useReadContract({
    address: selectedMarketAddress as `0x${string}` | undefined,
    abi: MARKET_ABI,
    functionName: "getBoundPrice",
    query: {
      enabled: !!selectedMarketAddress,
      refetchInterval: 5_000,
    },
  });

  const { data: breakPrice } = useReadContract({
    address: selectedMarketAddress as `0x${string}` | undefined,
    abi: MARKET_ABI,
    functionName: "getBreakPrice",
    query: {
      enabled: !!selectedMarketAddress,
      refetchInterval: 5_000,
    },
  });

  // Get estimated tokens from contract for more accurate calculations
  const sizeAmount = useMemo(() => {
    try {
      const num = Number(size || "0");
      if (num > 0) return parseUnits(num.toFixed(6), 6);
      return BigInt(0);
    } catch {
      return BigInt(0);
    }
  }, [size]);

  const { data: estimatedBoundTokens } = useReadContract({
    address: selectedMarketAddress as `0x${string}` | undefined,
    abi: MARKET_ABI,
    functionName: "getEstimatedTokens",
    args: [true, sizeAmount],
    query: {
      enabled: !!selectedMarketAddress && orderType === "MARKET" && side === "BOUND" && sizeAmount > BigInt(0),
      refetchInterval: 5_000,
    },
  });

  const { data: estimatedBreakTokens } = useReadContract({
    address: selectedMarketAddress as `0x${string}` | undefined,
    abi: MARKET_ABI,
    functionName: "getEstimatedTokens",
    args: [false, sizeAmount],
    query: {
      enabled: !!selectedMarketAddress && orderType === "MARKET" && side === "BREAK" && sizeAmount > BigInt(0),
      refetchInterval: 5_000,
    },
  });

  // Auto-update price from contract for MARKET orders (after boundPrice/breakPrice are defined)
  useEffect(() => {
    if (orderType === "MARKET" && boundPrice && breakPrice) {
      const contractPrice = side === "BOUND" 
        ? Number(boundPrice) / 1e18 
        : Number(breakPrice) / 1e18;
      setPrice(contractPrice.toFixed(6));
    }
  }, [orderType, side, boundPrice, breakPrice]);

  const currentBook = useMemo(() => {
    if (!selectedMarket || !boundPrice || !breakPrice) {
      return { bound: [], break: [] };
    }
    // Convert 18-decimal prices to display format
    const boundPriceNum = Number(boundPrice) / 1e18;
    const breakPriceNum = Number(breakPrice) / 1e18;
    return {
      bound: [{ price: boundPriceNum, size: 0 }], // Size would come from orderbook
      break: [{ price: breakPriceNum, size: 0 }],
    };
  }, [selectedMarket, boundPrice, breakPrice]);

  // Sync ref to state in useEffect (safe to call setState here)
  // This runs after render, so it's safe to call setState
  // MUST be before any early returns to follow Rules of Hooks
  useEffect(() => {
    if (connectKitShowRef.current && !connectKitShow) {
      setConnectKitShow(() => connectKitShowRef.current!);
    }
  });

  // Update document title based on selected market
  useEffect(() => {
    if (selectedMarket) {
      document.title = `${selectedMarket.symbol} Range Market | BrimDex`;
    } else {
      document.title = "BrimDex - Decentralized Derivatives Platform";
    }
  }, [selectedMarket]);

  const handleApprove = async () => {
    if (!selectedMarketAddress || !address) return;

    const parsedAmount = Number(size);
    if (!parsedAmount || parsedAmount <= 0) return;

    const amount = parseUnits(parsedAmount.toFixed(6), 6);
    // Approve a buffer (10x) so user doesn't have to approve every time
    const approveAmount = amount * BigInt(10);

    try {
      await approveUsdc({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "approve",
        args: [selectedMarketAddress as `0x${string}`, approveAmount],
      });
    } catch (error) {
      console.error("Approval error:", error);
      alert("Approval failed. Please check console for details.");
    }
  };

  // Refetch allowance after approval succeeds and show success
  useEffect(() => {
    if (isApproveSuccess && approveHash) {
      setShowApproveSuccess(true);
      // Wait a bit for the transaction to be indexed
      setTimeout(() => {
        refetchAllowance();
      }, 2000);
      // Hide success message after 3 seconds
      setTimeout(() => {
        setShowApproveSuccess(false);
      }, 3000);
    }
  }, [isApproveSuccess, approveHash, refetchAllowance]);

  // Monitor buy errors
  useEffect(() => {
    if (buyError) {
      console.error("Buy transaction error:", buyError);
      const errorMsg = (buyError as any)?.message || (buyError as any)?.shortMessage || (buyError as any)?.cause?.message || String(buyError) || "Transaction failed";
      alert(`Transaction error: ${errorMsg}`);
    }
  }, [buyError]);

  // Monitor buy status
  useEffect(() => {
    console.log("Buy status:", buyStatus, "Hash:", buyHash, "Error:", buyError);
  }, [buyStatus, buyHash, buyError]);

  // Show success and refetch balances after buy succeeds
  useEffect(() => {
    if (isBuySuccess && buyHash) {
      setShowBuySuccess(true);
      // Hide success message after 3 seconds
      setTimeout(() => {
        setShowBuySuccess(false);
        setLastSuccessOrderType(null);
        setLastSuccessAmount("");
        setLastSuccessSide(null);
      }, 3000);
    }
  }, [isBuySuccess, buyHash]);

  // Fetch positions from all markets
  // HOW IT WORKS:
  // 1. Loops through all markets loaded from the factory contract (realMarkets)
  // 2. For each market, gets the BOUND and BREAK token contract addresses
  // 3. Calls balanceOf() on each token contract to check YOUR wallet's balance
  // 4. If you have any tokens (balance > 0), creates a position entry
  // 5. Also fetches current prices to calculate your position value
  useEffect(() => {
    const fetchAllPositions = async () => {
      console.log(`[Positions] Starting fetch - address: ${address}, markets: ${realMarkets.length}, publicClient: ${!!publicClient}`);
      
      if (!address) {
        console.log("[Positions] No wallet connected");
        setAllPositions([]);
        return;
      }
      
      if (!publicClient) {
        console.log("[Positions] No publicClient available");
        setAllPositions([]);
        return;
      }
      
      if (realMarkets.length === 0) {
        console.log("[Positions] No markets loaded yet");
        setAllPositions([]);
        return;
      }

      const positions: Position[] = [];
      console.log(`[Positions] Checking ${realMarkets.length} markets for positions...`);

      for (const market of realMarkets) {
        try {
          // Use token addresses from market data
          const boundToken = market.boundToken;
          const breakToken = market.breakToken;

          if (!boundToken || !breakToken) {
            console.log(`[Positions] Market ${market.address} missing token addresses`);
            continue;
          }

          console.log(`[Positions] Checking market ${market.symbol} (${market.address})`);
          console.log(`  - BOUND token: ${boundToken}`);
          console.log(`  - BREAK token: ${breakToken}`);

          // Get balances - this is the key part!
          // We call balanceOf(yourAddress) on each token contract
          const [boundBalance, breakBalance, boundPrice, breakPrice] = await Promise.all([
            publicClient.readContract({
              address: boundToken as `0x${string}`,
              abi: TOKEN_ABI,
              functionName: "balanceOf",
              args: [address],
            }).catch((err) => {
              console.error(`[Positions] Error reading BOUND balance for ${market.symbol}:`, err);
              return BigInt(0);
            }),
            publicClient.readContract({
              address: breakToken as `0x${string}`,
              abi: TOKEN_ABI,
              functionName: "balanceOf",
              args: [address],
            }).catch((err) => {
              console.error(`[Positions] Error reading BREAK balance for ${market.symbol}:`, err);
              return BigInt(0);
            }),
            publicClient.readContract({
              address: market.address as `0x${string}`,
              abi: MARKET_ABI,
              functionName: "getBoundPrice",
            }).catch(() => BigInt(0)),
            publicClient.readContract({
              address: market.address as `0x${string}`,
              abi: MARKET_ABI,
              functionName: "getBreakPrice",
            }).catch(() => BigInt(0)),
          ]);

          const boundBal = boundBalance as bigint;
          const breakBal = breakBalance as bigint;
          
          console.log(`[Positions] ${market.symbol} balances:`, {
            bound: formatUnits(boundBal, 6),
            break: formatUnits(breakBal, 6),
          });

          // Add BOUND position if balance > 0
          if (boundBal > BigInt(0)) {
            const balance = Number(formatUnits(boundBal, 6));
            const price = boundPrice ? Number(boundPrice as bigint) / 1e18 : 0.5;
            console.log(`[Positions] ✅ Found BOUND position: ${balance} tokens @ ${price} USDC`);
            positions.push({
              id: `${market.address}-bound`,
              assetId: market.symbol.toLowerCase(),
              side: "BOUND",
              size: balance,
              avgPrice: price,
              status: market.config.settled ? "SETTLED" : "OPEN",
            });
          }

          // Add BREAK position if balance > 0
          if (breakBal > BigInt(0)) {
            const balance = Number(formatUnits(breakBal, 6));
            const price = breakPrice ? Number(breakPrice as bigint) / 1e18 : 0.5;
            console.log(`[Positions] ✅ Found BREAK position: ${balance} tokens @ ${price} USDC`);
            positions.push({
              id: `${market.address}-break`,
              assetId: market.symbol.toLowerCase(),
              side: "BREAK",
              size: balance,
              avgPrice: price,
              status: market.config.settled ? "SETTLED" : "OPEN",
            });
          }
        } catch (err) {
          console.error(`[Positions] Error fetching position for ${market.address}:`, err);
        }
      }

      setAllPositions(positions);
      console.log(`[Positions] ✅ Total positions loaded: ${positions.length}`, positions);
    };

    fetchAllPositions();
    const interval = setInterval(fetchAllPositions, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [address, publicClient, realMarkets]);

  // Fetch recent trade events for market activity (parimutuel + order book)
  useEffect(() => {
    const fetchRecentTrades = async () => {
      if (!publicClient || !selectedMarketAddress) {
        setRecentTrades([]);
        return;
      }

      const marketMeta = realMarkets.find(m => m.address === selectedMarketAddress);
      if (!marketMeta) {
        setRecentTrades([]);
        return;
      }

      try {
        // Get events from the last 1000 blocks (or last hour)
        const currentBlock = await publicClient.getBlockNumber();
        const fromBlock = currentBlock - BigInt(1000);
        const toBlock = currentBlock;

        const boundPurchasedEvent = MARKET_ABI.find(
          item => item.type === "event" && item.name === "BoundPurchased",
        );
        const breakPurchasedEvent = MARKET_ABI.find(
          item => item.type === "event" && item.name === "BreakPurchased",
        );
        const orderMatchedEvent = ORDERBOOK_ABI.find(
          item => item.type === "event" && item.name === "OrderMatched",
        );

        const [boundEvents, breakEvents, matchedEvents] = await Promise.all([
          boundPurchasedEvent
            ? publicClient
                .getLogs({
                  address: selectedMarketAddress as `0x${string}`,
                  event: boundPurchasedEvent as any,
                  fromBlock,
                  toBlock,
                })
                .catch(() => [])
            : [],
          breakPurchasedEvent
            ? publicClient
                .getLogs({
                  address: selectedMarketAddress as `0x${string}`,
                  event: breakPurchasedEvent as any,
                  fromBlock,
                  toBlock,
                })
                .catch(() => [])
            : [],
          orderMatchedEvent
            ? publicClient
                .getLogs({
                  address: CONTRACTS.somniaTestnet.ORDERBOOK as `0x${string}`,
                  event: orderMatchedEvent as any,
                  args: {
                    market: selectedMarketAddress as `0x${string}`,
                  },
                  fromBlock,
                  toBlock,
                })
                .catch(() => [])
            : [],
        ]);

        const trades: Array<{
          kind: "PARI" | "LIMIT";
          side: "BOUND" | "BREAK";
          amountUsdc: string;
          tokens: string;
          price: string;
          timestamp: number;
        }> = [];

        // Parimutuel buys (BoundPurchased / BreakPurchased)
        for (const log of [...boundEvents, ...breakEvents]) {
          try {
            const decoded = decodeEventLog({
              abi: MARKET_ABI,
              data: log.data,
              topics: log.topics,
            });

            if (decoded.eventName === "BoundPurchased" || decoded.eventName === "BreakPurchased") {
              const args = decoded.args as any;
              const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
              trades.push({
                kind: "PARI",
                side: decoded.eventName === "BoundPurchased" ? "BOUND" : "BREAK",
                // amount is USDC paid into the pool (6 decimals)
                amountUsdc: formatUnits(args.amount || BigInt(0), 6),
                // tokens received (BOUND/BREAK)
                tokens: formatUnits(args.tokens || BigInt(0), 6),
                // price per token, 18 decimals -> plain
                price: formatUnits(args.price || BigInt(0), 18),
                timestamp: Number(block.timestamp),
              });
            }
          } catch (err) {
            console.error("Error decoding parimutuel event:", err);
          }
        }

        // Order book matches (OrderMatched)
        for (const log of matchedEvents) {
          try {
            const decoded = decodeEventLog({
              abi: ORDERBOOK_ABI,
              data: log.data,
              topics: log.topics,
            });
            if (decoded.eventName !== "OrderMatched") continue;

            const args = decoded.args as any;
            const block = await publicClient.getBlock({ blockNumber: log.blockNumber });

            const tokenAddress = (args.token as string).toLowerCase();
            const side: "BOUND" | "BREAK" =
              tokenAddress === marketMeta.boundToken.toLowerCase() ? "BOUND" : "BREAK";

            const amountTokens = (args.amount || BigInt(0)) as bigint;
            const priceRaw = (args.price || BigInt(0)) as bigint;

            // Compute notional in USDC: amountTokens (1e6) * price (1e18) / 1e18 -> 1e6
            const notionalRaw =
              priceRaw === BigInt(0) ? BigInt(0) : (amountTokens * priceRaw) / BigInt(10) ** BigInt(18);

            trades.push({
              kind: "LIMIT",
              side,
              amountUsdc: formatUnits(notionalRaw, 6),
              tokens: formatUnits(amountTokens, 6),
              price: formatUnits(priceRaw, 18),
              timestamp: Number(block.timestamp),
            });
          } catch (err) {
            console.error("Error decoding orderbook event:", err);
          }
        }

        // Sort by timestamp (newest first) and take last 20
        trades.sort((a, b) => b.timestamp - a.timestamp);
        setRecentTrades(trades.slice(0, 20));
      } catch (err) {
        console.error("Error fetching recent trades:", err);
      }
    };

    fetchRecentTrades();
    const interval = setInterval(fetchRecentTrades, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [publicClient, selectedMarketAddress, realMarkets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMarket || !address) {
      console.error("Missing selectedMarket or address");
      return;
    }

    // Check if market exists
    if (!selectedMarketAddress) {
      alert("No market available for this token yet. Please wait for a market to be created.");
      return;
    }

    const parsedAmount = Number(size);
    if (!parsedAmount || parsedAmount <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    const realMarket = realMarkets.find(m => m.address === selectedMarketAddress);
    if (!realMarket) {
      alert("Market data not loaded. Please try again.");
      return;
    }

    try {
      // Track order type, amount, and side for success message
      setLastSuccessOrderType(orderType);
      setLastSuccessAmount(size);
      setLastSuccessSide(side);
      
      if (orderType === "MARKET") {
        // Direct buy from market contract - amount is in USDC
        const amount = parseUnits(parsedAmount.toFixed(6), 6);
        
        console.log("Calling buyTokens:", {
          address: selectedMarketAddress,
          functionName: side === "BOUND" ? "buyBound" : "buyBreak",
          amount: amount.toString(),
          buyTokens: typeof buyTokens,
        });
        
        if (!buyTokens) {
          alert("Wallet not connected or write function not available");
          return;
        }

        if (!isConnected) {
          alert("Please connect your wallet first");
          return;
        }

        if (chainId !== SOMNIA_TESTNET_CHAIN_ID) {
          alert(`Please switch to Somnia Testnet (Chain ID: ${SOMNIA_TESTNET_CHAIN_ID}). Current chain: ${chainId}`);
          return;
        }
        
        console.log("About to call buyTokens:", {
          walletConnected: isConnected,
          chainId,
          expectedChainId: SOMNIA_TESTNET_CHAIN_ID,
          address,
        });
        
        try {
          console.log("Calling buyTokens with params:", {
            address: selectedMarketAddress,
            abiLength: MARKET_ABI.length,
            functionName: side === "BOUND" ? "buyBound" : "buyBreak",
            args: [amount.toString()],
          });

          // writeContract should automatically prompt wallet
          buyTokens({
            address: selectedMarketAddress as `0x${string}`,
            abi: MARKET_ABI,
            functionName: side === "BOUND" ? "buyBound" : "buyBreak",
            args: [amount],
          });
          
          console.log("buyTokens called - wallet should prompt now");
          
          // Errors will be caught by the buyError state from useWriteContract hook
        } catch (writeError: any) {
          console.error("Write contract sync error:", writeError);
          const errorMsg = writeError?.message || writeError?.shortMessage || writeError?.cause?.message || "Unknown error";
          alert(`Failed to initiate transaction: ${errorMsg}`);
        }
      } else {
        // Limit order via orderbook
        const limitPrice = parseUnits(Number(price).toFixed(6), 6);
        const tokenAddress = side === "BOUND" ? realMarket.boundToken : realMarket.breakToken;
        
        // Check balances before placing order
        if (limitOrderSide === "buy") {
          // Buying tokens - amount is in USDC, convert to token amount
          const parsedAmountUsdc = parsedAmount;
          const tokenAmount = parseUnits((parsedAmountUsdc / Number(price)).toFixed(6), 6);
          
          const usdcBalance = usdcBalanceRaw ? BigInt(usdcBalanceRaw.toString()) : BigInt(0);
          const requiredUsdc = parseUnits(parsedAmountUsdc.toFixed(6), 6);
          if (usdcBalance < requiredUsdc) {
            alert(`Insufficient USDC balance. You need ${parsedAmountUsdc.toFixed(2)} USDC but have ${formatUnits(usdcBalance, 6)} USDC.`);
            return;
          }
          
          await placeOrder({
            address: CONTRACTS.somniaTestnet.ORDERBOOK as `0x${string}`,
            abi: ORDERBOOK_ABI,
            functionName: "placeBuyOrder",
            args: [selectedMarketAddress as `0x${string}`, tokenAddress as `0x${string}`, limitPrice, tokenAmount],
          });
        } else {
          // Selling tokens - amount is in shares (tokens)
          const tokenAmount = parseUnits(parsedAmount.toFixed(6), 6);
          const tokenBalance = side === "BOUND" 
            ? (boundTokenBalance ? BigInt(boundTokenBalance.toString()) : BigInt(0))
            : (breakTokenBalance ? BigInt(breakTokenBalance.toString()) : BigInt(0));
          
          if (tokenBalance < tokenAmount) {
            const tokenName = side === "BOUND" ? "BOUND" : "BREAK";
            alert(`Insufficient ${tokenName} balance. You need ${parsedAmount.toFixed(2)} ${tokenName} but have ${formatUnits(tokenBalance, 6)} ${tokenName}.`);
            return;
          }
          
          await placeOrder({
            address: CONTRACTS.somniaTestnet.ORDERBOOK as `0x${string}`,
            abi: ORDERBOOK_ABI,
            functionName: "placeSellOrder",
            args: [selectedMarketAddress as `0x${string}`, tokenAddress as `0x${string}`, limitPrice, tokenAmount],
          });
        }
      }
    } catch (error: any) {
      console.error("Transaction error:", error);
      const errorMessage = error?.message || error?.shortMessage || "Transaction failed";
      alert(`Transaction failed: ${errorMessage}. Please check console for details.`);
    }
  };

  // Filter positions for selected market
  // NOTE: This only shows positions for the currently selected market
  // allPositions contains positions from ALL markets, but we filter to show only the selected one
  const filteredPositions: Position[] = useMemo(() => {
    if (!selectedMarketAddress) {
      console.log("[Positions] No market selected, showing no positions");
      return [];
    }
    const filtered = allPositions.filter(pos => pos.id.startsWith(selectedMarketAddress));
    console.log(`[Positions] Filtered ${filtered.length} positions for market ${selectedMarketAddress} (out of ${allPositions.length} total)`);
    return filtered;
  }, [allPositions, selectedMarketAddress]);

  if (marketsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-950 via-black to-zinc-950 text-zinc-50 relative overflow-hidden">
        {/* Animated background gradient */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_circle_at_50%_50%,rgba(34,211,238,0.15),transparent_70%),radial-gradient(800px_circle_at_20%_80%,rgba(16,185,129,0.12),transparent_60%)] animate-pulse" />
        
        <div className="relative z-10 flex items-center justify-center">
          <img 
            src="/logo.png" 
            alt="BrimDex Logo" 
            className="h-32 w-auto sm:h-40 sm:w-auto md:h-48 md:w-auto object-contain contrast-pulse"
          />
        </div>
      </div>
    );
  }

  if (!selectedMarket) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-950 via-black to-zinc-900 text-zinc-50">
        <div className="text-sm text-zinc-400">No markets available</div>
      </div>
    );
  }

  const handleConnectClick = () => {
    if (!termsAccepted) {
      setWalletModalOpen(true);
    } else {
      // Use ref first, fallback to state
      const showFn = connectKitShowRef.current || connectKitShow;
      if (showFn) {
        showFn();
      }
    }
  };

  const handleAcceptTerms = async () => {
    setTermsAccepted(true);
    setWalletModalOpen(false);
    // Use ref first, fallback to state
    const showFn = connectKitShowRef.current || connectKitShow;
    if (showFn) {
      showFn();
    }
  };

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-zinc-950 via-black to-zinc-950 text-zinc-50">
      {/* Subtle cyan aura (kept dark) */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(1200px_circle_at_20%_10%,rgba(34,211,238,0.10),transparent_60%),radial-gradient(900px_circle_at_80%_30%,rgba(56,189,248,0.08),transparent_55%),radial-gradient(800px_circle_at_50%_100%,rgba(34,211,238,0.06),transparent_60%)]" />
      {/* Top Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-3 py-2 sm:px-4 sm:py-3 md:px-8 md:py-4">
          {/* Mobile Layout */}
          <div className="md:hidden">
            {/* Top row: Logo and Right buttons */}
            <div className="flex items-center justify-between w-full">
              <Link href="/" className="flex items-center gap-0.5 hover:opacity-80 transition-opacity cursor-pointer">
                <img 
                  src="/logo.png" 
                  alt="BrimDex Logo" 
                  className="h-14 w-9 sm:h-16 sm:w-11 object-contain"
                />
                <h1 className="bg-gradient-to-r from-cyan-400 via-sky-300 to-cyan-500 bg-clip-text text-base sm:text-lg font-bold tracking-tight text-transparent" style={{ fontFamily: 'var(--font-geist-sans), sans-serif' }}>
                  Brimdex
                </h1>
              </Link>
              {/* Right: Connect and Hamburger */}
              <div className="flex items-center gap-2">
                <ConnectKitButton.Custom>
                  {({ isConnected: ckConnected, show, hide, address: ckAddress, ensName, chain }) => {
                    if (show) {
                      connectKitShowRef.current = show;
                    }
                    
                    const connected = isConnected || ckConnected;
                    const walletAddress = address || ckAddress;
                    
                    if (connected && walletAddress) {
                      return (
                        <button
                          onClick={show}
                          className="group flex items-center overflow-hidden rounded-lg border border-cyan-500/30 bg-zinc-900/80 shadow-lg shadow-cyan-500/10 transition-all hover:border-cyan-500/50 hover:bg-zinc-900"
                        >
                          <div className="px-2 py-1.5 text-xs font-medium text-zinc-200">
                            {formatAddress(walletAddress)}
                          </div>
                        </button>
                      );
                    }
                    
                    return (
                      <button
                        onClick={handleConnectClick}
                        className="group relative flex items-center gap-1.5 overflow-hidden rounded-lg border border-cyan-500/30 bg-gradient-to-r from-cyan-600/90 to-sky-500/90 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all hover:from-cyan-500 hover:to-sky-400 hover:shadow-cyan-500/40"
                      >
                        <span className="relative z-10 flex items-center gap-1.5">
                          <svg
                            className="h-3.5 w-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <rect
                              x="3"
                              y="6"
                              width="18"
                              height="12"
                              rx="3"
                              stroke="currentColor"
                              strokeWidth="1.6"
                            />
                            <circle cx="16" cy="12" r="1.4" fill="currentColor" />
                          </svg>
                          <span>Connect</span>
                        </span>
                        <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                      </button>
                    );
                  }}
                </ConnectKitButton.Custom>
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="p-2 text-zinc-400 transition-colors hover:text-cyan-400"
                  aria-label="Toggle menu"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {mobileMenuOpen ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    )}
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Mobile Menu */}
            {mobileMenuOpen && (
              <div className="mt-3 border-t border-zinc-800 pt-3">
                <nav className="flex flex-col gap-3">
                  <a 
                    href="#markets" 
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-sm font-medium text-zinc-400 transition-colors hover:text-cyan-400 py-1"
                  >
                    Markets
                  </a>
                  <a 
                    href="#pools" 
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-sm font-medium text-zinc-400 transition-colors hover:text-cyan-400 py-1"
                  >
                    Pools
                  </a>
                  <Link 
                    href="/positions" 
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-sm font-medium text-zinc-400 transition-colors hover:text-cyan-400 py-1"
                  >
                    Positions
                  </Link>
                  <Link 
                    href="/how-it-works" 
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-sm font-medium text-zinc-400 transition-colors hover:text-cyan-400 py-1"
                  >
                    How It Works
                  </Link>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                    }}
                    className="text-left text-sm font-medium text-zinc-400 transition-colors hover:text-cyan-400 py-1"
                  >
                    Settings
                  </button>
                </nav>
              </div>
            )}
          </div>
          
          {/* Desktop Layout */}
          <div className="hidden md:flex items-center justify-between gap-4">
            {/* Left: Logo and Navigation */}
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center gap-0 hover:opacity-80 transition-opacity cursor-pointer">
                <img 
                  src="/logo.png" 
                  alt="BrimDex Logo" 
                  className="h-12 w-8 md:h-14 md:w-10 object-contain"
                />
                <h1 className="bg-gradient-to-r from-cyan-400 via-sky-300 to-cyan-500 bg-clip-text text-xl font-bold tracking-tight text-transparent md:text-2xl" style={{ fontFamily: 'var(--font-geist-sans), sans-serif' }}>
                  Brimdex
                </h1>
              </Link>
              <nav className="flex items-center gap-8">
                <a href="#markets" className="text-base font-medium text-zinc-400 transition-colors hover:text-cyan-400 relative group">
                  Markets
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-cyan-400 transition-all group-hover:w-full"></span>
                </a>
                <a href="#pools" className="text-base font-medium text-zinc-400 transition-colors hover:text-cyan-400 relative group">
                  Pools
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-cyan-400 transition-all group-hover:w-full"></span>
                </a>
                <Link href="/positions" className="text-base font-medium text-zinc-400 transition-colors hover:text-cyan-400 relative group">
                  Positions
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-cyan-400 transition-all group-hover:w-full"></span>
                </Link>
                <Link href="/how-it-works" className="text-base font-medium text-zinc-400 transition-colors hover:text-cyan-400 relative group">
                  How It Works
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-cyan-400 transition-all group-hover:w-full"></span>
                </Link>
              </nav>
            </div>
            
            {/* Right: Settings and Connect */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => {}}
                className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200 flex-shrink-0"
                title="Settings"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ minWidth: '20px', minHeight: '20px' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              <ConnectKitButton.Custom>
                {({ isConnected: ckConnected, show, hide, address: ckAddress, ensName, chain }) => {
                // Store show function in ref (refs can be set during render, this is safe)
                if (show) {
                  connectKitShowRef.current = show;
                }
                
                const connected = isConnected || ckConnected;
                const walletAddress = address || ckAddress;
                const chainName = chain?.name || "Somnia Testnet";
                
                if (connected && walletAddress) {
                  return (
                    <button
                      onClick={show}
                      className="group flex items-center overflow-hidden rounded-lg sm:rounded-xl border border-cyan-500/30 bg-zinc-900/80 shadow-lg shadow-cyan-500/10 transition-all hover:border-cyan-500/50 hover:bg-zinc-900"
                    >
                      {/* Chain name with gradient - hidden on mobile */}
                      <div className="hidden sm:block bg-gradient-to-r from-cyan-500 via-sky-400 to-cyan-400 bg-clip-text px-2 sm:px-4 py-1.5 sm:py-2.5 text-xs sm:text-sm font-semibold text-transparent">
                        {chainName}
                      </div>
                      {/* Divider - hidden on mobile */}
                      <div className="hidden sm:block h-6 w-px bg-zinc-700" />
                      {/* Address */}
                      <div className="px-2 sm:px-4 py-1.5 sm:py-2.5 text-xs sm:text-sm font-medium text-zinc-200">
                        {formatAddress(walletAddress)}
                      </div>
                    </button>
                  );
                }
                
                return (
                  <button
                    onClick={handleConnectClick}
                    className="group relative flex items-center gap-1.5 sm:gap-2 overflow-hidden rounded-lg sm:rounded-xl border border-cyan-500/30 bg-gradient-to-r from-cyan-600/90 to-sky-500/90 px-3 sm:px-6 py-1.5 sm:py-2.5 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all hover:from-cyan-500 hover:to-sky-400 hover:shadow-cyan-500/40"
                  >
                    <span className="relative z-10 flex items-center gap-1.5 sm:gap-2">
                      <svg
                        className="h-3.5 w-3.5 sm:h-4 sm:w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <rect
                          x="3"
                          y="6"
                          width="18"
                          height="12"
                          rx="3"
                          stroke="currentColor"
                          strokeWidth="1.6"
                        />
                        <circle cx="16" cy="12" r="1.4" fill="currentColor" />
                      </svg>
                      <span className="hidden sm:inline">Connect Wallet</span>
                      <span className="sm:hidden">Connect</span>
                    </span>
                    <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                  </button>
                );
                }}
              </ConnectKitButton.Custom>
            </div>
          </div>
        </div>
      </header>

      {/* Wallet Connection Modal with Terms */}
      {walletModalOpen && (
        <>
          <div
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            onClick={() => setWalletModalOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 z-[100] w-full max-w-md bg-zinc-950 shadow-2xl sm:max-w-lg">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-zinc-800 p-6">
                <h2 className="text-xl font-semibold text-zinc-100">Connect Your Wallet</h2>
                <button
                  onClick={() => setWalletModalOpen(false)}
                  className="rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div 
                className="flex-1 overflow-y-auto p-6 scrollbar-hide"
                style={{
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                }}
              >
                <div className="space-y-6">
                  <div>
                    <h3 className="mb-3 text-lg font-semibold text-zinc-100">Welcome to BrimDex</h3>
                    <p className="text-sm leading-relaxed text-zinc-400">
                      BrimDex is a decentralized parimutuel betting platform on Somnia that enables you to bet on range-bound cryptocurrency price movements. Choose Bound or Break positions and compete in a shared pool where winners split the total prize pool.
                    </p>
                  </div>

                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-zinc-200">How It Works</h4>
                    <ul className="space-y-2 text-sm text-zinc-400">
                      <li className="flex items-start gap-2">
                        <span className="mt-0.5 text-emerald-400">•</span>
                        <span>Select a market (ETH, BTC, SOL) and choose Bound or Break position type</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-0.5 text-emerald-400">•</span>
                        <span>Buy BOUND or BREAK tokens with USDC - your tokens represent your share of the parimutuel pool</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-0.5 text-emerald-400">•</span>
                        <span>At market expiry, if your side wins, you receive a proportional share of the total pool (after 2% fee) based on your token holdings</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-0.5 text-emerald-400">•</span>
                        <span>If your side loses, your tokens become worthless - this is parimutuel betting where all participants compete for the same pool</span>
                      </li>
                    </ul>
                  </div>

                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                    <h4 className="mb-3 text-sm font-semibold text-zinc-200">Terms & Conditions</h4>
                    <div className="space-y-3 text-xs text-zinc-400">
                      <p>
                        By connecting your wallet, you acknowledge that trading derivatives on BrimDex involves substantial risk of loss. You understand that cryptocurrency markets are volatile and that you may lose your entire investment.
                      </p>
                      <p>
                        You are solely responsible for the security of your wallet, private keys, and account credentials. BrimDex is not liable for any loss of funds resulting from unauthorized access, user error, or technical failures.
                      </p>
                      <p>
                        All position entries are final and cannot be reversed. Settlement occurs automatically at market expiry based on oracle-determined final prices. In parimutuel betting, your payout depends on the total pool size and your proportional share of winning tokens. You agree to accept the settlement results as final and binding.
                      </p>
                    </div>
                  </div>

                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-4 transition hover:bg-zinc-900/50">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-cyan-500 focus:ring-2 focus:ring-cyan-500/50"
                    />
                    <span className="text-sm text-zinc-300">
                      I have read and agree to the Terms & Conditions
                    </span>
                  </label>
                </div>
              </div>

              <div className="border-t border-zinc-800 p-6">
                <button
                  onClick={handleAcceptTerms}
                  disabled={!termsAccepted}
                  className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-sky-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:from-cyan-500 disabled:hover:to-sky-500 hover:from-cyan-600 hover:to-sky-600 hover:shadow-cyan-500/30"
                >
                  Accept & Connect Wallet
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <main className="mx-auto flex max-w-[95%] flex-col gap-4 sm:gap-6 px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-10">
        <div className="flex flex-col gap-3 sm:gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm">
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-2.5 text-sm font-medium text-zinc-100 shadow-lg shadow-black/20 transition-all hover:bg-zinc-900 hover:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              >
                {selectedMarket.image && (
                  <img
                    src={selectedMarket.image}
                    alt={selectedMarket.name}
                    className="h-6 w-6 rounded-full"
                  />
                )}
                <span className="font-semibold">{selectedMarket.symbol}</span>
                <span className="text-zinc-400">-</span>
                <span className="text-zinc-300">{selectedMarket.name}</span>
                {selectedMarket.priceChange24h !== undefined && (
                  <span className={`ml-2 text-xs font-medium px-1.5 py-0.5 rounded ${
                    selectedMarket.priceChange24h >= 0 ? "text-emerald-400 bg-emerald-400/10" : "text-rose-400 bg-rose-400/10"
                  }`}>
                    {selectedMarket.priceChange24h >= 0 ? "+" : ""}
                    {selectedMarket.priceChange24h.toFixed(2)}%
                  </span>
                )}
                <svg
                  className={`ml-1 h-4 w-4 text-zinc-400 transition-transform ${
                    dropdownOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              
              {dropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setDropdownOpen(false)}
                  />
                  <div className="absolute left-0 top-full z-20 mt-2 w-56 sm:w-64 rounded-lg sm:rounded-xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-sm shadow-2xl shadow-black/50">
                    <div 
                      className="max-h-64 overflow-y-auto p-2 scrollbar-hide"
                      style={{
                        scrollbarWidth: 'none',
                        msOverflowStyle: 'none',
                      }}
                    >
                      {markets.map((market) => {
                        // Check if active market exists - match by symbol+timeframe+band and not settled
                        const hasMarket = realMarkets.some(rm => {
                          const matchesSymbol = rm.symbol === market.symbol;
                          const matchesTimeframe = market.timeframe && rm.boundTokenName?.includes(market.timeframe);
                          // Calculate rangePercent from bounds to match band
                          const startPrice = Number(rm.config.startPrice) / 1e6;
                          const lowerBound = Number(rm.config.lowerBound) / 1e6;
                          const upperBound = Number(rm.config.upperBound) / 1e6;
                          const marketRangePercent = startPrice > 0 
                            ? ((upperBound - lowerBound) / 2 / startPrice) * 100 
                            : 0;
                          const matchesBand = Math.abs(marketRangePercent - selectedBand) < 0.1;
                          const isActive = !rm.config.settled;
                          return matchesSymbol && matchesTimeframe && matchesBand && isActive;
                        });
                        return (
                          <button
                            key={market.id}
                            type="button"
                            onClick={() => {
                              setSelectedMarket(market);
                              // Find active market by symbol+timeframe+band (not settled)
                              const realMarket = realMarkets.find(rm => {
                                const matchesSymbol = rm.symbol === market.symbol;
                                const matchesTimeframe = market.timeframe && rm.boundTokenName?.includes(market.timeframe);
                                // Calculate rangePercent from bounds to match band
                                const startPrice = Number(rm.config.startPrice) / 1e6;
                                const lowerBound = Number(rm.config.lowerBound) / 1e6;
                                const upperBound = Number(rm.config.upperBound) / 1e6;
                                const marketRangePercent = startPrice > 0 
                                  ? ((upperBound - lowerBound) / 2 / startPrice) * 100 
                                  : 0;
                                const matchesBand = Math.abs(marketRangePercent - selectedBand) < 0.1;
                                const isActive = !rm.config.settled;
                                return matchesSymbol && matchesTimeframe && matchesBand && isActive;
                              });
                              setSelectedMarketAddress(realMarket?.address || null);
                              setDropdownOpen(false);
                            }}
                            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                              selectedMarket.id === market.id
                                ? "bg-cyan-900/30 text-cyan-100"
                                : "text-zinc-200 hover:bg-zinc-900/80"
                            }`}
                          >
                            <img
                              src={market.image}
                              alt={market.name}
                              className="h-6 w-6 rounded-full"
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{market.symbol}</span>
                                {!hasMarket && (
                                  <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                                    No market
                                  </span>
                                )}
                                {selectedMarket.id === market.id && (
                                  <svg
                                    className="h-4 w-4 text-cyan-400"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-zinc-400">
                                <span>{market.name}</span>
                                {market.priceChange24h !== undefined && (
                                  <span className={`font-medium ${
                                    market.priceChange24h >= 0 ? "text-emerald-400" : "text-rose-400"
                                  }`}>
                                    {market.priceChange24h >= 0 ? "+" : ""}
                                    {market.priceChange24h.toFixed(1)}%
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
            
            {/* Duration Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setDurationDropdownOpen(!durationDropdownOpen)}
                className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-2.5 text-sm font-medium text-zinc-100 shadow-lg shadow-black/20 transition-all hover:bg-zinc-900 hover:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              >
                <span>{selectedDuration}</span>
                <svg
                  className={`h-4 w-4 text-zinc-400 transition-transform ${
                    durationDropdownOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              
              {durationDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setDurationDropdownOpen(false)}
                  />
                  <div className="absolute left-0 top-full z-20 mt-2 w-28 sm:w-32 rounded-lg sm:rounded-xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-sm shadow-2xl shadow-black/50">
                    <div className="p-1.5 sm:p-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDuration("24h");
                          setDurationDropdownOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-md sm:rounded-lg px-2 sm:px-3 py-1.5 sm:py-2.5 text-left text-xs sm:text-sm transition ${
                          selectedDuration === "24h"
                            ? "bg-cyan-900/30 text-cyan-100"
                            : "text-zinc-200 hover:bg-zinc-900/80"
                        }`}
                      >
                        <span>24h</span>
                        {selectedDuration === "24h" && (
                          <svg
                            className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-cyan-400"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {}}
                        disabled
                        className="flex w-full items-center justify-between rounded-md sm:rounded-lg px-2 sm:px-3 py-1.5 sm:py-2.5 text-left text-xs sm:text-sm text-zinc-300 cursor-not-allowed opacity-75"
                      >
                        <span>7d</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {}}
                        disabled
                        className="flex w-full items-center justify-between rounded-md sm:rounded-lg px-2 sm:px-3 py-1.5 sm:py-2.5 text-left text-xs sm:text-sm text-zinc-300 cursor-not-allowed opacity-75"
                      >
                        <span>30d</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
            
            <div className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2 sm:px-3 py-0.5 sm:py-1 text-xs sm:text-sm">
              <span className="text-zinc-400">Pair</span>{" "}
              <span className="font-medium text-zinc-100">
                {selectedMarket.symbol}/USD
              </span>
            </div>
            {selectedMarket.volume24h && (
              <div className="hidden sm:flex rounded-full border border-zinc-800 bg-zinc-900/60 px-2 sm:px-3 py-0.5 sm:py-1 text-xs sm:text-sm">
                <span className="text-zinc-400">24h Vol</span>{" "}
                <span className="font-medium text-zinc-100">
                  ${(selectedMarket.volume24h / 1e9).toFixed(2)}B
                </span>
              </div>
            )}
            {/* Band Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setBandDropdownOpen(!bandDropdownOpen)}
                className="flex items-center gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl border border-cyan-700/80 bg-cyan-900/30 px-2.5 sm:px-4 py-1.5 sm:py-2.5 text-xs sm:text-sm font-medium text-cyan-100 shadow-lg shadow-black/20 transition-all hover:bg-cyan-900/45 hover:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              >
                <span className="text-cyan-200">Band:</span>
                <span className="font-semibold">±{selectedBand}%</span>
                <svg
                  className={`h-4 w-4 text-cyan-300 transition-transform ${
                    bandDropdownOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              
              {bandDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setBandDropdownOpen(false)}
                  />
                  <div className="absolute left-0 top-full z-20 mt-2 w-28 sm:w-32 rounded-lg sm:rounded-xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-sm shadow-2xl shadow-black/50">
                    <div className="p-1.5 sm:p-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBand(1.5);
                          setBandDropdownOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-md sm:rounded-lg px-2 sm:px-3 py-1.5 sm:py-2.5 text-left text-xs sm:text-sm transition-colors ${
                          selectedBand === 1.5
                            ? "bg-zinc-800 text-white"
                            : "text-zinc-300 hover:bg-zinc-800/50"
                        }`}
                      >
                        <span>1.5%</span>
                        {selectedBand === 1.5 && (
                          <span className="text-zinc-400">✓</span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBand(3);
                          setBandDropdownOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-md sm:rounded-lg px-2 sm:px-3 py-1.5 sm:py-2.5 text-left text-xs sm:text-sm transition ${
                          selectedBand === 3
                            ? "bg-cyan-900/30 text-cyan-100"
                            : "text-zinc-200 hover:bg-zinc-900/80"
                        }`}
                      >
                        <span>3%</span>
                        {selectedBand === 3 && (
                          <svg
                            className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-cyan-400"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {}}
                        disabled
                        className="flex w-full items-center justify-between rounded-md sm:rounded-lg px-2 sm:px-3 py-1.5 sm:py-2.5 text-left text-xs sm:text-sm text-zinc-300 cursor-not-allowed opacity-75"
                      >
                        <span>5%</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2 sm:px-3 py-0.5 sm:py-1 text-xs sm:text-sm">
              <span className="text-zinc-400">Expires in</span>{" "}
              <span className="font-mono text-zinc-100">
                {(() => {
                  if (!selectedMarket?.expiryTimestamp) return "—";
                  const expiry = selectedMarket.expiryTimestamp;
                  const remaining = expiry - currentTime;
                  
                  if (remaining <= 0) return "Expired";
                  
                  const hours = Math.floor(remaining / 3600);
                  const minutes = Math.floor((remaining % 3600) / 60);
                  const seconds = remaining % 60;
                  
                  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
                })()}
              </span>
            </div>
          </div>
        </div>

        <section className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {/* Left: Chart + order book + positions */}
          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="rounded-xl sm:rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3 sm:p-4 shadow-lg shadow-black/40">
              <div className="mb-2 sm:mb-3 flex flex-col gap-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h2 className="text-xs sm:text-sm font-semibold text-zinc-100">
                      {selectedMarket.name} Price – {selectedMarket.symbol}/USD
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 sm:gap-3 text-[10px] sm:text-xs">
                      {selectedMarket.marketCap && (
                        <span className="text-zinc-400">
                          Market Cap: <span className="font-medium text-zinc-200">${(selectedMarket.marketCap / 1e9).toFixed(2)}B</span>
                        </span>
                      )}
                      {selectedMarket.volume24h && (
                        <span className="text-zinc-400">
                          Volume 24h: <span className="font-medium text-zinc-200">${(selectedMarket.volume24h / 1e9).toFixed(2)}B</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 sm:gap-1">
                    <div className="rounded-full border border-zinc-800 bg-zinc-900/80 px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs">
                      <span className="text-zinc-400">Price</span>{" "}
                      <span className="font-mono text-zinc-100">
                        ${selectedMarket.startPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    {selectedMarket.priceChange24h !== undefined && (
                      <div className={`text-[10px] sm:text-xs font-medium ${
                        selectedMarket.priceChange24h >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}>
                        {selectedMarket.priceChange24h >= 0 ? "+" : ""}
                        {selectedMarket.priceChange24h.toFixed(2)}%
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-zinc-500">
                </p>
              </div>
              <div className="h-[300px] sm:h-[400px] md:h-[500px] w-full">
                {isClientMounted && selectedMarket && (
                  <TradingViewChart symbol={chartSymbol} />
                )}
              </div>
            </div>

            <div className="rounded-xl sm:rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3 sm:p-4 shadow-lg shadow-black/40">
              <div className="mb-2 sm:mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <h2 className="text-xs sm:text-sm font-semibold text-zinc-100">
                  Market Activity
                </h2>
                <span className="text-[10px] sm:text-xs text-zinc-500">Time / side / amount (USDC) / size</span>
              </div>
              <div className="max-h-40 space-y-0 overflow-y-auto pr-1 scrollbar-thin-dark">
                {recentTrades.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-zinc-500">
                    No recent trades. Trades will appear here after purchases.
                  </p>
                ) : (
                  recentTrades.map((trade, idx) => {
                    const amountUsdc = Number(trade.amountUsdc);
                    const size = Number(trade.tokens);
                    const price = Number(trade.price);
                    const timeLabel = new Date(trade.timestamp * 1000).toLocaleTimeString(undefined, {
                      hour12: false,
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    });
                    const isBound = trade.side === "BOUND";
                    const sideLabel = trade.kind === "PARI" ? `${trade.side} PARI` : `${trade.side} LIMIT`;
                    return (
                      <div
                        key={idx}
                        className={`flex items-center justify-between border-b px-3 py-2 text-[11px] transition-colors ${
                          isBound
                            ? "border-emerald-900/60 bg-emerald-950/30"
                            : "border-rose-900/60 bg-rose-950/30"
                        }`}
                      >
                        <div className="flex items-center gap-2 text-zinc-400">
                          {selectedMarket.image && (
                            <img
                              src={selectedMarket.image}
                              alt={selectedMarket.name}
                              className="h-4 w-4 rounded-full"
                            />
                          )}
                          <div className="flex flex-col">
                            <span className="font-mono text-[10px]">
                              {timeLabel}
                            </span>
                            <span className="text-[10px] text-zinc-500">
                              {sideLabel}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-1 items-center justify-end gap-3 pl-4 text-right">
                          <div className="text-[10px] text-zinc-400">
                            {amountUsdc.toFixed(2)} USDC
                          </div>
                          <div className="font-mono text-xs text-zinc-50">
                            {size.toFixed(2)}{" "}
                            <span className="text-[10px] text-zinc-500">
                              {trade.side}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-xl sm:rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3 sm:p-4 shadow-lg shadow-black/40">
              <div className="mb-2 sm:mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <h2 className="text-xs sm:text-sm font-semibold text-zinc-100">
                  My Positions
                </h2>
                <span className="text-[10px] sm:text-xs text-zinc-500">
                  {selectedMarket.symbol}/USD positions
                </span>
              </div>
              {filteredPositions.length === 0 ? (
                <p className="text-xs sm:text-sm text-zinc-500">
                  No open positions for {selectedMarket.symbol}/USD. Place an order to get started.
                </p>
              ) : (
                <div className="overflow-x-auto -mx-3 sm:mx-0">
                  <div className="inline-block min-w-full align-middle">
                    <div className="overflow-hidden rounded-lg sm:rounded-xl border border-zinc-800/80 bg-zinc-950/60">
                      <table className="min-w-full text-left text-[10px] sm:text-xs">
                        <thead className="bg-zinc-900/80 text-zinc-400">
                          <tr>
                            <th className="px-2 sm:px-3 py-1.5 sm:py-2 font-medium">Side</th>
                            <th className="px-2 sm:px-3 py-1.5 sm:py-2 font-medium">Size (u)</th>
                            <th className="px-2 sm:px-3 py-1.5 sm:py-2 font-medium">Avg Price</th>
                            <th className="px-2 sm:px-3 py-1.5 sm:py-2 font-medium">Notional</th>
                            <th className="px-2 sm:px-3 py-1.5 sm:py-2 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredPositions.map((pos) => {
                            const notional = pos.size * pos.avgPrice;
                            return (
                              <tr
                                key={pos.id}
                                className="border-t border-zinc-800/80 text-[10px] sm:text-xs text-zinc-200"
                              >
                                <td className="px-2 sm:px-3 py-1.5 sm:py-2">
                                  <span
                                    className={`rounded-full px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold ${
                                      pos.side === "BOUND"
                                        ? "bg-emerald-700/40 text-emerald-200"
                                        : "bg-rose-900/50 text-rose-200"
                                    }`}
                                  >
                                    {pos.side === "BOUND" ? "Bound" : "Break"}
                                  </span>
                                </td>
                                <td className="px-2 sm:px-3 py-1.5 sm:py-2 font-mono">
                                  {pos.size.toLocaleString()}
                                </td>
                                <td className="px-2 sm:px-3 py-1.5 sm:py-2 font-mono">
                                  {pos.avgPrice.toFixed(2)} USDC
                                </td>
                                <td className="px-2 sm:px-3 py-1.5 sm:py-2 font-mono">
                                  {notional.toFixed(2)} USDC
                                </td>
                                <td className="px-2 sm:px-3 py-1.5 sm:py-2">
                                  <span className="rounded-full bg-zinc-900 px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-[11px] text-zinc-300">
                                    {pos.status === "OPEN" ? "Open" : "Settled"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Order ticket + details */}
          <div className="flex flex-col gap-3 sm:gap-4">
          <div className="group rounded-xl sm:rounded-2xl border border-zinc-800 bg-zinc-950/80 p-3 sm:p-4 shadow-xl shadow-black/50 transition-all hover:border-cyan-500/30 hover:shadow-cyan-500/10">
            <h2 className="mb-3 text-sm font-semibold text-zinc-100">
              Place Order
            </h2>
            <div className="mb-3 sm:mb-4 grid grid-cols-2 gap-1 rounded-lg sm:rounded-xl bg-zinc-900/60 p-1 text-xs">
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 font-medium transition-all ${
                  side === "BOUND"
                    ? "bg-emerald-500 text-emerald-50 shadow-inner shadow-emerald-300/40"
                    : "text-emerald-200/90 hover:bg-emerald-900/30 hover:shadow-[0_0_0_1px_rgba(16,185,129,0.45)]"
                }`}
                onClick={() => setSide("BOUND")}
              >
                Bound
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 font-medium transition-all ${
                  side === "BREAK"
                    ? "bg-rose-600 text-rose-50 shadow-inner shadow-rose-400/40"
                    : "text-rose-200/80 hover:bg-rose-900/30"
                }`}
                onClick={() => setSide("BREAK")}
              >
                Break
              </button>
            </div>

            <div className="mb-2 sm:mb-3 rounded-lg sm:rounded-xl border border-zinc-800 bg-zinc-950/80 p-2 sm:p-3 text-xs">
              <div className="flex items-center justify-between text-zinc-400">
                <span>Band</span>
                <span className="font-mono text-zinc-200">
                  ${band.lower.toFixed(0)} – ${band.upper.toFixed(0)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-zinc-400">
                <span>Start price</span>
                <span className="font-mono text-zinc-200">
                  ${selectedMarket.startPrice.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="mb-2 sm:mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px] text-zinc-400">
              <div className="flex items-center gap-3">
                <span className="uppercase tracking-[0.14em] text-zinc-500">
                  Order type
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={`border-b px-0.5 pb-0.5 text-[11px] font-medium transition-colors ${
                      orderType === "MARKET"
                        ? "border-zinc-200 text-zinc-100"
                        : "border-transparent text-zinc-500 hover:text-zinc-300"
                    }`}
                    onClick={() => setOrderType("MARKET")}
                  >
                    Market
                  </button>
                  <button
                    type="button"
                    className={`border-b px-0.5 pb-0.5 text-[11px] font-medium transition-colors ${
                      orderType === "LIMIT"
                        ? "border-zinc-200 text-zinc-100"
                        : "border-transparent text-zinc-500 hover:text-zinc-300"
                    }`}
                    onClick={() => setOrderType("LIMIT")}
                  >
                    Limit
                  </button>
                </div>
              </div>
              {orderType === "LIMIT" && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={`border-b px-0.5 pb-0.5 text-[11px] font-medium transition-colors ${
                      limitOrderSide === "buy"
                        ? "border-cyan-400 text-cyan-300"
                        : "border-transparent text-zinc-500 hover:text-zinc-300"
                    }`}
                    onClick={() => setLimitOrderSide("buy")}
                  >
                    Buy
                  </button>
                  <button
                    type="button"
                    className={`border-b px-0.5 pb-0.5 text-[11px] font-medium transition-colors ${
                      limitOrderSide === "sell"
                        ? "border-rose-400 text-rose-300"
                        : "border-transparent text-zinc-500 hover:text-zinc-300"
                    }`}
                    onClick={() => setLimitOrderSide("sell")}
                  >
                    Sell
                  </button>
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div className="space-y-1.5">
                <label className="flex items-center justify-between text-zinc-300">
                  <span>Amount</span>
                  <span className="text-[11px] text-zinc-500">
                    {orderType === "LIMIT" && limitOrderSide === "sell" ? "Shares" : "USDC"}
                  </span>
                </label>
                <input
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  disabled={!selectedMarketAddress}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-0 disabled:cursor-not-allowed disabled:text-zinc-500 disabled:opacity-70 focus:border-zinc-500"
                  placeholder={orderType === "LIMIT" && limitOrderSide === "sell" ? `100 ${side === "BOUND" ? "BOUND" : "BREAK"}` : "30 USDC"}
                  inputMode="decimal"
                />
                <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-500">
                  <span>
                    {orderType === "LIMIT" && limitOrderSide === "sell" ? "Est. value" : `${side === "BOUND" ? "BOUND" : "BREAK"} UNITS`}
                  </span>
                  <span className="font-mono text-zinc-200">
                    {(() => {
                      const amt = Number(size || "0");
                      if (!amt || amt <= 0) return "—";
                      
                      if (orderType === "LIMIT" && limitOrderSide === "sell") {
                        // For sell orders, show USDC value
                        const px = Number(price);
                        if (!px || px <= 0) return "—";
                        return `$${(amt * px).toFixed(2)} USDC`;
                      } else {
                        // For buy orders, show units
                        if (orderType === "MARKET" && selectedMarketAddress) {
                          // Use contract's estimated tokens for accuracy
                          const estimated = side === "BOUND" ? estimatedBoundTokens : estimatedBreakTokens;
                          if (estimated) {
                            return formatUnits(BigInt(estimated.toString()), 6);
                          }
                        }
                        // Fallback to manual calculation
                        const px = Number(
                          orderType === "MARKET"
                            ? side === "BOUND"
                              ? currentBook.bound[0]?.price ?? price
                              : currentBook.break[0]?.price ?? price
                            : price
                        );
                        if (!px || px <= 0) return "—";
                        return `${(amt / px).toFixed(4)}`;
                      }
                    })()}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] text-zinc-500">
                    {orderType === "LIMIT" && limitOrderSide === "sell" ? (
                      <>
                        {side === "BOUND" ? "BOUND" : "BREAK"} balance,{" "}
                        <span className="font-mono text-zinc-200">
                          {address && realMarket
                            ? side === "BOUND"
                              ? (boundTokenBalance ? `${formatAmountForDisplay(formatUnits(BigInt(boundTokenBalance.toString()), 6), 2)} BOUND` : "—")
                              : (breakTokenBalance ? `${formatAmountForDisplay(formatUnits(BigInt(breakTokenBalance.toString()), 6), 2)} BREAK` : "—")
                            : "—"}
                        </span>
                      </>
                    ) : (
                      <>
                        USDC balance,{" "}
                        <span className="font-mono text-zinc-200">
                          {address && typeof usdcBalanceRaw === "bigint"
                            ? `${formatAmountForDisplay(formatUnits(usdcBalanceRaw, 6), 2)} USDC`
                            : "—"}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <label className="flex items-center justify-between text-zinc-300">
                  <span>
                    {orderType === "MARKET" ? "Est. fill price" : "Limit price"}
                  </span>
                  <span className="text-[11px] text-zinc-500">USDC / unit</span>
                </label>
                <input
                  value={orderType === "MARKET" && boundPrice && breakPrice
                    ? (side === "BOUND" 
                        ? (Number(boundPrice) / 1e18).toFixed(6)
                        : (Number(breakPrice) / 1e18).toFixed(6))
                    : price}
                  onChange={(e) => setPrice(e.target.value)}
                  disabled={orderType === "MARKET" || !selectedMarketAddress}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-0 disabled:cursor-not-allowed disabled:text-zinc-500 disabled:opacity-70 focus:border-zinc-500"
                  placeholder={orderType === "MARKET" ? "Loading..." : "e.g. 0.51"}
                  inputMode="decimal"
                />
                {orderType === "MARKET" && !!boundPrice && !!breakPrice && (
                  <div className="mt-1 flex items-center justify-between text-[10px]">
                    <span className="text-zinc-500">Live price from contract</span>
                    {Number(size) > 0 && selectedMarketAddress && (
                      <span className="text-zinc-300">
                        You'll receive:{" "}
                        <span className="font-mono text-zinc-100">
                          {(() => {
                            const estimated = side === "BOUND" ? estimatedBoundTokens : estimatedBreakTokens;
                            if (estimated) {
                              return String(formatUnits(BigInt(estimated.toString()), 6));
                            }
                            return "—";
                          })()} {side === "BOUND" ? "BOUND" : "BREAK"}
                        </span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Success messages */}
              {showApproveSuccess && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-500/50 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-300">
                  <svg className="h-4 w-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Approval Successful
                </div>
              )}

              {showBuySuccess && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-500/50 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-300">
                  <svg className="h-4 w-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  {lastSuccessOrderType === "MARKET" && lastSuccessAmount && lastSuccessSide
                    ? `SUCCESSFULLY MINTED ${lastSuccessAmount} ${lastSuccessSide === "BOUND" ? "BOUND" : "BREAK"}`
                    : lastSuccessOrderType === "LIMIT"
                    ? "Order placed successfully! Your order will be filled when price conditions are met."
                    : "Purchase successful!"}
                </div>
              )}

              {address ? (
                (() => {
                  // Check if approval is needed (only for MARKET orders)
                  const needsApproval = orderType === "MARKET" && 
                    selectedMarketAddress && 
                    sizeAmount > BigInt(0) &&
                    usdcAllowance !== undefined &&
                    BigInt(usdcAllowance.toString()) < sizeAmount;

                  if (needsApproval) {
                    return (
                      <button
                        type="button"
                        onClick={handleApprove}
                        disabled={isApproving || !selectedMarketAddress || Number(size) <= 0}
                        className="group mt-2 flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg border border-amber-600/60 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 py-2 text-sm font-semibold text-white shadow-lg shadow-amber-900/40 ring-1 ring-amber-500/40 transition-all disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:from-amber-600 disabled:hover:via-orange-600 disabled:hover:to-amber-700 hover:from-amber-500 hover:via-orange-500 hover:to-amber-600 hover:border-amber-400 hover:shadow-amber-700/60 hover:ring-amber-300/60"
                      >
                        {isApproving ? (
                          <>
                            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Approving USDC...
                          </>
                        ) : (
                          <>
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Approve USDC First
                          </>
                        )}
                      </button>
                    );
                  }

                  return (
                    <button
                      type="submit"
                      onClick={(e) => {
                        console.log("Buy button clicked", {
                          selectedMarketAddress,
                          isBuying,
                          isApproving,
                          size,
                          orderType,
                          side,
                        });
                      }}
                      disabled={!selectedMarketAddress || isBuying || isApproving || Number(size) <= 0}
                      className="group mt-2 flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg border border-cyan-700/60 bg-gradient-to-r from-cyan-700 via-sky-700 to-cyan-800 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-900/40 ring-1 ring-cyan-500/40 transition-all disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:from-cyan-700 disabled:hover:via-sky-700 disabled:hover:to-cyan-800 hover:from-cyan-500 hover:via-sky-500 hover:to-cyan-600 hover:border-cyan-400 hover:shadow-cyan-700/60 hover:ring-cyan-300/60"
                    >
                      {isBuying ? (
                        <>
                          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Confirming transaction...
                        </>
                      ) : isApproving ? (
                        "Approving..."
                      ) : !selectedMarketAddress ? (
                        "Select an active market"
                      ) : Number(size) <= 0 ? (
                        "Enter amount"
                      ) : orderType === "MARKET" ? (
                        `Buy ${side === "BOUND" ? "BOUND" : "BREAK"}`
                      ) : limitOrderSide === "buy" ? (
                        `Submit buy order`
                      ) : (
                        `Submit sell order`
                      )}
                    </button>
                  );
                })()
              ) : (
                <button
                  type="button"
                  onClick={handleConnectClick}
                  className="group mt-2 flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg border border-cyan-500/40 bg-gradient-to-r from-cyan-600 via-sky-600 to-cyan-700 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-900/40 ring-1 ring-cyan-500/40 transition-all hover:from-cyan-500 hover:via-sky-500 hover:to-cyan-600 hover:border-cyan-300 hover:shadow-cyan-700/60 hover:ring-cyan-300/60"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <rect
                      x="3"
                      y="6"
                      width="18"
                      height="12"
                      rx="3"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <circle cx="16" cy="12" r="1.4" fill="currentColor" />
                  </svg>
                  Connect wallet to place order
                </button>
              )}
            </form>
          </div>

          {/* Separate: Settlement details */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-[11px] text-zinc-100 shadow-lg shadow-black/30 transition-all hover:border-cyan-500/40 hover:shadow-cyan-500/30">
            <div className="flex items-center justify-between">
              <span className="text-zinc-100">Settlement & payout</span>
              <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 font-mono text-zinc-100">
                {side === "BOUND" ? "Bound" : "Break"}
              </span>
            </div>

            <div className="mt-4 border-t border-zinc-800 pt-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Lower band</span>
                <span className="font-[var(--font-space-grotesk)] text-zinc-100 transition-colors hover:text-emerald-300 hover:underline underline-offset-2 cursor-pointer">
                  ${formatAmountForDisplay(band.lower.toFixed(0), 0)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Upper band</span>
                <span className="font-[var(--font-space-grotesk)] text-zinc-100 transition-colors hover:text-emerald-300 hover:underline underline-offset-2 cursor-pointer">
                  ${formatAmountForDisplay(band.upper.toFixed(0), 0)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Start price</span>
                <span className="font-[var(--font-space-grotesk)] text-zinc-100 transition-colors hover:text-emerald-300 hover:underline underline-offset-2 cursor-pointer">
                  ${formatAmountForDisplay(selectedMarket.startPrice.toString(), 2)}
                </span>
          </div>

          {/* Useful links under settlement */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-3 text-[11px] text-zinc-300 shadow-lg shadow-black/30">
            <div className="mb-2 text-zinc-100">Useful links</div>
            <div className="space-y-1.5">
              <a
                href={`https://www.coingecko.com/en/coins/${selectedMarket.coingeckoId}`}
            target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-xs text-zinc-200 transition-colors hover:border-cyan-500/50 hover:bg-zinc-900 hover:text-cyan-200"
              >
                <span>View {selectedMarket.name} on CoinGecko</span>
                <span className="text-zinc-500">↗</span>
              </a>
            </div>
          </div>
          </div>

            <div className="mt-3 space-y-1.5">
              <div>
                <span className="text-zinc-100">Payout: Winners split the total pool (after 2% fee) proportionally</span>
              </div>

              {side === "BOUND" ? (
                <div>
                  <span className="text-zinc-100">For Bound, expiry price finishes between </span>
                  <span className="font-[var(--font-space-grotesk)] text-emerald-300">
                    ${formatAmountForDisplay(band.lower.toFixed(0), 0)}
                  </span>
                  <span className="text-zinc-100"> (lower band) and </span>
                  <span className="font-[var(--font-space-grotesk)] text-emerald-300">
                    ${formatAmountForDisplay(band.upper.toFixed(0), 0)}
                  </span>
                  <span className="text-zinc-100"> (upper band)</span>
                </div>
              ) : (
                <div>
                  <span className="text-zinc-100">For Break, expiry price finishes below </span>
                  <span className="font-[var(--font-space-grotesk)] text-emerald-300">
                    ${formatAmountForDisplay(band.lower.toFixed(0), 0)}
                  </span>
                  <span className="text-zinc-100"> (lower band) or above </span>
                  <span className="font-[var(--font-space-grotesk)] text-emerald-300">
                    ${formatAmountForDisplay(band.upper.toFixed(0), 0)}
                  </span>
                  <span className="text-zinc-100"> (upper band)</span>
                </div>
              )}

              <div className="pt-1 text-zinc-400">
                If the condition is not met, payout is{" "}
                <span className="font-[var(--font-space-grotesk)] text-emerald-300">0 USDC</span> per unit.
              </div>
            </div>
          </div>
        </div>
        </section>
      </main>
      <footer className="border-t border-zinc-900 bg-black/60 py-3 text-center text-[11px] text-zinc-500">
        BrimDex · 2026 All rights reserved · Audited by{" "}
        <span className="font-medium text-zinc-300">Drew Mooner</span>{" "}
        · Powered by{" "}
        <a
          href="https://somnia.network"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-cyan-400 hover:text-cyan-300"
        >
          Somnia
        </a>
      </footer>
    </div>
  );
}
