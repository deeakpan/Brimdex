"use client";

import { useState, useMemo } from "react";
import { WagmiProvider, createConfig } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider } from "connectkit";
import { defineChain } from "viem";
import { http } from "viem";
import { injected, metaMask, walletConnect, coinbaseWallet } from "@wagmi/connectors";

// Somnia Testnet configuration
const somniaTestnet = defineChain({
  id: 50312,
  name: "Somnia Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Somnia Test Token",
    symbol: "STT",
  },
  rpcUrls: {
    default: {
      http: ["https://dream-rpc.somnia.network"],
    },
  },
  blockExplorers: {
    default: {
      name: "Somnia Explorer",
      url: "https://shannon-explorer.somnia.network",
    },
  },
  testnet: true,
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  
  const config = useMemo(() => {
    return createConfig({
      chains: [somniaTestnet],
      connectors: [
        injected({ shimDisconnect: true }),
        metaMask(),
        ...(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ? [
          walletConnect({
            projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
          })
        ] : []),
        coinbaseWallet({
          appName: "BrimDex",
        }),
      ],
      transports: {
        [somniaTestnet.id]: http(),
      },
      ssr: true,
    });
  }, []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider>
          {children}
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
