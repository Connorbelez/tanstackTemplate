/**
 * FairLend Design System Components
 *
 * A comprehensive component library for the FairLend lending platform.
 *
 * @packageDocumentation
 *
 * ## Structure
 *
 * - `@/components/navigation` - Navigation components (TopNav, MobileNav, DashboardNav)
 * - `@/components/listings` - Listings page components (ListingCard, ListingGrid, ListingFilters, ListingMap)
 * - `@/components/detail` - Listing detail components (HeroSection, FinancialsGrid, AppraisalCard, InvestmentCheckout, SimilarListings)
 * - `@/components/dashboard` - Dashboard components (StatCard, PerformanceChart, PositionsTable, Timeline)
 * - `@/components/shared` - Shared/reusable components (FilterChip, MetricBadge, StatusBadge, Pagination, DocumentRow)
 *
 * ## Usage
 *
 * ```tsx
 * import { TopNav } from '@/components/navigation';
 * import { ListingCard, ListingGrid } from '@/components/listings';
 * import { HeroSection, FinancialsGrid } from '@/components/detail';
 * import { StatCard, PerformanceChart } from '@/components/dashboard';
 * import { StatusBadge, Pagination } from '@/components/shared';
 * ```
 */

// biome-ignore lint/performance/noBarrelFile: design system barrel export
export * from "./dashboard";
export * from "./detail";
export * from "./listings";
export * from "./navigation";
export * from "./shared";
