# FairLend Design System - Component Reference

Based on analysis of 5 screens from the FairLend design file:
1. Listing Detail Page (Desktop)
2. Listing Detail — Mobile
3. Listings Page (Desktop)
4. Listings — Mobile
5. Lender Portfolio Dashboard

## Directory Structure

```
src/components/
├── index.ts              # Main exports
├── navigation/
│   ├── index.ts
│   ├── TopNav.tsx       # Desktop navigation
│   ├── MobileNav.tsx     # Mobile navigation
│   └── DashboardNav.tsx # Dashboard sidebar
├── listings/
│   ├── index.ts
│   ├── ListingCard.tsx    # Property preview card
│   ├── ListingGrid.tsx    # Grid layout
│   ├── ListingFilters.tsx # Search & filters
│   └── ListingMap.tsx     # Map panel
├── detail/
│   ├── index.ts
│   ├── HeroSection.tsx        # Image carousel + map
│   ├── FinancialsGrid.tsx     # Financial metrics
│   ├── AppraisalCard.tsx      # Appraisal info
│   ├── InvestmentCheckout.tsx  # Investment CTA
│   └── SimilarListings.tsx    # Related listings
├── dashboard/
│   ├── index.ts
│   ├── StatCard.tsx          # Metric card
│   ├── PerformanceChart.tsx  # Returns chart
│   ├── PositionsTable.tsx    # Holdings table
│   └── Timeline.tsx          # Activity feed
└── shared/
    ├── index.ts
    ├── FilterChip.tsx      # Filter tag
    ├── MetricBadge.tsx    # Metric display
    ├── StatusBadge.tsx    # Status indicator
    ├── Pagination.tsx     # Page nav
    └── DocumentRow.tsx    # Document item
```

## Component Usage

### Navigation

```tsx
import { TopNav, MobileNav, DashboardNav } from '@/components/navigation';

<TopNav 
  logo="/logo.svg"
  links={[
    { label: 'Listings', href: '/listings', active: true },
    { label: 'Dashboard', href: '/dashboard' }
  ]}
  userMenu={{
    name: 'John Doe',
    avatar: 'https://example.com/avatar.jpg',
    onSignOut: () => {}
  }}
/>

<MobileNav 
  logo="/logo.svg"
  onMenuToggle={() => {}}
/>

<DashboardNav 
  user={{ name: 'John', avatar: '...' }}
  items={[
    { label: 'Portfolio', href: '/dashboard', icon: 'portfolio' },
    { label: 'Payments', href: '/dashboard/payments', icon: 'payments' }
  ]}
  activeItem="portfolio"
/>
```

### Listings

```tsx
import { ListingCard, ListingGrid, ListingFilters, ListingMap } from '@/components/listings';

<ListingCard
  id="123"
  title="Downtown Mixed-Use Property"
  price={2500000}
  image="https://example.com/property.jpg"
  status="active"
  metrics={{ ltv: 65, rate: 8.5, term: 24 }}
  address="123 Main St, New York, NY"
  onClick={() => navigate(`/listings/${id}`)}
/>

<ListingGrid
  listings={[]}
  columns={3}
  loading={false}
  emptyMessage="No listings found"
/>

<ListingFilters
  searchQuery=""
  onSearchChange={(q) => {}}
  filters={{ propertyType: [], ltv: {}, rate: {}, term: [] }}
  onFilterChange={(f) => {}}
  activeFilters={{}}
  onRemoveFilter={(k) => {}}
  onClearAll={() => {}}
/>

<ListingMap
  pins={[{ id: '1', lat: 40.7, lng: -74, price: 2500000 }]}
  center={{ lat: 40.7, lng: -74 }}
  zoom={12}
  onPinClick={(pin) => {}}
/>
```

### Detail

```tsx
import { 
  HeroSection, 
  FinancialsGrid, 
  AppraisalCard, 
  InvestmentCheckout,
  SimilarListings 
} from '@/components/detail';

<HeroSection
  images={['/img1.jpg', '/img2.jpg']}
  title="Downtown Mixed-Use Property"
  address="123 Main St, New York, NY"
  mapLocation={{ lat: 40.7, lng: -74 }}
/>

<FinancialsGrid
  metrics={[
    { label: 'Loan Amount', value: 2500000, format: 'currency' },
    { label: 'LTV', value: 65, format: 'percent' },
    { label: 'Rate', value: 8.5, format: 'percent' },
    { label: 'Term', value: 24, format: 'months' }
  ]}
/>

<AppraisalCard
  appraisedValue={3500000}
  appraisalDate="2024-01-15"
  propertyType="Mixed-Use"
  squareFootage={15000}
/>

<InvestmentCheckout
  listingId="123"
  price={2500000}
  minInvestment={10000}
  maxInvestment={250000}
  availableFractions={100}
  onInvest={(amount) => {}}
/>

<SimilarListings
  listings={[]}
  title="Similar Listings"
  onListingClick={(id) => {}}
/>
```

### Dashboard

```tsx
import { StatCard, PerformanceChart, PositionsTable, Timeline } from '@/components/dashboard';

<StatCard
  label="Total Invested"
  value={1250000}
  format="currency"
  trend={{ value: 12.5, direction: 'up' }}
/>

<PerformanceChart
  data={[{ date: '2024-01', value: 50000 }]}
  type="line"
  metric="returns"
  timeframe="1Y"
/>

<PositionsTable
  positions={[
    { 
      id: '1', 
      propertyName: 'Property A', 
      investmentAmount: 50000, 
      currentValue: 55000,
      return: 10,
      status: 'active'
    }
  ]}
  sortBy="return"
  sortDirection="desc"
/>

<Timeline
  events={[
    { 
      id: '1', 
      type: 'payment', 
      title: 'Payment Received', 
      amount: 1500, 
      date: '2024-02-01' 
    }
  ]}
/>
```

### Shared

```tsx
import { FilterChip, MetricBadge, StatusBadge, Pagination, DocumentRow } from '@/components/shared';

<FilterChip label="Property Type" value="Mixed-Use" onRemove={() => {}} />

<MetricBadge label="LTV" value={65} format="percent" />

<StatusBadge status="active" label="Active" />

<Pagination currentPage={1} totalPages={10} onPageChange={(p) => {}} />

<DocumentRow 
  name="Purchase Agreement" 
  type="PDF" 
  date="2024-01-15" 
  size="2.5 MB"
  onDownload={() => {}}
/>
```

## Screen to Component Mapping

### Listing Detail Page (Desktop)
- TopNav (from navigation)
- HeroSection (detail)
- Thumbnails (embedded in HeroSection)
- FinancialsGrid (detail)
- AppraisalCard (detail)
- DocumentsSection (uses DocumentRow from shared)
- InvestmentCheckout (detail)
- SimilarListings (detail)

### Listings Page (Desktop)
- TopNav (navigation)
- ListingFilters (listings)
- ListingGrid (listings)
- ListingMap (listings)
- Pagination (shared)

### Listing Detail Mobile
- MobileNav (navigation)
- HeroSection (detail)
- Mobile variants of detail components

### Listings Mobile
- MobileNav (navigation)
- Mobile variants of listings components

### Lender Portfolio Dashboard
- DashboardNav (navigation)
- StatCard (dashboard) x4
- PerformanceChart (dashboard)
- PositionsTable (dashboard)
- Timeline (dashboard)
- DocumentRow (shared)

## Notes

- All components currently throw `Error('Component not implemented yet')` as placeholders
- Components are designed to match the FairLend design file specifications
- Props interfaces are fully typed with TypeScript
- Components support the variants and options identified in the design analysis
