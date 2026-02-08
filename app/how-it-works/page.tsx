"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";

export default function HowItWorksPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSection, setActiveSection] = useState("overview");
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const sectionRefs = useRef<{ [key: string]: HTMLElement | null }>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Table of contents sections
  const sections = useMemo(() => [
    { id: "overview", title: "Overview" },
    { id: "key-concepts", title: "Key Concepts" },
    { id: "how-to-trade", title: "How to Trade" },
    { id: "hedging", title: "Hedging Strategies" },
    { id: "market-schedules", title: "Market Schedules" },
    { id: "supported-assets", title: "Supported Assets" },
    { id: "settlement", title: "Settlement & Redemption" },
  ], []);

  // Reset scroll position when section changes
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [activeSection]);

  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId); // Immediately update active section
    setMobileMenuOpen(false); // Close mobile menu when navigating
    const element = document.getElementById(sectionId);
    if (element && containerRef.current) {
      const container = containerRef.current;
      const elementTop = element.offsetTop;
      container.scrollTo({
        top: elementTop,
        behavior: 'smooth'
      });
    }
  };

  const currentIndex = sections.findIndex(s => s.id === activeSection);
  const nextSection = currentIndex < sections.length - 1 ? sections[currentIndex + 1] : null;
  const prevSection = currentIndex > 0 ? sections[currentIndex - 1] : null;

  const copySectionLink = (sectionId: string) => {
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}${window.location.pathname}#${sectionId}`;
      navigator.clipboard.writeText(url).then(() => {
        setCopiedLink(sectionId);
        setTimeout(() => setCopiedLink(null), 2000);
      });
    }
  };

  const getSectionLink = (sectionId: string) => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}${window.location.pathname}#${sectionId}`;
    }
    return '';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-black to-zinc-950 text-zinc-50">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:py-4 md:px-8 gap-2 md:gap-4">
          <div className="flex items-center gap-2 md:gap-4">
            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden text-zinc-400 hover:text-cyan-400 transition-colors p-2"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
            
            <Link href="/" className="flex items-center gap-2 flex-shrink-0">
              <img src="/logo.png" alt="Brimdex Logo" className="h-10 w-7 md:h-14 md:w-10 object-cover object-left" />
              <h1 className="bg-gradient-to-r from-cyan-400 via-sky-300 to-cyan-500 bg-clip-text text-lg font-bold tracking-tight text-transparent md:text-2xl">
                Brimdex
              </h1>
            </Link>
          </div>
          
          {/* Search Bar - Hidden on mobile */}
          <div className="hidden md:flex flex-1 max-w-md mx-4">
            <div className="relative w-full">
              <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search documentation..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-2.5 bg-zinc-900/80 border border-zinc-700 rounded-md text-zinc-50 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
            <button className="text-zinc-400 hover:text-cyan-400 transition-colors text-xs md:text-sm hidden sm:block">
              Feedback
            </button>
            <button className="text-zinc-400 hover:text-cyan-400 transition-colors text-xs md:text-sm hidden sm:block">
              Support
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-zinc-950/95 backdrop-blur-sm">
          <div className="h-full overflow-y-auto">
            <div className="px-4 py-6 border-b border-zinc-800">
              <h2 className="text-lg font-semibold mb-4 text-zinc-300">Navigation</h2>
              <nav className="space-y-2">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => scrollToSection(section.id)}
                    className={`w-full text-left block text-sm transition-colors duration-200 py-3 px-4 rounded-lg ${
                      activeSection === section.id
                        ? "text-cyan-400 bg-cyan-500/10 border-l-2 border-cyan-400 font-medium"
                        : "text-zinc-400 hover:text-cyan-400 hover:bg-zinc-900/50"
                    }`}
                  >
                    {section.title}
                  </button>
                ))}
              </nav>
            </div>
            
            {/* Mobile Search */}
            <div className="px-4 py-4 border-b border-zinc-800">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                  <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Search documentation..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-2.5 bg-zinc-900/80 border border-zinc-700 rounded-md text-zinc-50 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all text-sm"
                />
              </div>
            </div>

            {/* Mobile Footer Actions */}
            <div className="px-4 py-4 border-t border-zinc-800 mt-auto">
              <div className="flex gap-4">
                <button className="text-zinc-400 hover:text-cyan-400 transition-colors text-sm flex-1 text-center py-2">
                  Feedback
                </button>
                <button className="text-zinc-400 hover:text-cyan-400 transition-colors text-sm flex-1 text-center py-2">
                  Support
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row">
        {/* Sidebar */}
        <aside className="hidden lg:block w-80 flex-shrink-0 border-r border-zinc-800/50">
          <div className="sticky top-24 h-[calc(100vh-6rem)] pr-6">
            <div className="bg-zinc-900/40 backdrop-blur-md border-l-2 border-zinc-800/50 rounded-r-xl p-6 h-full flex flex-col transition-all duration-300 hover:border-cyan-500/30">
              <h2 className="text-base font-medium mb-6 pb-4 border-b border-zinc-800/50 text-zinc-300">Navigation</h2>
              <nav className="space-y-1 mb-6 flex-1">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => scrollToSection(section.id)}
                    className={`w-full text-left block text-sm transition-colors duration-200 py-2 px-3 rounded ${
                      activeSection === section.id
                        ? "text-cyan-400 border-l-2 border-cyan-400 pl-2 font-medium"
                        : "text-zinc-400 border-l-2 border-transparent pl-2"
                    }`}
                  >
                    {section.title}
                  </button>
                ))}
              </nav>
              <div className="pt-4 border-t border-zinc-800/50 text-xs text-zinc-500">
                <p>Brimdex Documentation</p>
                <p className="mt-1">v1.0</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 h-screen overflow-hidden w-full">

          <main className="h-full flex flex-col">
            {activeSection === "overview" && (
            <div className="mb-6 md:mb-8 px-4 pt-4 md:pt-8 flex-shrink-0">
              <h1 className="text-2xl md:text-3xl font-semibold mb-3 md:mb-4 text-zinc-100">How It Works</h1>
              <p className="text-sm md:text-base text-zinc-400">
                Learn everything you need to know about trading on Brimdex
              </p>
            </div>
            )}

            {/* Content Sections - Only show active section */}
            <div 
              ref={containerRef} 
              className="flex-1 overflow-y-auto scrollbar-thin-dark px-4 md:px-6"
            >
              {/* Overview Section */}
              {activeSection === "overview" && (
              <section id="overview" className="pb-8 md:pb-12">
                <h2 
                  className="text-xl md:text-2xl font-semibold mb-4 md:mb-6 text-zinc-100 group relative inline-block"
                  onMouseEnter={() => setHoveredLink("overview")}
                  onMouseLeave={() => setHoveredLink(null)}
                >
                  Overview
                  <button
                    onClick={() => copySectionLink("overview")}
                    className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center text-cyan-400 hover:text-cyan-300"
                    title="Copy link"
                  >
                    <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </button>
                  {copiedLink === "overview" && (
                    <span className="ml-2 text-xs md:text-sm text-cyan-400">Copied!</span>
                  )}
                </h2>
                
                <div className="space-y-8 text-zinc-300 leading-relaxed">
                  <p className="text-lg">
                    <strong className="text-cyan-400">Brimdex</strong> is a decentralized prediction market platform built on Somnia where you can trade on whether a cryptocurrency's price will stay within a specific range or break out of it by a set expiry time.
                  </p>

                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-cyan-400">The Core Concept</h3>
                    <p>
                      Each market asks a simple question: <em>"Will the asset's price be between $X and $Y when this market expires?"</em>
                    </p>
                    <ul className="space-y-2 list-disc list-inside text-zinc-300 ml-4">
                      <li>You choose to bet on <strong className="text-cyan-400">BOUND</strong> (price stays in range) or <strong className="text-red-400">BREAK</strong> (price goes outside range)</li>
                      <li>Markets have fixed expiry times (24 hours, 7 days, or 30 days)</li>
                      <li>At expiry, the final price determines which side wins</li>
                      <li>Winners split the total pool (minus a small protocol fee)</li>
                    </ul>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg font-medium text-cyan-400">How It Works</h3>
                    <ol className="space-y-4 list-decimal list-inside ml-4">
                      <li>
                        <strong>Market Creation:</strong> A new market is created with a price range (e.g., ETH between $3,000 and $3,100) and an expiry time. The market starts with initial liquidity to establish a 50/50 probability.
                      </li>
                      <li>
                        <strong>Primary Trading:</strong> You deposit USDC to buy BOUND or BREAK tokens. The price of each token updates dynamically based on how much money is on each side—this is called a <strong>parimutuel</strong> system.
                      </li>
                      <li>
                        <strong>Secondary Trading:</strong> You can trade your tokens with other users on the orderbook before expiry. This lets you exit early or enter at different prices.
                      </li>
                      <li>
                        <strong>Settlement:</strong> When the market expires, the final price from an oracle determines the winner. If the price is within the range, BOUND wins. If outside, BREAK wins.
                      </li>
                      <li>
                        <strong>Redemption:</strong> Winners can redeem their tokens for USDC based on the redemption rate (total winnings divided by winning tokens). Losers' tokens become worthless.
                      </li>
                    </ol>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-3">
                    <h3 className="text-lg font-medium text-cyan-400">Key Advantages</h3>
                    <ul className="space-y-2 list-disc list-inside ml-4">
                      <li><strong>No counterparty risk:</strong> All funds are held in smart contracts</li>
                      <li><strong>Transparent pricing:</strong> Prices update in real-time based on actual market activity</li>
                      <li><strong>Early exit:</strong> Trade your positions on the orderbook anytime before expiry</li>
                      <li><strong>Automatic settlement:</strong> Markets settle automatically using oracle prices</li>
                    </ul>
                  </div>
                </div>
                
                {/* Section Navigation */}
                <div className="mt-12 pt-8 border-t border-zinc-800 flex items-center justify-between">
                  {prevSection ? (
                    <button
                      onClick={() => scrollToSection(prevSection.id)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-cyan-400 transition-colors group"
                    >
                      <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      {prevSection.title}
                    </button>
                  ) : (
                    <div></div>
                  )}
                  {nextSection ? (
                    <button
                      onClick={() => scrollToSection(nextSection.id)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-cyan-400 transition-colors group"
                    >
                      {nextSection.title}
                      <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ) : (
                    <div></div>
                  )}
                </div>
              </section>
              )}

              {/* Key Concepts Section */}
              {activeSection === "key-concepts" && (
              <section id="key-concepts" className="pb-8 md:pb-12 pt-4 md:pt-8">
                <h2 
                  className="text-xl md:text-2xl font-semibold mb-4 md:mb-6 text-zinc-100 group relative inline-block"
                  onMouseEnter={() => setHoveredLink("key-concepts")}
                  onMouseLeave={() => setHoveredLink(null)}
                >
                  Key Concepts & Terminology
                  <button
                    onClick={() => copySectionLink("key-concepts")}
                    className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center text-cyan-400 hover:text-cyan-300"
                    title="Copy link"
                  >
                    <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </button>
                  {copiedLink === "key-concepts" && (
                    <span className="ml-2 text-xs md:text-sm text-cyan-400">Copied!</span>
                  )}
                </h2>
                
                <div className="space-y-8 text-zinc-300 leading-relaxed">
                  <div className="space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">BOUND vs BREAK</h3>
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-lg font-semibold mb-2 text-cyan-400">BOUND Token</h4>
                        <p>
                          BOUND tokens represent a bet that the asset's price will <strong>stay within</strong> the specified range at expiry. 
                          If you hold BOUND tokens and the final price is between the lower and upper bounds, you win.
                        </p>
                        <p className="mt-2 text-sm text-zinc-400">
                          <strong>Example:</strong> If a market has a range of $3,000 - $3,100 and ETH closes at $3,050, BOUND wins.
                        </p>
                      </div>
                      <div>
                        <h4 className="text-lg font-semibold mb-2 text-red-400">BREAK Token</h4>
                        <p>
                          BREAK tokens represent a bet that the asset's price will <strong>go outside</strong> the specified range at expiry. 
                          If you hold BREAK tokens and the final price is either below the lower bound or above the upper bound, you win.
                        </p>
                        <p className="mt-2 text-sm text-zinc-400">
                          <strong>Example:</strong> If a market has a range of $3,000 - $3,100 and ETH closes at $2,950 or $3,150, BREAK wins.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">Parimutuel System</h3>
                    <p className="mb-4">
                      Brimdex uses a <strong>parimutuel</strong> betting system, which means all participants bet against each other, and winners share the total pool.
                    </p>
                    <div className="space-y-3">
                      <div>
                        <h4 className="font-semibold mb-2">How Prices Work:</h4>
                        <ul className="list-disc list-inside space-y-1 text-sm">
                          <li>The price of BOUND = (BOUND pool) ÷ (BOUND pool + BREAK pool)</li>
                          <li>The price of BREAK = (BREAK pool) ÷ (BOUND pool + BREAK pool)</li>
                          <li>As more money flows to one side, that side's price increases</li>
                        </ul>
                      </div>
                      <p className="text-sm text-zinc-400 mt-4 italic">
                        <strong>Example:</strong> If $100 is in the BOUND pool and $50 is in the BREAK pool, 
                        BOUND price = 100/150 = 66.7%, and BREAK price = 50/150 = 33.3%. 
                        If someone adds $50 to BREAK, the new prices become 100/200 = 50% for BOUND and 100/200 = 50% for BREAK.
                      </p>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">Price Range & Bounds</h3>
                    <div className="space-y-3">
                      <p>
                        Each market has a <strong>lower bound</strong> and <strong>upper bound</strong> that define the price range.
                      </p>
                      <ul className="list-disc list-inside space-y-2">
                        <li><strong>Lower Bound:</strong> The minimum price that still counts as BOUND winning</li>
                        <li><strong>Upper Bound:</strong> The maximum price that still counts as BOUND winning</li>
                        <li><strong>Range:</strong> The difference between upper and lower bounds, typically expressed as a percentage of the starting price</li>
                      </ul>
                      <p className="text-sm text-zinc-400 mt-4 italic">
                        <strong>Example:</strong> If ETH starts at $3,000 and the range is ±1.5%, 
                        the lower bound is $2,955 and the upper bound is $3,045. 
                        Any price between these values at expiry means BOUND wins.
                      </p>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">Expiry & Settlement</h3>
                    <div className="space-y-3">
                      <p>
                        Every market has a fixed <strong>expiry timestamp</strong> when trading stops and the market settles.
                      </p>
                      <ul className="list-disc list-inside space-y-2">
                        <li><strong>Expiry Time:</strong> The exact moment (in UTC) when the market closes and final price is determined</li>
                        <li><strong>Settlement:</strong> The automatic process that determines the winner using an oracle price feed</li>
                        <li><strong>Redemption Rate:</strong> The amount of USDC each winning token is worth (calculated as: total winnings ÷ total winning tokens)</li>
                      </ul>
                      <p className="mt-3 text-sm text-zinc-400">
                        <strong>Important:</strong> Once a market expires, you can no longer trade. You must wait for settlement, then redeem if you're on the winning side.
                      </p>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">Primary vs Secondary Trading</h3>
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold mb-2 text-cyan-400">Primary Trading (Minting)</h4>
                        <p className="mb-2">
                          When you buy BOUND or BREAK tokens directly from the market contract, you're doing <strong>primary trading</strong>.
                        </p>
                        <ul className="list-disc list-inside space-y-1 text-sm">
                          <li>You deposit USDC into the market</li>
                          <li>New tokens are minted to your wallet</li>
                          <li>The pool size increases, affecting prices for everyone</li>
                          <li>This is how new liquidity enters the market</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-semibold mb-2 text-cyan-400">Secondary Trading (Orderbook)</h4>
                        <p className="mb-2">
                          When you trade tokens with other users on the orderbook, you're doing <strong>secondary trading</strong>.
                        </p>
                        <ul className="list-disc list-inside space-y-1 text-sm">
                          <li>You trade existing tokens (no new tokens are minted)</li>
                          <li>You can set limit orders at specific prices</li>
                          <li>Orders match automatically when prices align</li>
                          <li>This lets you exit early or enter at better prices</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">Protocol Fee</h3>
                    <p className="mb-3">
                      Brimdex charges a <strong>2% fee</strong> on the total pool when markets settle. This fee is deducted before calculating redemption rates.
                    </p>
                    <p className="text-sm text-zinc-400 italic">
                      <strong>Example:</strong> If the total pool is $1,000, the fee is $20 (2%), 
                      leaving $980 to be distributed among winners. This fee supports protocol development and maintenance.
                    </p>
                  </div>
                </div>
                
                {/* Section Navigation */}
                <div className="mt-12 pt-8 border-t border-zinc-800 flex items-center justify-between">
                  {prevSection ? (
                    <button
                      onClick={() => scrollToSection(prevSection.id)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-cyan-400 transition-colors group"
                    >
                      <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      {prevSection.title}
                    </button>
                  ) : (
                    <div></div>
                  )}
                  {nextSection ? (
                    <button
                      onClick={() => scrollToSection(nextSection.id)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-cyan-400 transition-colors group"
                    >
                      {nextSection.title}
                      <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ) : (
                    <div></div>
                  )}
                </div>
              </section>
              )}

              {/* How to Trade Section */}
              {activeSection === "how-to-trade" && (
              <section id="how-to-trade" className="pb-8 md:pb-12 pt-4 md:pt-8">
                <h2 
                  className="text-xl md:text-2xl font-semibold mb-4 md:mb-6 text-zinc-100 group relative inline-block"
                  onMouseEnter={() => setHoveredLink("how-to-trade")}
                  onMouseLeave={() => setHoveredLink(null)}
                >
                  How to Trade
                  <button
                    onClick={() => copySectionLink("how-to-trade")}
                    className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center text-cyan-400 hover:text-cyan-300"
                    title="Copy link"
                  >
                    <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </button>
                  {copiedLink === "how-to-trade" && (
                    <span className="ml-2 text-xs md:text-sm text-cyan-400">Copied!</span>
                  )}
                </h2>
                
                <div className="space-y-8 text-zinc-300 leading-relaxed">
                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">Buying BOUND or BREAK (Primary Trading)</h3>
                    <p className="mb-4">
                      When you buy tokens directly from the market, you're entering a new position by minting tokens. This is the primary way to get started.
                    </p>
                    <ol className="list-decimal list-inside space-y-3">
                      <li>
                        <strong>Connect Your Wallet:</strong> Make sure you have USDC in your wallet and are connected to Somnia network.
                      </li>
                      <li>
                        <strong>Select a Market:</strong> Choose an active market from the trading page. Check the price range, expiry time, and current prices for BOUND and BREAK.
                      </li>
                      <li>
                        <strong>Approve USDC (First Time Only):</strong> If this is your first trade, you'll need to approve the market contract to spend your USDC. This is a one-time transaction per market.
                      </li>
                      <li>
                        <strong>Choose Your Side:</strong> Decide whether to buy BOUND (price stays in range) or BREAK (price goes outside range).
                      </li>
                      <li>
                        <strong>Enter Amount:</strong> Specify how much USDC you want to spend. The interface will show you approximately how many tokens you'll receive based on current prices.
                      </li>
                      <li>
                        <strong>Confirm Transaction:</strong> Review the estimated tokens and confirm the transaction. Once confirmed, tokens will be minted to your wallet.
                      </li>
                    </ol>
                    <div className="text-sm text-zinc-400 italic mt-4">
                      <p className="text-sm">
                        <strong>Tip:</strong> Prices update in real-time. The more you buy, the more the price moves against you (slippage). 
                        For large positions, consider splitting into multiple smaller trades.
                      </p>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">Selling on the Orderbook (Secondary Trading)</h3>
                    <p className="mb-4">
                      If you want to exit your position early or trade at a specific price, you can use the orderbook to sell your tokens to other traders.
                    </p>
                    <ol className="list-decimal list-inside space-y-3">
                      <li>
                        <strong>Approve Tokens (First Time Only):</strong> Approve the orderbook contract to spend your BOUND or BREAK tokens. This is a one-time approval per token type.
                      </li>
                      <li>
                        <strong>Set Your Price:</strong> Choose the price per token you want to sell at (in USDC). You can see the current best bid (what buyers are offering) to help set your price.
                      </li>
                      <li>
                        <strong>Enter Amount:</strong> Specify how many tokens you want to sell. Your tokens will be locked in the orderbook until matched or cancelled.
                      </li>
                      <li>
                        <strong>Place Sell Order:</strong> Confirm the transaction. If there's a matching buy order at your price, it will execute immediately. Otherwise, your order will be placed on the orderbook.
                      </li>
                      <li>
                        <strong>Wait for Match or Cancel:</strong> Your order will automatically match when someone places a buy order at your price. You can cancel anytime to get your tokens back.
                      </li>
                    </ol>
                    <div className="text-sm text-zinc-400 italic mt-4">
                      <p className="text-sm">
                        <strong>Tip:</strong> Setting your price close to the current best bid will increase your chances of immediate execution. 
                        Higher prices may take longer to fill but give you better returns.
                      </p>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">Buying from the Orderbook</h3>
                    <p className="mb-4">
                      You can also buy tokens from other traders on the orderbook, often at better prices than minting new tokens.
                    </p>
                    <ol className="list-decimal list-inside space-y-3">
                      <li>
                        <strong>Approve USDC:</strong> Approve the orderbook contract to spend your USDC (one-time per orderbook).
                      </li>
                      <li>
                        <strong>Check Available Orders:</strong> Look at the orderbook to see what sell orders are available. You'll see the price and amount available.
                      </li>
                      <li>
                        <strong>Set Your Price:</strong> Choose the maximum price you're willing to pay per token. You can match an existing sell order or set your own limit.
                      </li>
                      <li>
                        <strong>Enter Amount:</strong> Specify how many tokens you want to buy. The interface will calculate the total USDC needed (including fees).
                      </li>
                      <li>
                        <strong>Place Buy Order:</strong> Confirm the transaction. If there's a matching sell order, it executes immediately. Otherwise, your order waits on the book.
                      </li>
                    </ol>
                    <div className="text-sm text-zinc-400 italic mt-4">
                      <p className="text-sm">
                        <strong>Tip:</strong> Buying from the orderbook can be cheaper than minting if sellers are offering discounts. 
                        Always compare orderbook prices with primary market prices before buying.
                      </p>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">Understanding Price Movements</h3>
                    <div className="space-y-4">
                      <p>
                        Prices on Brimdex are dynamic and change with every trade. Here's what affects prices:
                      </p>
                      <ul className="list-disc list-inside space-y-2">
                        <li>
                          <strong>Pool Imbalance:</strong> If more money flows to BOUND, BOUND price increases and BREAK price decreases (and vice versa)
                        </li>
                        <li>
                          <strong>Time to Expiry:</strong> As expiry approaches, prices may become more volatile as traders adjust positions
                        </li>
                        <li>
                          <strong>Market Sentiment:</strong> If traders believe the price will stay in range, BOUND becomes more expensive
                        </li>
                        <li>
                          <strong>Orderbook Activity:</strong> Large orders on the orderbook can signal where prices might move
                        </li>
                      </ul>
                      <div className="text-sm text-zinc-400 italic">
                        <p className="text-sm">
                          <strong>Example:</strong> If ETH is currently at $3,025 and the range is $3,000-$3,100, 
                          BOUND might be priced at 70% because traders think it's likely to stay in range. 
                          If ETH moves to $2,980, BREAK price will increase as the probability of staying in range decreases.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">Best Practices</h3>
                    <ul className="list-disc list-inside space-y-3">
                      <li>
                        <strong>Start Small:</strong> Begin with smaller positions to understand how prices move and how the system works
                      </li>
                      <li>
                        <strong>Monitor Expiry Times:</strong> Always know when markets expire. You can't trade after expiry, so plan your exits accordingly
                      </li>
                      <li>
                        <strong>Check Both Markets:</strong> Compare prices between primary trading and orderbook to find the best deal
                      </li>
                      <li>
                        <strong>Set Realistic Expectations:</strong> Prices reflect market consensus. If BOUND is 80%, it means the market thinks there's an 80% chance of staying in range
                      </li>
                      <li>
                        <strong>Use Limit Orders:</strong> On the orderbook, limit orders give you control over execution price and can save on slippage
                      </li>
                      <li>
                        <strong>Diversify:</strong> Don't put all your capital into a single market. Spread risk across different assets and timeframes
                      </li>
                    </ul>
                  </div>
                </div>
                
                {/* Section Navigation */}
                <div className="mt-12 pt-8 border-t border-zinc-800 flex items-center justify-between">
                  {prevSection ? (
                    <button
                      onClick={() => scrollToSection(prevSection.id)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-cyan-400 transition-colors group"
                    >
                      <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      {prevSection.title}
                    </button>
                  ) : (
                    <div></div>
                  )}
                  {nextSection ? (
                    <button
                      onClick={() => scrollToSection(nextSection.id)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-cyan-400 transition-colors group"
                    >
                      {nextSection.title}
                      <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ) : (
                    <div></div>
                  )}
                </div>
              </section>
              )}

              {/* Hedging Strategies Section */}
              {activeSection === "hedging" && (
              <section id="hedging" className="pb-8 md:pb-12 pt-4 md:pt-8">
                <h2 
                  className="text-xl md:text-2xl font-semibold mb-4 md:mb-6 text-zinc-100 group relative inline-block"
                  onMouseEnter={() => setHoveredLink("hedging")}
                  onMouseLeave={() => setHoveredLink(null)}
                >
                  Hedging Strategies
                  <button
                    onClick={() => copySectionLink("hedging")}
                    className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center text-cyan-400 hover:text-cyan-300"
                    title="Copy link"
                  >
                    <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </button>
                  {copiedLink === "hedging" && (
                    <span className="ml-2 text-xs md:text-sm text-cyan-400">Copied!</span>
                  )}
                </h2>
                
                <div className="space-y-8 text-zinc-300 leading-relaxed">
                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">What is Hedging?</h3>
                    <p className="mb-4">
                      <strong>Hedging</strong> is a risk management strategy where you take offsetting positions to reduce your overall exposure. 
                      On Brimdex, you can hedge by holding both BOUND and BREAK tokens in the same market, effectively creating a neutral position.
                    </p>
                    <div className="text-sm text-zinc-400 italic">
                      <p className="text-sm">
                        <strong>Example:</strong> If you hold 100 BOUND tokens and 100 BREAK tokens in an ETH market, 
                        you're hedged because one side will win and one will lose, regardless of the outcome. 
                        Your net position depends on the prices you paid for each side.
                      </p>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">Perfect Hedge (50/50 Split)</h3>
                    <p className="mb-4">
                      A <strong>perfect hedge</strong> occurs when you hold equal value in BOUND and BREAK tokens at the same price. 
                      This creates a risk-free position where you're guaranteed to break even (minus fees).
                    </p>
                    <div className="space-y-3">
                      <div className="text-sm text-zinc-400 italic">
                        <p className="text-sm mb-2"><strong>How it works:</strong></p>
                        <ul className="list-disc list-inside space-y-1 text-sm">
                          <li>Buy BOUND tokens when price is 50%</li>
                          <li>Buy BREAK tokens when price is 50%</li>
                          <li>Spend equal amounts on each side (e.g., $100 on BOUND, $100 on BREAK)</li>
                          <li>At expiry, one side wins and one loses, but you get back approximately what you put in</li>
                        </ul>
                      </div>
                      <p className="text-sm text-zinc-400">
                        <strong>Note:</strong> Due to the 2% protocol fee, even a perfect hedge will result in a small loss. 
                        However, this loss is predictable and much smaller than the risk of an unhedged position.
                      </p>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">Partial Hedging</h3>
                    <p className="mb-4">
                      You don't need to hedge perfectly. <strong>Partial hedging</strong> reduces risk while still maintaining directional exposure.
                    </p>
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold mb-2 text-cyan-400">Example: 70/30 Hedge</h4>
                        <p className="text-sm mb-2">
                          If you're bullish on BOUND but want to reduce risk:
                        </p>
                        <ul className="list-disc list-inside space-y-1 text-sm">
                          <li>Spend $70 on BOUND tokens (your main position)</li>
                          <li>Spend $30 on BREAK tokens (your hedge)</li>
                          <li>If BOUND wins, you profit but less than if you were 100% BOUND</li>
                          <li>If BREAK wins, you lose less than if you were 100% BOUND</li>
                        </ul>
                      </div>
                      <div className="text-sm text-zinc-400 italic">
                        <p className="text-sm">
                          <strong>Use Case:</strong> Partial hedging is useful when you have a strong conviction but want to protect against unexpected volatility or black swan events.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">Dynamic Hedging</h3>
                    <p className="mb-4">
                      <strong>Dynamic hedging</strong> involves adjusting your hedge ratio as prices move. This allows you to lock in profits or reduce losses.
                    </p>
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold mb-2 text-cyan-400">Scenario: BOUND Price Increases</h4>
                        <ol className="list-decimal list-inside space-y-2 text-sm">
                          <li>You bought BOUND at 50% for $100</li>
                          <li>BOUND price moves to 70% (your position is now worth more)</li>
                          <li>You can sell some BOUND tokens on the orderbook to lock in profit</li>
                          <li>Or buy BREAK tokens to hedge your remaining BOUND position</li>
                        </ol>
                      </div>
                      <div>
                        <h4 className="font-semibold mb-2 text-cyan-400">Scenario: BOUND Price Decreases</h4>
                        <ol className="list-decimal list-inside space-y-2 text-sm">
                          <li>You bought BOUND at 50% for $100</li>
                          <li>BOUND price drops to 30% (your position is losing value)</li>
                          <li>You can buy BREAK tokens to hedge, limiting further downside</li>
                          <li>Or exit entirely by selling BOUND on the orderbook</li>
                        </ol>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">Hedging Across Markets</h3>
                    <p className="mb-4">
                      You can also hedge by taking opposite positions in different markets or timeframes.
                    </p>
                    <div className="space-y-3">
                      <div>
                        <h4 className="font-semibold mb-2 text-cyan-400">Cross-Market Hedging</h4>
                        <p className="text-sm mb-2">
                          Take positions in different assets to diversify risk:
                        </p>
                        <ul className="list-disc list-inside space-y-1 text-sm">
                          <li>Buy BOUND in an ETH market</li>
                          <li>Buy BREAK in a BTC market</li>
                          <li>Reduces correlation risk if both assets move together</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-semibold mb-2 text-cyan-400">Timeframe Hedging</h4>
                        <p className="text-sm mb-2">
                          Spread positions across different expiry times:
                        </p>
                        <ul className="list-disc list-inside space-y-1 text-sm">
                          <li>Buy BOUND in a 24-hour market</li>
                          <li>Buy BREAK in a 7-day market for the same asset</li>
                          <li>Allows you to adjust strategy based on short-term vs long-term outlook</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">When to Hedge</h3>
                    <div className="space-y-3">
                      <ul className="list-disc list-inside space-y-2">
                        <li>
                          <strong>Protecting Profits:</strong> If your position is in profit and you want to lock in gains while maintaining some upside
                        </li>
                        <li>
                          <strong>Reducing Risk:</strong> When you have a large position and want to limit potential losses
                        </li>
                        <li>
                          <strong>Uncertainty:</strong> When you're unsure about direction but want to stay in the market
                        </li>
                        <li>
                          <strong>Approaching Expiry:</strong> As markets near expiry, hedging can protect against last-minute volatility
                        </li>
                      </ul>
                      <div className="text-sm text-red-400 italic mt-4">
                        <p className="text-sm">
                          <strong>Important:</strong> Hedging reduces both risk and potential reward. 
                          A perfectly hedged position will typically result in a small loss due to fees. 
                          Only hedge when the risk reduction is worth the cost.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">Hedging Costs</h3>
                    <p className="mb-4">
                      Understanding the costs of hedging helps you make informed decisions:
                    </p>
                    <ul className="list-disc list-inside space-y-2">
                      <li>
                        <strong>Protocol Fee:</strong> 2% fee on settlement affects both sides of your hedge
                      </li>
                      <li>
                        <strong>Orderbook Fees:</strong> 0.5% fee when trading on the orderbook (if you adjust your hedge)
                      </li>
                      <li>
                        <strong>Price Spread:</strong> The difference between BOUND and BREAK prices (they should sum to ~100%)
                      </li>
                      <li>
                        <strong>Gas Costs:</strong> Transaction fees on Somnia network for each trade
                      </li>
                    </ul>
                    <div className="text-sm text-zinc-400 italic mt-4">
                      <p className="text-sm">
                        <strong>Example Cost Calculation:</strong> If you hedge $100 on each side and the total pool is $1,000, 
                        the protocol fee is $20 (2%). If BOUND wins, you'd get back approximately $98 from your BOUND tokens 
                        and $0 from BREAK, for a net loss of $2 plus any orderbook fees if you adjusted positions.
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Section Navigation */}
                <div className="mt-12 pt-8 border-t border-zinc-800 flex items-center justify-between">
                  {prevSection ? (
                    <button
                      onClick={() => scrollToSection(prevSection.id)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-cyan-400 transition-colors group"
                    >
                      <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      {prevSection.title}
                    </button>
                  ) : (
                    <div></div>
                  )}
                  {nextSection ? (
                    <button
                      onClick={() => scrollToSection(nextSection.id)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-cyan-400 transition-colors group"
                    >
                      {nextSection.title}
                      <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ) : (
                    <div></div>
                  )}
                </div>
              </section>
              )}

              {/* Market Schedules Section */}
              {activeSection === "market-schedules" && (
              <section id="market-schedules" className="pb-8 md:pb-12 pt-4 md:pt-8">
                <h2 
                  className="text-xl md:text-2xl font-semibold mb-4 md:mb-6 text-zinc-100 group relative inline-block"
                  onMouseEnter={() => setHoveredLink("market-schedules")}
                  onMouseLeave={() => setHoveredLink(null)}
                >
                  Market Schedules
                  <button
                    onClick={() => copySectionLink("market-schedules")}
                    className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center text-cyan-400 hover:text-cyan-300"
                    title="Copy link"
                  >
                    <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </button>
                  {copiedLink === "market-schedules" && (
                    <span className="ml-2 text-xs md:text-sm text-cyan-400">Copied!</span>
                  )}
                </h2>
                
                <div className="space-y-8 text-zinc-300 leading-relaxed">
                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">How Markets Are Created</h3>
                    <p className="mb-4">
                      Brimdex markets are created on a fixed schedule to ensure consistency and predictability. 
                      All markets start at <strong>00:00 UTC</strong> (midnight UTC) to align with global trading hours.
                    </p>
                    <div className="text-sm text-zinc-400 italic">
                      <p className="text-sm">
                        <strong>Why UTC?</strong> UTC (Coordinated Universal Time) is the global standard time. 
                        Using UTC ensures that market creation times are consistent worldwide, regardless of your local timezone.
                      </p>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">24-Hour Markets</h3>
                    <div className="space-y-4">
                      <p>
                        <strong>24-hour markets</strong> are created <strong>every day at 00:00 UTC</strong>. 
                        These markets expire exactly 24 hours later at the next day's 00:00 UTC.
                      </p>
                      <div className="text-sm text-zinc-400 italic">
                        <p className="text-sm mb-2"><strong>Example Schedule:</strong></p>
                        <ul className="list-disc list-inside space-y-1 text-sm">
                          <li>Monday, Jan 1 at 00:00 UTC → Market created, expires Tuesday, Jan 2 at 00:00 UTC</li>
                          <li>Tuesday, Jan 2 at 00:00 UTC → New market created, expires Wednesday, Jan 3 at 00:00 UTC</li>
                          <li>And so on, every single day</li>
                        </ul>
                      </div>
                      <div className="text-sm text-zinc-400 italic">
                        <p className="text-sm">
                          <strong>Best For:</strong> Short-term traders, day traders, and those looking for quick market movements. 
                          These markets are highly liquid and offer frequent trading opportunities.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">7-Day Markets</h3>
                    <div className="space-y-4">
                      <p>
                        <strong>7-day markets</strong> are created <strong>every Monday at 00:00 UTC</strong>. 
                        These markets expire exactly 7 days later on the following Monday at 00:00 UTC.
                      </p>
                      <div className="text-sm text-zinc-400 italic">
                        <p className="text-sm mb-2"><strong>Example Schedule:</strong></p>
                        <ul className="list-disc list-inside space-y-1 text-sm">
                          <li>Monday, Jan 1 at 00:00 UTC → Market created, expires Monday, Jan 8 at 00:00 UTC</li>
                          <li>Monday, Jan 8 at 00:00 UTC → New market created, expires Monday, Jan 15 at 00:00 UTC</li>
                          <li>Continues every Monday</li>
                        </ul>
                      </div>
                      <div className="text-sm text-zinc-400 italic">
                        <p className="text-sm">
                          <strong>Best For:</strong> Swing traders and those who prefer weekly analysis cycles. 
                          These markets capture weekly trends and are less affected by daily volatility.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">30-Day Markets</h3>
                    <div className="space-y-4">
                      <p>
                        <strong>30-day markets</strong> are created <strong>on the 1st of each month at 00:00 UTC</strong>. 
                        These markets expire exactly 30 days later (or on the last day of the month if it's shorter).
                      </p>
                      <div className="text-sm text-zinc-400 italic">
                        <p className="text-sm mb-2"><strong>Example Schedule:</strong></p>
                        <ul className="list-disc list-inside space-y-1 text-sm">
                          <li>January 1 at 00:00 UTC → Market created, expires February 1 at 00:00 UTC</li>
                          <li>February 1 at 00:00 UTC → New market created, expires March 1 at 00:00 UTC</li>
                          <li>Continues on the 1st of every month</li>
                        </ul>
                      </div>
                      <div className="text-sm text-zinc-400 italic">
                        <p className="text-sm">
                          <strong>Best For:</strong> Position traders and those with longer-term outlooks. 
                          These markets capture monthly trends and major market movements.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">Understanding Market Availability</h3>
                    <div className="space-y-4">
                      <p>
                        Markets are only available for trading <strong>before they expire</strong>. Once a market expires, 
                        trading stops and you must wait for settlement before redeeming winning positions.
                      </p>
                      <ul className="list-disc list-inside space-y-2">
                        <li>
                          <strong>Active Markets:</strong> Markets that haven't reached their expiry time are active and can be traded
                        </li>
                        <li>
                          <strong>Expired Markets:</strong> Markets past their expiry time are closed to new trades but await settlement
                        </li>
                        <li>
                          <strong>Settled Markets:</strong> Markets that have been settled allow winners to redeem their tokens
                        </li>
                      </ul>
                      <div className="text-sm text-red-400 italic mt-4">
                        <p className="text-sm">
                          <strong>Important:</strong> Always check the expiry time before entering a position. 
                          You cannot exit a position after expiry—you must wait for settlement and redemption.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">Time Zone Conversion</h3>
                    <p className="mb-4">
                      Since all markets use UTC, you may need to convert to your local timezone:
                    </p>
                    <div className="text-sm text-zinc-400 italic">
                      <p className="text-sm mb-2"><strong>Common UTC Conversions:</strong></p>
                      <ul className="list-disc list-inside space-y-1 text-sm">
                        <li><strong>EST (US East Coast):</strong> UTC-5 (winter) or UTC-4 (summer) → 00:00 UTC = 7:00 PM EST (previous day) or 8:00 PM EDT</li>
                        <li><strong>PST (US West Coast):</strong> UTC-8 (winter) or UTC-7 (summer) → 00:00 UTC = 4:00 PM PST (previous day) or 5:00 PM PDT</li>
                        <li><strong>GMT (UK):</strong> UTC+0 (winter) or UTC+1 (summer) → 00:00 UTC = 12:00 AM GMT or 1:00 AM BST</li>
                        <li><strong>JST (Japan):</strong> UTC+9 → 00:00 UTC = 9:00 AM JST (same day)</li>
                      </ul>
                    </div>
                    <p className="text-sm text-zinc-400 mt-4">
                      <strong>Tip:</strong> Use a timezone converter or set your device to show UTC time to avoid confusion.
                    </p>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">Market Creation Process</h3>
                    <p className="mb-4">
                      When a new market is created, it goes through the following process:
                    </p>
                    <ol className="list-decimal list-inside space-y-3">
                      <li>
                        <strong>Market Initialization:</strong> The market is created with a price range based on the current asset price
                      </li>
                      <li>
                        <strong>Bootstrap Liquidity:</strong> Initial liquidity is added to both BOUND and BREAK pools, setting starting prices at 50/50
                      </li>
                      <li>
                        <strong>Trading Opens:</strong> The market becomes available for trading immediately after creation
                      </li>
                      <li>
                        <strong>Price Discovery:</strong> As traders enter, prices adjust based on market sentiment
                      </li>
                      <li>
                        <strong>Expiry:</strong> At the scheduled expiry time, trading stops and settlement begins
                      </li>
                    </ol>
                  </div>
                </div>
                
                {/* Section Navigation */}
                <div className="mt-12 pt-8 border-t border-zinc-800 flex items-center justify-between">
                  {prevSection ? (
                    <button
                      onClick={() => scrollToSection(prevSection.id)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-cyan-400 transition-colors group"
                    >
                      <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      {prevSection.title}
                    </button>
                  ) : (
                    <div></div>
                  )}
                  {nextSection ? (
                    <button
                      onClick={() => scrollToSection(nextSection.id)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-cyan-400 transition-colors group"
                    >
                      {nextSection.title}
                      <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ) : (
                    <div></div>
                  )}
                </div>
              </section>
              )}

              {/* Supported Assets Section */}
              {activeSection === "supported-assets" && (
              <section id="supported-assets" className="pb-8 md:pb-12 pt-4 md:pt-8">
                <h2 
                  className="text-xl md:text-2xl font-semibold mb-4 md:mb-6 text-zinc-100 group relative inline-block"
                  onMouseEnter={() => setHoveredLink("supported-assets")}
                  onMouseLeave={() => setHoveredLink(null)}
                >
                  Supported Assets
                  <button
                    onClick={() => copySectionLink("supported-assets")}
                    className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center text-cyan-400 hover:text-cyan-300"
                    title="Copy link"
                  >
                    <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </button>
                  {copiedLink === "supported-assets" && (
                    <span className="ml-2 text-xs md:text-sm text-cyan-400">Copied!</span>
                  )}
                </h2>
                
                <div className="space-y-8 text-zinc-300 leading-relaxed">
                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">Available Markets</h3>
                    <p className="mb-4">
                      Brimdex currently supports trading on the following cryptocurrencies. Each asset has markets available in 24-hour, 7-day, and 30-day timeframes.
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                      {/* BTC */}
                      <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-5">
                        <div className="flex items-center gap-3 mb-3">
                          <img 
                            src="https://assets.coingecko.com/coins/images/1/large/bitcoin.png" 
                            alt="Bitcoin" 
                            className="w-10 h-10 rounded-full"
                          />
                          <div>
                            <h4 className="text-lg font-semibold text-white">Bitcoin</h4>
                            <p className="text-sm text-zinc-400">BTC</p>
                          </div>
                        </div>
                        <p className="text-sm text-zinc-300">
                          The original cryptocurrency and digital gold. Bitcoin markets track BTC/USD price movements with high liquidity and volatility.
                        </p>
                      </div>

                      {/* ETH */}
                      <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-5">
                        <div className="flex items-center gap-3 mb-3">
                          <img 
                            src="https://assets.coingecko.com/coins/images/279/large/ethereum.png" 
                            alt="Ethereum" 
                            className="w-10 h-10 rounded-full"
                          />
                          <div>
                            <h4 className="text-lg font-semibold text-white">Ethereum</h4>
                            <p className="text-sm text-zinc-400">ETH</p>
                          </div>
                        </div>
                        <p className="text-sm text-zinc-300">
                          The leading smart contract platform. Ethereum markets offer active trading with strong correlation to DeFi and NFT trends.
                        </p>
                      </div>

                      {/* SOL */}
                      <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-5">
                        <div className="flex items-center gap-3 mb-3">
                          <img 
                            src="https://assets.coingecko.com/coins/images/4128/large/solana.png" 
                            alt="Solana" 
                            className="w-10 h-10 rounded-full"
                          />
                          <div>
                            <h4 className="text-lg font-semibold text-white">Solana</h4>
                            <p className="text-sm text-zinc-400">SOL</p>
                          </div>
                        </div>
                        <p className="text-sm text-zinc-300">
                          High-performance blockchain known for fast transactions and low fees. Solana markets reflect ecosystem growth and adoption.
                        </p>
                      </div>

                      {/* SOMI */}
                      <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-5">
                        <div className="flex items-center gap-3 mb-3">
                          <img 
                            src="https://s2.coinmarketcap.com/static/img/coins/64x64/37637.png" 
                            alt="Somnia" 
                            className="w-10 h-10 rounded-full"
                            onError={(e) => {
                              // Fallback to CoinGecko
                              const target = e.target as HTMLImageElement;
                              target.src = "https://assets.coingecko.com/coins/images/37637/large/somnia.png";
                              target.onerror = () => {
                                // Final fallback - use a placeholder
                                target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect fill='%2306b6d4' width='40' height='40'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='white' font-size='20' font-weight='bold'%3ES%3C/text%3E%3C/svg%3E";
                              };
                            }}
                          />
                          <div>
                            <h4 className="text-lg font-semibold text-white">Somnia</h4>
                            <p className="text-sm text-zinc-400">SOMI</p>
                          </div>
                        </div>
                        <p className="text-sm text-zinc-300">
                          The native token of the Somnia network where Brimdex operates. Somnia markets track the platform's native asset performance.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">Coming Soon</h3>
                    <p className="mb-4">
                      We're continuously expanding our asset coverage. Additional cryptocurrencies will be added based on community demand and liquidity requirements.
                    </p>
                    <p className="text-sm mb-2"><strong>Planned additions include:</strong></p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-zinc-300 ml-4">
                      <li><strong>BNB</strong> (Binance Coin) - Exchange token with strong utility</li>
                      <li><strong>LINK</strong> (Chainlink) - Leading oracle network token</li>
                      <li><strong>AAVE</strong> - Major DeFi lending protocol token</li>
                      <li>And more based on community feedback</li>
                    </ul>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">Asset Selection Criteria</h3>
                    <p className="mb-4">
                      Assets are selected for Brimdex based on several important factors:
                    </p>
                    <ul className="list-disc list-inside space-y-2">
                      <li>
                        <strong>Liquidity:</strong> Sufficient trading volume to support active markets
                      </li>
                      <li>
                        <strong>Price Data Availability:</strong> Reliable oracle price feeds for accurate settlement
                      </li>
                      <li>
                        <strong>Market Cap:</strong> Established assets with proven track records
                      </li>
                      <li>
                        <strong>Community Demand:</strong> Interest from traders and the Brimdex community
                      </li>
                      <li>
                        <strong>Volatility:</strong> Appropriate price movements to create meaningful trading opportunities
                      </li>
                    </ul>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">Price Range Standards</h3>
                    <p className="mb-4">
                      Each asset uses standardized price ranges to ensure consistency across markets:
                    </p>
                    <div className="space-y-3">
                      <div className="text-sm text-zinc-400 italic">
                        <p className="text-sm">
                          <strong>Default Range:</strong> Most markets use a ±3% range around the starting price. 
                          This means if an asset starts at $100, the BOUND range would be $97 - $103.
                        </p>
                      </div>
                      <p className="text-sm text-zinc-400">
                        Range percentages may vary slightly based on asset volatility and market conditions at the time of creation. 
                        Always check the specific lower and upper bounds for each market before trading.
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Section Navigation */}
                <div className="mt-12 pt-8 border-t border-zinc-800 flex items-center justify-between">
                  {prevSection ? (
                    <button
                      onClick={() => scrollToSection(prevSection.id)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-cyan-400 transition-colors group"
                    >
                      <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      {prevSection.title}
                    </button>
                  ) : (
                    <div></div>
                  )}
                  {nextSection ? (
                    <button
                      onClick={() => scrollToSection(nextSection.id)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-cyan-400 transition-colors group"
                    >
                      {nextSection.title}
                      <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ) : (
                    <div></div>
                  )}
                </div>
              </section>
              )}

              {/* Settlement & Redemption Section */}
              {activeSection === "settlement" && (
              <section id="settlement" className="pb-8 md:pb-12 pt-4 md:pt-8">
                <h2 
                  className="text-xl md:text-2xl font-semibold mb-4 md:mb-6 text-zinc-100 group relative inline-block"
                  onMouseEnter={() => setHoveredLink("settlement")}
                  onMouseLeave={() => setHoveredLink(null)}
                >
                  Settlement & Redemption
                  <button
                    onClick={() => copySectionLink("settlement")}
                    className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center text-cyan-400 hover:text-cyan-300"
                    title="Copy link"
                  >
                    <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </button>
                  {copiedLink === "settlement" && (
                    <span className="ml-2 text-xs md:text-sm text-cyan-400">Copied!</span>
                  )}
                </h2>
                
                <div className="space-y-8 text-zinc-300 leading-relaxed">
                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">What Happens at Expiry</h3>
                    <p className="mb-4">
                      When a market reaches its expiry time, trading stops and the settlement process begins automatically.
                    </p>
                    <ol className="list-decimal list-inside space-y-3">
                      <li>
                        <strong>Trading Closes:</strong> No new trades can be placed, and existing orders on the orderbook are cancelled
                      </li>
                      <li>
                        <strong>Price Determination:</strong> The settlement system fetches the final price from a trusted oracle (CoinGecko or Chainlink)
                      </li>
                      <li>
                        <strong>Winner Determination:</strong> The system checks if the final price is within the range (BOUND wins) or outside (BREAK wins)
                      </li>
                      <li>
                        <strong>Redemption Rate Calculation:</strong> The system calculates how much USDC each winning token is worth
                      </li>
                      <li>
                        <strong>Fee Deduction:</strong> A 2% protocol fee is deducted from the total pool before calculating payouts
                      </li>
                    </ol>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">Understanding Redemption Rates</h3>
                    <p className="mb-4">
                      The <strong>redemption rate</strong> determines how much USDC you receive for each winning token you hold.
                    </p>
                    <div className="space-y-4">
                      <div className="text-sm text-zinc-400 italic">
                        <p className="text-sm mb-2"><strong>Formula:</strong></p>
                        <p className="text-sm font-mono text-zinc-400 p-2">
                          Redemption Rate = (Total Pool - Protocol Fee) ÷ Total Winning Tokens
                        </p>
                      </div>
                      <div className="text-sm text-zinc-400 italic">
                        <p className="text-sm mb-2"><strong>Example:</strong></p>
                        <ul className="list-disc list-inside space-y-1 text-sm">
                          <li>Total pool: $1,000</li>
                          <li>Protocol fee (2%): $20</li>
                          <li>Winnings: $980</li>
                          <li>Total BOUND tokens (if BOUND wins): 1,000 tokens</li>
                          <li>Redemption rate: $980 ÷ 1,000 = $0.98 per token</li>
                        </ul>
                        <p className="text-sm mt-2">
                          If you hold 100 BOUND tokens, you'd receive: 100 × $0.98 = $98 USDC
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">How to Redeem</h3>
                    <p className="mb-4">
                      Once a market is settled, winners can redeem their tokens for USDC:
                    </p>
                    <ol className="list-decimal list-inside space-y-3">
                      <li>
                        <strong>Check Settlement Status:</strong> Verify that the market shows as "Settled" and which side won (BOUND or BREAK)
                      </li>
                      <li>
                        <strong>View Your Holdings:</strong> Check your positions page to see how many winning tokens you hold
                      </li>
                      <li>
                        <strong>Approve Tokens (First Time):</strong> If this is your first redemption, approve the market contract to burn your tokens
                      </li>
                      <li>
                        <strong>Select Amount:</strong> Choose how many tokens to redeem (you can redeem all or partial amounts)
                      </li>
                      <li>
                        <strong>Confirm Redemption:</strong> Submit the transaction. Your tokens will be burned and USDC will be transferred to your wallet
                      </li>
                    </ol>
                    <div className="text-sm text-zinc-400 italic mt-4">
                      <p className="text-sm">
                        <strong>Tip:</strong> You can redeem your tokens anytime after settlement. There's no time limit, so you can wait for lower gas fees if needed.
                      </p>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">What Happens to Losing Tokens</h3>
                    <p className="mb-4">
                      If you hold tokens on the losing side, they become worthless after settlement:
                    </p>
                    <ul className="list-disc list-inside space-y-2">
                      <li>Losing tokens cannot be redeemed for any USDC</li>
                      <li>They remain in your wallet but have no value</li>
                      <li>You can keep them as a reminder or burn them to clean up your wallet (optional)</li>
                      <li>The protocol does not automatically remove losing tokens</li>
                    </ul>
                    <div className="text-sm text-red-400 italic mt-4">
                      <p className="text-sm">
                        <strong>Important:</strong> Always check which side won before attempting to redeem. 
                        Trying to redeem losing tokens will fail and waste gas fees.
                      </p>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">Settlement Timing</h3>
                    <div className="space-y-4">
                      <p>
                        Settlement happens automatically shortly after market expiry:
                      </p>
                      <ul className="list-disc list-inside space-y-2">
                        <li>
                          <strong>Automatic Process:</strong> A settlement bot monitors markets and settles them when they expire
                        </li>
                        <li>
                          <strong>Oracle Price:</strong> The final price is fetched from a trusted oracle at the time of settlement
                        </li>
                        <li>
                          <strong>Typical Delay:</strong> Settlement usually occurs within minutes of expiry, but can take longer during network congestion
                        </li>
                        <li>
                          <strong>No Manual Action Required:</strong> You don't need to do anything—just wait for settlement to complete
                        </li>
                      </ul>
                      <div className="text-sm text-zinc-400 italic">
                        <p className="text-sm">
                          <strong>Note:</strong> The settlement bot uses reliable oracle sources (CoinGecko, Chainlink) to ensure accurate price determination. 
                          The price used is the spot price at the time of settlement, not necessarily the exact price at 00:00 UTC.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-zinc-800 space-y-4">
                    <h3 className="text-lg md:text-xl font-medium text-cyan-400">Partial Redemption</h3>
                    <p className="mb-4">
                      You don't have to redeem all your winning tokens at once. Partial redemption allows you to:
                    </p>
                    <ul className="list-disc list-inside space-y-2">
                      <li>Redeem some tokens now and keep others for later</li>
                      <li>Manage your cash flow by redeeming as needed</li>
                      <li>Save on gas fees by batching redemptions</li>
                      <li>Maintain a position if you believe the redemption rate might change (it won't—it's fixed at settlement)</li>
                    </ul>
                    <p className="text-sm text-zinc-400 mt-4">
                      <strong>Remember:</strong> The redemption rate is fixed at settlement and never changes. 
                      Redeeming 50 tokens now or later will give you the same amount of USDC.
                    </p>
                  </div>
                </div>
                
                {/* Section Navigation */}
                <div className="mt-12 pt-8 border-t border-zinc-800 flex items-center justify-between">
                  {prevSection ? (
                    <button
                      onClick={() => scrollToSection(prevSection.id)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-cyan-400 transition-colors group"
                    >
                      <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      {prevSection.title}
                    </button>
                  ) : (
                    <div></div>
                  )}
                  {nextSection ? (
                    <button
                      onClick={() => scrollToSection(nextSection.id)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-cyan-400 transition-colors group"
                    >
                      {nextSection.title}
                      <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ) : (
                    <div></div>
                  )}
                </div>
              </section>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Link Status Bar (like browser) */}
      {hoveredLink && (
        <div className="fixed bottom-0 left-0 right-0 bg-zinc-900/95 border-t border-zinc-800 px-4 py-2 text-xs text-zinc-400 z-50">
          <div className="max-w-7xl mx-auto truncate">
            {typeof window !== 'undefined' && getSectionLink(hoveredLink)}
          </div>
        </div>
      )}
    </div>
  );
}
