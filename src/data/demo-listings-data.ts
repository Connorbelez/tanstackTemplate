export interface DemoListing {
	id: string;
	title: string;
	address: string;
	imageSrc: string;
	lat: number;
	lng: number;
	ltv: number;
	apr: number;
	principal: number;
	marketValue: number;
	mortgageType: "First" | "Second" | "Other";
	propertyType: string;
	maturityDate: Date;
	locked?: boolean;
	availablePercent?: number;
	lockedPercent?: number;
	soldPercent?: number;
}

function createLocalDate(isoDate: `${number}-${number}-${number}`) {
	const [year, month, day] = isoDate.split("-").map(Number);

	return new Date(year, month - 1, day);
}

function createListingImage(title: string, accent: string, skyline: string) {
	const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fbfdff" />
          <stop offset="55%" stop-color="${accent}" />
          <stop offset="100%" stop-color="#13222d" />
        </linearGradient>
        <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(255,255,255,0.9)" />
          <stop offset="100%" stop-color="rgba(255,255,255,0.2)" />
        </linearGradient>
      </defs>
      <rect width="1200" height="800" fill="url(#sky)" />
      <circle cx="980" cy="155" r="88" fill="rgba(255,255,255,0.35)" />
      <path d="M0 610 C170 520 300 520 430 620 S730 730 1200 520 L1200 800 L0 800 Z" fill="${skyline}" opacity="0.32" />
      <rect x="110" y="220" width="420" height="320" rx="28" fill="rgba(18,33,45,0.24)" />
      <rect x="150" y="255" width="345" height="250" rx="22" fill="url(#glass)" stroke="rgba(255,255,255,0.55)" />
      <rect x="610" y="165" width="470" height="390" rx="36" fill="rgba(18,33,45,0.16)" />
      <rect x="665" y="220" width="365" height="280" rx="28" fill="rgba(255,255,255,0.78)" />
      <rect x="220" y="610" width="760" height="42" rx="21" fill="rgba(255,255,255,0.18)" />
      <text x="110" y="710" fill="#f7fafc" font-family="Georgia, serif" font-size="64" font-weight="700">${title}</text>
    </svg>
  `;

	return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export const demoListings: DemoListing[] = [
	{
		id: "toronto-harbour-loft",
		title: "Harbourfront Loft Repositioning Note",
		address: "228 Queens Quay W, Toronto, ON",
		imageSrc: createListingImage(
			"Harbourfront Loft",
			"#8dd7c4",
			"#5db4b3"
		),
		lat: 43.6387,
		lng: -79.3847,
		ltv: 62,
		apr: 8.6,
		principal: 1250000,
		marketValue: 2025000,
		mortgageType: "First",
		propertyType: "Condo",
		maturityDate: createLocalDate("2027-11-30"),
		availablePercent: 54,
		lockedPercent: 18,
		soldPercent: 28,
	},
	{
		id: "annex-townhouse-bridge",
		title: "Annex Townhouse Bridge Loan",
		address: "142 Madison Ave, Toronto, ON",
		imageSrc: createListingImage(
			"Annex Townhouse",
			"#a7d8ff",
			"#4d8ac5"
		),
		lat: 43.6699,
		lng: -79.4026,
		ltv: 58,
		apr: 9.1,
		principal: 980000,
		marketValue: 1690000,
		mortgageType: "First",
		propertyType: "Townhouse",
		maturityDate: createLocalDate("2027-06-15"),
		availablePercent: 71,
		lockedPercent: 0,
		soldPercent: 29,
	},
	{
		id: "leslieville-rental-bundle",
		title: "Leslieville Rental Bundle",
		address: "37 Bertmount Ave, Toronto, ON",
		imageSrc: createListingImage(
			"Leslieville Rental",
			"#f6c28b",
			"#bf6c45"
		),
		lat: 43.6614,
		lng: -79.3354,
		ltv: 66,
		apr: 10.2,
		principal: 1560000,
		marketValue: 2360000,
		mortgageType: "Second",
		propertyType: "Duplex",
		maturityDate: createLocalDate("2028-02-28"),
		availablePercent: 36,
		lockedPercent: 24,
		soldPercent: 40,
	},
	{
		id: "liberty-village-mixed-use",
		title: "Liberty Village Mixed-Use Conversion",
		address: "70 Fraser Ave, Toronto, ON",
		imageSrc: createListingImage(
			"Mixed-Use Conversion",
			"#c0b6ff",
			"#7167d8"
		),
		lat: 43.6395,
		lng: -79.4217,
		ltv: 61,
		apr: 8.9,
		principal: 2140000,
		marketValue: 3490000,
		mortgageType: "First",
		propertyType: "Mixed-Use",
		maturityDate: createLocalDate("2028-08-31"),
		locked: true,
		availablePercent: 12,
		lockedPercent: 46,
		soldPercent: 42,
	},
	{
		id: "junction-corner-retail",
		title: "Junction Corner Retail Refi",
		address: "3040 Dundas St W, Toronto, ON",
		imageSrc: createListingImage(
			"Junction Retail",
			"#ffd6cc",
			"#c95e54"
		),
		lat: 43.6658,
		lng: -79.4707,
		ltv: 55,
		apr: 7.8,
		principal: 1740000,
		marketValue: 3160000,
		mortgageType: "First",
		propertyType: "Commercial",
		maturityDate: createLocalDate("2027-12-31"),
		availablePercent: 64,
		lockedPercent: 0,
		soldPercent: 36,
	},
	{
		id: "king-west-suite",
		title: "King West Executive Suite",
		address: "629 King St W, Toronto, ON",
		imageSrc: createListingImage(
			"King West Suite",
			"#b1e4ff",
			"#4388b6"
		),
		lat: 43.6434,
		lng: -79.4017,
		ltv: 63,
		apr: 9.4,
		principal: 845000,
		marketValue: 1340000,
		mortgageType: "Second",
		propertyType: "Condo",
		maturityDate: createLocalDate("2027-09-30"),
		availablePercent: 48,
		lockedPercent: 22,
		soldPercent: 30,
	},
	{
		id: "forest-hill-residence",
		title: "Forest Hill Luxury Residence",
		address: "22 Vesta Dr, Toronto, ON",
		imageSrc: createListingImage(
			"Forest Hill Residence",
			"#d7d0ff",
			"#635cb8"
		),
		lat: 43.6967,
		lng: -79.4117,
		ltv: 49,
		apr: 7.2,
		principal: 2680000,
		marketValue: 5470000,
		mortgageType: "First",
		propertyType: "Detached Home",
		maturityDate: createLocalDate("2028-05-31"),
		availablePercent: 80,
		lockedPercent: 0,
		soldPercent: 20,
	},
	{
		id: "distillery-loft-series",
		title: "Distillery Loft Series A",
		address: "35 Mill St, Toronto, ON",
		imageSrc: createListingImage(
			"Distillery Loft",
			"#ffc9a7",
			"#cb744a"
		),
		lat: 43.6503,
		lng: -79.3596,
		ltv: 67,
		apr: 10.8,
		principal: 1120000,
		marketValue: 1675000,
		mortgageType: "Other",
		propertyType: "Apartment",
		maturityDate: createLocalDate("2027-10-15"),
		locked: true,
		availablePercent: 9,
		lockedPercent: 61,
		soldPercent: 30,
	},
	{
		id: "midtown-triplex-income",
		title: "Midtown Triplex Income Note",
		address: "85 Hillsdale Ave E, Toronto, ON",
		imageSrc: createListingImage(
			"Midtown Triplex",
			"#afebb7",
			"#4fa868"
		),
		lat: 43.7066,
		lng: -79.3886,
		ltv: 60,
		apr: 8.3,
		principal: 1430000,
		marketValue: 2380000,
		mortgageType: "First",
		propertyType: "Triplex",
		maturityDate: createLocalDate("2028-01-31"),
		availablePercent: 58,
		lockedPercent: 14,
		soldPercent: 28,
	},
	{
		id: "east-end-cottage-rollup",
		title: "East-End Cottage Rollup",
		address: "17 Beech Ave, Toronto, ON",
		imageSrc: createListingImage(
			"East-End Cottage",
			"#ffd9e6",
			"#c2648a"
		),
		lat: 43.6688,
		lng: -79.293,
		ltv: 57,
		apr: 8.8,
		principal: 920000,
		marketValue: 1620000,
		mortgageType: "Other",
		propertyType: "Cottage",
		maturityDate: createLocalDate("2027-08-31"),
		availablePercent: 69,
		lockedPercent: 11,
		soldPercent: 20,
	},
];
