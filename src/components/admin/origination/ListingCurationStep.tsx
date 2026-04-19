import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import type { OriginationListingOverridesDraft } from "#/lib/admin-origination";
import { OriginationStepCard } from "./OriginationStepCard";

interface ListingCurationStepProps {
	draft?: OriginationListingOverridesDraft;
	errors?: readonly string[];
	onChange: (nextDraft: OriginationListingOverridesDraft | undefined) => void;
}

const HERO_IMAGE_LINE_BREAKS = /\n+/;

function parseIntegerInput(value: string) {
	if (!value.trim()) {
		return undefined;
	}

	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function heroImagesToValue(heroImages: string[] | undefined) {
	return heroImages?.join("\n") ?? "";
}

function valueToHeroImages(value: string) {
	return value
		.split(HERO_IMAGE_LINE_BREAKS)
		.map((entry) => entry.trim())
		.filter(Boolean);
}

export function ListingCurationStep({
	draft,
	errors,
	onChange,
}: ListingCurationStepProps) {
	const nextDraft = draft ?? {};

	return (
		<OriginationStepCard
			description="These are listing-owned curation overrides only. The future listing projector will derive economics and property facts elsewhere."
			errors={errors}
			title="Listing curation"
		>
			<div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
				<div className="space-y-4 rounded-3xl border border-border/70 p-5">
					<div className="space-y-2">
						<Label htmlFor="listingTitle">Listing title</Label>
						<Input
							id="listingTitle"
							onChange={(event) =>
								onChange({
									...nextDraft,
									title: event.target.value,
								})
							}
							placeholder="Toronto bridge loan opportunity"
							value={nextDraft.title ?? ""}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="listingDescription">Description</Label>
						<Textarea
							id="listingDescription"
							onChange={(event) =>
								onChange({
									...nextDraft,
									description: event.target.value,
								})
							}
							placeholder="Short marketing summary for the marketplace surface."
							rows={5}
							value={nextDraft.description ?? ""}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="marketplaceCopy">Marketplace copy</Label>
						<Textarea
							id="marketplaceCopy"
							onChange={(event) =>
								onChange({
									...nextDraft,
									marketplaceCopy: event.target.value,
								})
							}
							placeholder="Operator-only curation copy for future listing projection."
							rows={6}
							value={nextDraft.marketplaceCopy ?? ""}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="heroImages">Hero images</Label>
						<Textarea
							id="heroImages"
							onChange={(event) =>
								onChange({
									...nextDraft,
									heroImages: valueToHeroImages(event.target.value),
								})
							}
							placeholder={"One image URL or asset reference per line"}
							rows={5}
							value={heroImagesToValue(nextDraft.heroImages)}
						/>
					</div>
				</div>

				<div className="space-y-4 rounded-3xl border border-border/70 p-5">
					<div className="space-y-2">
						<Label htmlFor="displayOrder">Display order</Label>
						<Input
							id="displayOrder"
							onChange={(event) =>
								onChange({
									...nextDraft,
									displayOrder: parseIntegerInput(event.target.value),
								})
							}
							type="number"
							value={nextDraft.displayOrder ?? ""}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="seoSlug">SEO slug</Label>
						<Input
							id="seoSlug"
							onChange={(event) =>
								onChange({
									...nextDraft,
									seoSlug: event.target.value,
								})
							}
							placeholder="toronto-bridge-loan"
							value={nextDraft.seoSlug ?? ""}
						/>
					</div>
					<div className="flex items-center gap-3 rounded-2xl border border-border/70 px-4 py-3">
						<Checkbox
							checked={Boolean(nextDraft.featured)}
							id="featured"
							onCheckedChange={(checked) =>
								onChange({
									...nextDraft,
									featured: checked === true,
								})
							}
						/>
						<div className="space-y-1">
							<Label htmlFor="featured">Feature this listing</Label>
							<p className="text-muted-foreground text-sm">
								Merchandising only. No listing projection is generated yet.
							</p>
						</div>
					</div>
					<div className="space-y-2">
						<Label htmlFor="adminNotes">Admin notes</Label>
						<Textarea
							id="adminNotes"
							onChange={(event) =>
								onChange({
									...nextDraft,
									adminNotes: event.target.value,
								})
							}
							placeholder="Internal notes for later listing projection work."
							rows={7}
							value={nextDraft.adminNotes ?? ""}
						/>
					</div>
				</div>
			</div>
		</OriginationStepCard>
	);
}
