/**
 * Dynamic pricing utilities for paid slot seats.
 *
 * Modes:
 *  "fixed"   — always paidSlotPrice (original behaviour)
 *  "dynamic" — price = clamp(paidSlotPrice × (1 + occupancy × surgeFactor), minPrice, maxPrice)
 *
 * Flash sale overrides everything when flashSaleEnabled=true and not yet expired/sold out.
 */

export interface PricingInput {
  paidSlotPrice: number;
  pricingMode: string;
  minPriceUsd: number;
  maxPriceUsd: number;
  surgeFactor: number;
  flashSaleEnabled: boolean;
  flashSalePrice: number | null | undefined;
  flashSaleLabel: string | null | undefined;
  flashSaleEndsAt: Date | null | undefined;
  flashSaleSeatsTotal: number | null | undefined;
  flashSaleSeatsSold: number;
  activePaidSlots: number;
  paidSlotCapacity: number;
}

export interface PricingResult {
  currentPrice: number;
  basePrice: number;
  mode: "fixed" | "dynamic" | "flash_sale";
  flashSaleActive: boolean;
  flashSaleLabel: string | null;
  flashSaleEndsAt: Date | null;
  flashSaleSeatsRemaining: number | null;
  surgeMultiplier: number | null;
  occupancyRate: number;
}

export function calculateCurrentPrice(agent: PricingInput): PricingResult {
  const occupancyRate = agent.paidSlotCapacity > 0
    ? Math.min(1, agent.activePaidSlots / agent.paidSlotCapacity)
    : 0;

  // Flash sale check
  const now = new Date();
  const flashActive =
    agent.flashSaleEnabled &&
    !!agent.flashSalePrice &&
    agent.flashSalePrice > 0 &&
    (agent.flashSaleEndsAt == null || agent.flashSaleEndsAt > now) &&
    (agent.flashSaleSeatsTotal == null || agent.flashSaleSeatsSold < agent.flashSaleSeatsTotal);

  if (flashActive) {
    const seatsRemaining =
      agent.flashSaleSeatsTotal != null
        ? agent.flashSaleSeatsTotal - agent.flashSaleSeatsSold
        : null;
    return {
      currentPrice: agent.flashSalePrice!,
      basePrice: agent.paidSlotPrice,
      mode: "flash_sale",
      flashSaleActive: true,
      flashSaleLabel: agent.flashSaleLabel ?? "Flash Sale",
      flashSaleEndsAt: agent.flashSaleEndsAt ?? null,
      flashSaleSeatsRemaining: seatsRemaining,
      surgeMultiplier: null,
      occupancyRate,
    };
  }

  if (agent.pricingMode === "dynamic") {
    const multiplier = 1 + occupancyRate * (agent.surgeFactor ?? 1);
    const rawPrice = agent.paidSlotPrice * multiplier;
    const clamped = Math.min(agent.maxPriceUsd, Math.max(agent.minPriceUsd, rawPrice));
    const currentPrice = Math.round(clamped * 100) / 100;
    return {
      currentPrice,
      basePrice: agent.paidSlotPrice,
      mode: "dynamic",
      flashSaleActive: false,
      flashSaleLabel: null,
      flashSaleEndsAt: null,
      flashSaleSeatsRemaining: null,
      surgeMultiplier: Math.round(multiplier * 100) / 100,
      occupancyRate,
    };
  }

  // fixed (default)
  return {
    currentPrice: agent.paidSlotPrice,
    basePrice: agent.paidSlotPrice,
    mode: "fixed",
    flashSaleActive: false,
    flashSaleLabel: null,
    flashSaleEndsAt: null,
    flashSaleSeatsRemaining: null,
    surgeMultiplier: null,
    occupancyRate,
  };
}
