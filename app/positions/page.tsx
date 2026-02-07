"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits, parseUnits, zeroAddress } from "viem";
import { erc20Abi } from "viem";
import { CONTRACTS, FACTORY_ABI, MARKET_ABI, TOKEN_ABI } from "../contracts";

type Position = {
  marketAddress: string;
  boundToken: string;
  breakToken: string;
  boundBalance: bigint;
  breakBalance: bigint;
  marketConfig: {
    tokenAddress: string;
    lowerBound: bigint;
    upperBound: bigint;
    expiryTimestamp: bigint;
    initialized: boolean;
    settled: boolean;
  };
  boundTokenName: string;
  breakTokenName: string;
  boundPrice: bigint;
  breakPrice: bigint;
  estimatedPayout: {
    bound: bigint;
    break: bigint;
  };
};

export default function PositionsPage() {
  const { address, isConnected } = useAccount();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string | null>(null);

  // Get all markets
  const { data: allMarkets } = useReadContract({
    address: CONTRACTS.somniaTestnet.FACTORY as `0x${string}`,
    abi: FACTORY_ABI,
    functionName: "getAllMarkets",
    query: {
      enabled: true,
      refetchInterval: 10_000,
    },
  });

  // Fetch positions using wagmi hooks
  useEffect(() => {
    const fetchPositions = async () => {
      if (!address || !allMarkets || allMarkets.length === 0) {
        setPositions([]);
        setLoading(false);
        return;
      }

      try {
        const { createPublicClient, http } = await import("viem");
        const { defineChain } = await import("viem");
        
        const somniaTestnet = defineChain({
          id: 50312,
          name: "Somnia Testnet",
          nativeCurrency: { decimals: 18, name: "Somnia Test Token", symbol: "STT" },
          rpcUrls: { default: { http: ["https://dream-rpc.somnia.network"] } },
          blockExplorers: { default: { name: "Somnia Explorer", url: "https://shannon-explorer.somnia.network" } },
          testnet: true,
        });

        const publicClient = createPublicClient({
          chain: somniaTestnet,
          transport: http(),
        });

        const positionsData: Position[] = [];

        for (const marketAddress of allMarkets) {
          try {
            const [boundToken, breakToken, marketConfig, boundName, breakName, boundBal, breakBal] = await Promise.all([
              publicClient.readContract({
                address: CONTRACTS.somniaTestnet.FACTORY as `0x${string}`,
                abi: FACTORY_ABI,
                functionName: "marketToBoundToken",
                args: [marketAddress as `0x${string}`],
              }),
              publicClient.readContract({
                address: CONTRACTS.somniaTestnet.FACTORY as `0x${string}`,
                abi: FACTORY_ABI,
                functionName: "marketToBreakToken",
                args: [marketAddress as `0x${string}`],
              }),
              publicClient.readContract({
                address: marketAddress as `0x${string}`,
                abi: MARKET_ABI,
                functionName: "marketConfig",
              }),
              publicClient.readContract({
                address: boundToken as `0x${string}`,
                abi: TOKEN_ABI,
                functionName: "name",
              }).catch(() => ""),
              publicClient.readContract({
                address: breakToken as `0x${string}`,
                abi: TOKEN_ABI,
                functionName: "name",
              }).catch(() => ""),
              publicClient.readContract({
                address: boundToken as `0x${string}`,
                abi: TOKEN_ABI,
                functionName: "balanceOf",
                args: [address as `0x${string}`],
              }),
              publicClient.readContract({
                address: breakToken as `0x${string}`,
                abi: TOKEN_ABI,
                functionName: "balanceOf",
                args: [address as `0x${string}`],
              }),
            ]);

            const boundBalance = boundBal as bigint;
            const breakBalance = breakBal as bigint;

            if (boundBalance > 0n || breakBalance > 0n) {
              const [boundPrice, breakPrice, estimatedBoundPayout, estimatedBreakPayout] = await Promise.all([
                publicClient.readContract({
                  address: marketAddress as `0x${string}`,
                  abi: MARKET_ABI,
                  functionName: "getBoundPrice",
                }).catch(() => 0n),
                publicClient.readContract({
                  address: marketAddress as `0x${string}`,
                  abi: MARKET_ABI,
                  functionName: "getBreakPrice",
                }).catch(() => 0n),
                publicClient.readContract({
                  address: marketAddress as `0x${string}`,
                  abi: MARKET_ABI,
                  functionName: "getEstimatedPayout",
                  args: [true, boundBalance],
                }).catch(() => 0n),
                publicClient.readContract({
                  address: marketAddress as `0x${string}`,
                  abi: MARKET_ABI,
                  functionName: "getEstimatedPayout",
                  args: [false, breakBalance],
                }).catch(() => 0n),
              ]);

              positionsData.push({
                marketAddress,
                boundToken: boundToken as string,
                breakToken: breakToken as string,
                boundBalance,
                breakBalance,
                marketConfig: marketConfig as any,
                boundTokenName: boundName as string,
                breakTokenName: breakName as string,
                boundPrice: boundPrice as bigint,
                breakPrice: breakPrice as bigint,
                estimatedPayout: {
                  bound: estimatedBoundPayout as bigint,
                  break: estimatedBreakPayout as bigint,
                },
              });
            }
          } catch (err) {
            console.error(`Error loading position for ${marketAddress}:`, err);
          }
        }

        setPositions(positionsData);
      } catch (error) {
        console.error("Error fetching positions:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPositions();
  }, [address, allMarkets]);

  const { writeContract: redeemTokens } = useWriteContract();

  const handleRedeem = async (marketAddress: string, isBound: boolean, amount: bigint) => {
    if (!address) return;
    setRedeeming(`${marketAddress}-${isBound}`);

    try {
      await redeemTokens({
        address: marketAddress as `0x${string}`,
        abi: MARKET_ABI,
        functionName: "redeem",
        args: [isBound, amount],
      });
    } catch (error) {
      console.error("Redeem error:", error);
    } finally {
      setRedeeming(null);
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-black to-zinc-950 text-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Connect Wallet</h2>
          <p className="text-zinc-400">Please connect your wallet to view positions</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-black to-zinc-950 text-zinc-50">
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo.png" alt="Brimdex Logo" className="h-12 w-8 md:h-14 md:w-10 object-cover object-left" />
            <h1 className="bg-gradient-to-r from-cyan-400 via-sky-300 to-cyan-500 bg-clip-text text-xl font-bold tracking-tight text-transparent md:text-2xl">
              Brimdex
            </h1>
          </Link>
          <Link href="/" className="text-zinc-400 hover:text-cyan-400 transition-colors">
            ← Back to Trading
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <h2 className="text-3xl font-bold mb-8">Your Positions</h2>

        {loading ? (
          <div className="text-center py-12 text-zinc-400">Loading positions...</div>
        ) : positions.length === 0 ? (
          <div className="text-center py-12 text-zinc-400">
            <p className="mb-4">No positions found</p>
            <Link href="/" className="text-cyan-400 hover:underline">
              Start trading
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {positions.map((pos) => (
              <div key={pos.marketAddress} className="border border-zinc-800 rounded-lg p-6 bg-zinc-900/50">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-semibold mb-2">
                      {pos.boundTokenName.replace("-BOUND", "").replace("-BREAK", "")}
                    </h3>
                    <p className="text-sm text-zinc-400">
                      Market: {pos.marketAddress.slice(0, 6)}...{pos.marketAddress.slice(-4)}
                    </p>
                    <p className="text-sm text-zinc-400">
                      Range: ${Number(pos.marketConfig.lowerBound) / 1e6} - ${Number(pos.marketConfig.upperBound) / 1e6}
                    </p>
                    <p className="text-sm text-zinc-400">
                      Status: {pos.marketConfig.settled ? "Settled" : pos.marketConfig.expiryTimestamp > BigInt(Date.now() / 1000) ? "Active" : "Expired"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  {pos.boundBalance > 0n && (
                    <div className="border border-zinc-800 rounded p-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-cyan-400 font-medium">BOUND</span>
                        <span className="text-sm text-zinc-400">
                          {formatUnits(pos.boundBalance, 6)} tokens
                        </span>
                      </div>
                      {pos.marketConfig.settled && pos.marketConfig.lowerBound > 0n && (
                        <button
                          onClick={() => handleRedeem(pos.marketAddress, true, pos.boundBalance)}
                          disabled={redeeming === `${pos.marketAddress}-true`}
                          className="w-full mt-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 rounded text-white disabled:opacity-50"
                        >
                          {redeeming === `${pos.marketAddress}-true` ? "Redeeming..." : "Redeem"}
                        </button>
                      )}
                    </div>
                  )}

                  {pos.breakBalance > 0n && (
                    <div className="border border-zinc-800 rounded p-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-red-400 font-medium">BREAK</span>
                        <span className="text-sm text-zinc-400">
                          {formatUnits(pos.breakBalance, 6)} tokens
                        </span>
                      </div>
                      {pos.marketConfig.settled && pos.marketConfig.lowerBound > 0n && (
                        <button
                          onClick={() => handleRedeem(pos.marketAddress, false, pos.breakBalance)}
                          disabled={redeeming === `${pos.marketAddress}-false`}
                          className="w-full mt-2 px-4 py-2 bg-red-500 hover:bg-red-600 rounded text-white disabled:opacity-50"
                        >
                          {redeeming === `${pos.marketAddress}-false` ? "Redeeming..." : "Redeem"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
