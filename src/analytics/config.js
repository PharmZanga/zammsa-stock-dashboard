export const DEFAULT_POLICY = Object.freeze({
  understockMos: 2,
  adequateMaxMos: 4,
  excessMos: 12,
});

export const DEFAULT_ANALYTICS_CONFIG = Object.freeze({
  location: "Central",
  daysPerMonth: 30.4375,
  forecastHorizonMonths: 3,
  forecastSeasonalPeriod: 6,
  reorderSafetyFactor: 1.15,
  confidenceZ: 1.96,
  serviceLevelZ: 1.645,
  leadTimeDays: 60,
  reviewPeriodDays: 30,
  stagnantDays: 90,
  annualCarryingCostRate: 0.25,
  policy: DEFAULT_POLICY,
});

export function mergeAnalyticsConfig(overrides = {}) {
  return {
    ...DEFAULT_ANALYTICS_CONFIG,
    ...overrides,
    policy: { ...DEFAULT_POLICY, ...(overrides.policy || {}) },
  };
}
