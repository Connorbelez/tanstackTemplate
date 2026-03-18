/**
 * ListingCard Component
 *
 * Property listing preview card with image, title, price, and key metrics.
 *
 * Located on: Listings Page (Desktop & Mobile)
 *
 * @example
 * ```tsx
 * import { ListingCard } from '@/components/listings';
 *
 * <ListingCard
 *   id="123"
 *   title="Downtown Mixed-Use Property"
 *   price={2500000}
 *   image="https://example.com/property.jpg"
 *   status="active"
 *   metrics={{
 *     ltv: 65,
 *     rate: 8.5,
 *     term: 24
 *   }}
 *   address="123 Main St, New York, NY"
 *   onClick={() => navigate(`/listings/${id}`)}
 * />
 * ```
 */
export interface ListingCardMetrics {
	ltv: number;
	rate: number;
	term: number;
}

export interface ListingCardProps {
	address?: string;
	description?: string;
	id: string;
	image?: string;
	metrics: ListingCardMetrics;
	onClick?: () => void;
	onFavorite?: () => void;
	price: number;
	status?: "active" | "pending" | "funded" | "closed";
	title: string;
}

export function ListingCard({
	id: _id,
	title: _title,
	price: _price,
	image: _image,
	status: _status = "active",
	metrics: _metrics,
	address: _address,
	description: _description,
	onClick: _onClick,
	onFavorite: _onFavorite,
}: ListingCardProps) {
	// Implementation placeholder - design analysis only
	throw new Error("ListingCard not implemented yet");
}
