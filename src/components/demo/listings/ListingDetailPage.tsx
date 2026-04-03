"use client";

import {
	ArrowLeft,
	Check,
	ChevronLeft,
	ChevronRight,
	FileText,
	Heart,
	ImageIcon,
	MapPinned,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { cn } from "#/lib/utils";
import type {
	ListingBadge,
	ListingBorrowerSignal,
	ListingComparable,
	ListingDetailMock,
	ListingDocumentItem,
	ListingHeroImage,
	ListingSimilarCard,
	ListingValueTone,
} from "./listing-detail-types";

const HERO_TONE_CLASSES: Record<ListingHeroImage["tone"], string> = {
	mist: "bg-linear-to-br from-stone-100 via-stone-50 to-stone-200",
	pearl: "bg-linear-to-br from-neutral-100 via-stone-50 to-stone-200",
	sage: "bg-linear-to-br from-emerald-50 via-stone-100 to-stone-200",
	sand: "bg-linear-to-br from-amber-50 via-stone-100 to-stone-200",
	stone: "bg-linear-to-br from-stone-200 via-stone-100 to-stone-300",
	warm: "bg-linear-to-br from-orange-50 via-stone-100 to-stone-200",
};

const VALUE_TONE_CLASSES: Record<ListingValueTone, string> = {
	default: "text-[#171717]",
	positive: "text-[#2E7D4F]",
	warning: "text-[#C07A1C]",
};

const DIGITS_ONLY_PATTERN = /^\d+$/;

interface ListingDetailPageProps {
	listing: ListingDetailMock;
}

export function ListingDetailPage({ listing }: ListingDetailPageProps) {
	const [selectedImageId, setSelectedImageId] = useState(
		listing.heroImages[0]?.id
	);
	const [selectedDocumentId, setSelectedDocumentId] = useState(
		listing.documents[0]?.id
	);
	const [selectedLawyerId, setSelectedLawyerId] = useState(
		listing.checkout.lawyers[0]?.id
	);
	const [fractionInput, setFractionInput] = useState(
		String(listing.checkout.defaultFractions)
	);

	useEffect(() => {
		setSelectedImageId(listing.heroImages[0]?.id);
		setSelectedDocumentId(listing.documents[0]?.id);
		setSelectedLawyerId(listing.checkout.lawyers[0]?.id);
		setFractionInput(String(listing.checkout.defaultFractions));
	}, [listing]);

	const selectedImageIndex = Math.max(
		0,
		listing.heroImages.findIndex((image) => image.id === selectedImageId)
	);
	const selectedImage =
		listing.heroImages[selectedImageIndex] ?? listing.heroImages[0];
	const selectedDocument =
		listing.documents.find((document) => document.id === selectedDocumentId) ??
		listing.documents[0];
	const selectedLawyer =
		listing.checkout.lawyers.find((lawyer) => lawyer.id === selectedLawyerId) ??
		listing.checkout.lawyers[0];

	const requestedFractions = useMemo(() => {
		const parsed = Number.parseInt(fractionInput, 10);
		if (!Number.isFinite(parsed) || parsed <= 0) {
			return listing.checkout.defaultFractions;
		}
		return parsed;
	}, [fractionInput, listing.checkout.defaultFractions]);

	const effectiveFractions = Math.max(
		listing.checkout.minimumFractions,
		requestedFractions
	);
	const calculatedInvestment =
		effectiveFractions * listing.checkout.perFractionAmount;
	const ctaLabel = `Lock ${effectiveFractions} Fractions — Pay ${listing.checkout.lockFee.replace(
		".00",
		""
	)} Fee`;
	const summaryParagraphs = splitSummary(listing.summary);

	function goToNextImage() {
		setSelectedImageId(
			listing.heroImages[(selectedImageIndex + 1) % listing.heroImages.length]
				?.id
		);
	}

	function goToPreviousImage() {
		setSelectedImageId(
			listing.heroImages[
				(selectedImageIndex - 1 + listing.heroImages.length) %
					listing.heroImages.length
			]?.id
		);
	}

	function normalizeFractions(value: number) {
		return String(Math.max(listing.checkout.minimumFractions, value));
	}

	function handleFractionChange(nextValue: string) {
		if (nextValue === "") {
			setFractionInput("");
			return;
		}

		if (DIGITS_ONLY_PATTERN.test(nextValue)) {
			setFractionInput(nextValue);
		}
	}

	function handleFractionBlur() {
		setFractionInput(normalizeFractions(requestedFractions));
	}

	return (
		<div className="min-h-screen bg-[#FAFAF8] text-[#1F1F1B]">
			<div className="hidden lg:block">
				<DesktopTopNav />
			</div>
			<div className="lg:hidden">
				<MobileTopNav />
			</div>

			<div className="hidden lg:block" data-testid="desktop-listing-detail">
				<section className="flex h-[480px] gap-4 px-16 pt-4">
					<div className="relative flex-1 overflow-hidden rounded-xl">
						<MediaPanel image={selectedImage} />
						<HeroArrowButton
							ariaLabel="Previous photo"
							className="left-4"
							direction="left"
							onClick={goToPreviousImage}
						/>
						<HeroArrowButton
							ariaLabel="Next photo"
							className="right-4"
							direction="right"
							onClick={goToNextImage}
						/>
						<div className="absolute right-4 bottom-4 rounded-lg bg-black/70 px-3 py-1 font-medium text-sm text-white">
							{selectedImageIndex + 1} of {listing.heroImages.length} photos
						</div>
					</div>
					<MapPanel listing={listing} />
				</section>

				<section className="flex gap-3 px-16 pt-4">
					{listing.heroImages.slice(0, 6).map((image) => (
						<button
							className={cn(
								"relative h-16 w-[88px] cursor-pointer overflow-hidden rounded-lg border transition-all",
								image.id === selectedImage.id
									? "border-[#204636] ring-1 ring-[#204636]"
									: "border-[#E7E5E4]"
							)}
							key={image.id}
							onClick={() => setSelectedImageId(image.id)}
							type="button"
						>
							<MediaPanel compact image={image} />
							<span className="sr-only">View {image.label}</span>
						</button>
					))}
				</section>

				<section className="flex gap-10 px-16 pt-10">
					<div className="max-w-[932px] flex-1">
						<div className="space-y-5">
							<div className="flex flex-wrap gap-2">
								{listing.badges.map((badge) => (
									<BadgePill badge={badge} key={badge.id} />
								))}
							</div>
							<div className="space-y-2">
								<h1 className="font-semibold text-[44px] leading-[1.04] tracking-[-0.03em]">
									{listing.title}
								</h1>
								<p className="text-[#737373] text-sm">
									{listing.listedLabel} · MLS #{listing.mlsId}
								</p>
							</div>
							<div className="space-y-4">
								<SectionLabel>Executive Summary</SectionLabel>
								<div className="space-y-3 text-[#4A4A48] text-[15px] leading-7">
									{summaryParagraphs.map((paragraph) => (
										<p key={paragraph}>{paragraph}</p>
									))}
								</div>
							</div>
						</div>
					</div>

					<WhiteSurface className="w-[340px] shrink-0 self-start px-6 py-6">
						<SectionLabel className="mb-5">At a Glance</SectionLabel>
						<div className="space-y-4">
							{listing.atAGlance.map((item) => (
								<div
									className="flex items-center justify-between border-[#F0EEE9] border-b pb-3 last:border-b-0 last:pb-0"
									key={item.label}
								>
									<span className="text-[#6B6B68] text-sm">{item.label}</span>
									<span
										className={cn(
											"font-medium text-sm",
											VALUE_TONE_CLASSES[item.tone ?? "default"]
										)}
									>
										{item.value}
									</span>
								</div>
							))}
						</div>
					</WhiteSurface>
				</section>

				<DesktopFinancials listing={listing} />
				<DesktopAppraisal listing={listing} />
				<DesktopComparables listing={listing} />
				<DesktopBorrowerAndHistory listing={listing} />
				<DesktopDocuments
					documents={listing.documents}
					onDocumentSelect={setSelectedDocumentId}
					selectedDocumentId={selectedDocument.id}
				/>
				<InvestmentSummaryCard className="mx-16 mt-10" listing={listing} />

				<section className="flex gap-6 px-16 pt-6">
					<WhiteSurface className="flex-1 px-7 py-7">
						<h2 className="font-semibold text-[20px]">
							Select Your Investment
						</h2>
						<div className="mt-5 grid grid-cols-[1fr_auto] items-center gap-4">
							<div className="space-y-2">
								<label
									className="font-medium text-[#6B6B68] text-[13px]"
									htmlFor="desktop-fractions-input"
								>
									Number of fractions
								</label>
								<Input
									aria-label="Number of fractions"
									className="h-12 rounded-xl border-[#E7E5E4] bg-[#FBFAF8] text-base"
									id="desktop-fractions-input"
									onBlur={handleFractionBlur}
									onChange={(event) => handleFractionChange(event.target.value)}
									value={fractionInput}
								/>
							</div>
							<div className="rounded-xl bg-[#E7F6EA] px-5 py-3 font-semibold text-[#2E7D4F] text-xl">
								= {formatCurrency(calculatedInvestment)}
							</div>
						</div>

						<div className="mt-6 space-y-3">
							<p className="font-medium text-[#6B6B68] text-[13px]">
								Select your lawyer
							</p>
							{listing.checkout.lawyers.map((lawyer) => (
								<LawyerOptionCard
									isSelected={lawyer.id === selectedLawyer.id}
									key={lawyer.id}
									lawyer={lawyer}
									onSelect={setSelectedLawyerId}
								/>
							))}
						</div>
					</WhiteSurface>

					<CheckoutCard
						calculatedInvestment={calculatedInvestment}
						ctaLabel={ctaLabel}
						fractions={effectiveFractions}
						listing={listing}
						selectedLawyerLabel={selectedLawyer.label}
					/>
				</section>

				<SimilarListingsSection
					cards={listing.similarListings}
					className="px-16 pt-10"
					title="You May Also Be Interested In"
				/>
			</div>

			<div className="lg:hidden" data-testid="mobile-listing-detail">
				<section className="relative h-[260px]">
					<MediaPanel image={selectedImage} />
					<div className="absolute right-4 bottom-4 rounded-lg bg-black/70 px-3 py-1 font-medium text-sm text-white">
						{selectedImageIndex + 1} / {listing.heroImages.length}
					</div>
				</section>

				<section className="px-5 pt-5">
					<div className="flex flex-wrap gap-1.5">
						{listing.badges.map((badge) => (
							<BadgePill badge={badge} key={badge.id} mobile />
						))}
					</div>
					<h1 className="mt-3 font-semibold text-[24px] leading-[1.08] tracking-[-0.03em]">
						{listing.title}
					</h1>
					<p className="mt-2 text-[#737373] text-sm">
						{listing.listedLabel} · MLS #{listing.mlsId}
					</p>
				</section>

				<section className="px-5 pt-4">
					<a
						className="flex items-center justify-center gap-2 rounded-xl border border-[#E7E5E4] bg-white px-4 py-3 font-medium text-[15px]"
						href="#listing-map"
					>
						<MapPinned className="size-4" />
						Show Map — {listing.map.locationText}
					</a>
				</section>

				<section className="px-5 pt-6">
					<SectionLabel>Executive Summary</SectionLabel>
					<p className="mt-3 text-[#4A4A48] text-[15px] leading-7">
						{listing.summary}
					</p>
				</section>

				<section className="px-5 pt-6">
					<SectionLabel>Key Financials</SectionLabel>
					<div className="mt-3 grid grid-cols-2 gap-2">
						{listing.keyFinancials.slice(0, 6).map((item) => (
							<CompactMetricCard item={item} key={item.label} />
						))}
					</div>
				</section>

				<section className="px-5 pt-6">
					<SectionLabel>Appraisal</SectionLabel>
					<div className="mt-3 space-y-3">
						<WhiteSurface className="px-5 py-5">
							<div className="flex items-start justify-between gap-4">
								<div>
									<h2 className="font-semibold text-[22px] leading-none">
										{listing.appraisal.asIs.label}
									</h2>
									<p className="mt-2 text-[#737373] text-sm">
										{listing.appraisal.asIs.note}
									</p>
								</div>
								<span className="font-medium text-[#6B6B68] text-xs uppercase tracking-[0.22em]">
									Full Interior
								</span>
							</div>
							<div className="mt-5 grid grid-cols-2 gap-4">
								<div>
									<p className="text-[#737373] text-xs uppercase tracking-[0.18em]">
										Appraised value
									</p>
									<p className="mt-2 font-semibold text-[40px] leading-none tracking-[-0.04em]">
										{listing.appraisal.asIs.value}
									</p>
								</div>
								<div className="space-y-4 pt-1 text-sm">
									<div>
										<p className="text-[#737373] text-xs uppercase tracking-[0.18em]">
											Date
										</p>
										<p className="mt-1">{listing.appraisal.asIs.date}</p>
									</div>
									<div>
										<p className="text-[#737373] text-xs uppercase tracking-[0.18em]">
											Company
										</p>
										<p className="mt-1">
											{listing.appraisal.asIs.secondaryValue}
										</p>
									</div>
								</div>
							</div>
						</WhiteSurface>

						<WhiteSurface className="border-dashed px-5 py-5">
							<div className="flex items-center gap-2">
								<h2 className="font-semibold text-[22px] leading-none">
									{listing.appraisal.asIf.label}
								</h2>
								<span className="font-semibold text-[#C07A1C] text-[10px] uppercase tracking-[0.24em]">
									Projected
								</span>
							</div>
							<p className="mt-4 font-semibold text-[40px] leading-none tracking-[-0.04em]">
								{listing.appraisal.asIf.value}
							</p>
							<p className="mt-3 max-w-[24ch] text-[#4A4A48] text-sm leading-6">
								{listing.appraisal.asIf.note}
							</p>
						</WhiteSurface>
					</div>
				</section>

				<section className="px-5 pt-6">
					<SectionLabel>Borrower Signals</SectionLabel>
					<WhiteSurface className="mt-3 px-5 py-5">
						<div className="flex gap-3">
							<div className="flex size-14 items-center justify-center rounded-full border border-[#2E7D4F] text-[#2E7D4F]">
								<span className="font-semibold text-[22px] leading-none">
									{listing.borrowerSignals.grade}
								</span>
							</div>
							<div>
								<p className="font-semibold text-[22px] leading-none">
									Score: {listing.borrowerSignals.score}
								</p>
								<p className="mt-2 text-[#737373] text-sm">
									{listing.borrowerSignals.subtitle}
								</p>
							</div>
						</div>
						<div className="mt-5 space-y-4">
							{listing.borrowerSignals.items.map((item) => (
								<SignalRow item={item} key={item.id} />
							))}
						</div>
					</WhiteSurface>
				</section>

				<section className="px-5 pt-6">
					<WhiteSurface className="px-5 py-5">
						<SectionLabel>Payment History</SectionLabel>
						<div className="mt-4 flex gap-6">
							<MetricSummary
								label="On-time"
								value={listing.paymentHistory.onTimeRate}
							/>
							<MetricSummary
								label="Late"
								value={String(listing.paymentHistory.lateCount)}
							/>
							<MetricSummary
								label="Missed"
								value={String(listing.paymentHistory.missedCount)}
							/>
						</div>
						<div className="mt-5 flex flex-wrap gap-1.5">
							{listing.paymentHistory.months.map((month) => (
								<div
									className={cn(
										"flex h-6 w-6 items-center justify-center rounded-md font-semibold text-[9px] uppercase",
										monthStatusClass(month.status)
									)}
									key={month.id}
									title={`${month.label} · ${month.status}`}
								>
									{month.label}
								</div>
							))}
						</div>
					</WhiteSurface>
				</section>

				<section className="px-5 pt-6">
					<SectionLabel>Documents</SectionLabel>
					<div className="mt-3 space-y-2">
						{listing.documents.map((document) => (
							<button
								className="flex w-full items-center justify-between rounded-xl border border-[#E7E5E4] bg-white px-4 py-4 text-left"
								key={document.id}
								onClick={() => setSelectedDocumentId(document.id)}
								type="button"
							>
								<div className="flex items-center gap-3">
									<FileText className="size-4 text-[#737373]" />
									<span className="font-medium text-sm">{document.label}</span>
								</div>
								<ChevronRight className="size-4 text-[#A3A3A3]" />
							</button>
						))}
					</div>
				</section>

				<InvestmentSummaryCard className="mx-5 mt-6" listing={listing} mobile />

				<section className="px-5 pt-3">
					<div className="space-y-4">
						<div className="space-y-2">
							<label
								className="font-medium text-[#6B6B68] text-[13px]"
								htmlFor="mobile-fractions-input"
							>
								Number of fractions
							</label>
							<div className="grid grid-cols-[1fr_auto] gap-2">
								<Input
									aria-label="Number of fractions"
									className="h-11 rounded-xl border-[#E7E5E4] bg-white"
									id="mobile-fractions-input"
									onBlur={handleFractionBlur}
									onChange={(event) => handleFractionChange(event.target.value)}
									value={fractionInput}
								/>
								<div className="rounded-xl bg-[#E7F6EA] px-4 py-3 font-semibold text-[#2E7D4F] text-lg">
									= {formatCurrency(calculatedInvestment)}
								</div>
							</div>
						</div>

						<div className="space-y-2">
							<p className="font-medium text-[#6B6B68] text-[13px]">
								Select your lawyer
							</p>
							{listing.checkout.lawyers.map((lawyer) => (
								<LawyerOptionCard
									isCompact
									isSelected={lawyer.id === selectedLawyer.id}
									key={lawyer.id}
									lawyer={lawyer}
									onSelect={setSelectedLawyerId}
								/>
							))}
						</div>
					</div>
				</section>

				<div className="px-5 pt-4">
					<CheckoutCard
						calculatedInvestment={calculatedInvestment}
						className="w-full px-5 py-5"
						ctaLabel={ctaLabel}
						fractions={effectiveFractions}
						listing={listing}
						selectedLawyerLabel={selectedLawyer.label}
					/>
				</div>

				<SimilarListingsSection
					cards={listing.similarListings}
					className="px-5 pt-6"
					mobile
					title="You May Also Like"
				/>
			</div>
		</div>
	);
}

function DesktopTopNav() {
	return (
		<header className="flex items-center justify-between border-[#E7E5E4] border-b bg-white px-16 py-4">
			<a
				className="inline-flex items-center gap-2 font-medium text-[#3F3F46] text-[13px]"
				href="/demo/listings"
			>
				<ArrowLeft className="size-4" />
				Back to Listings
			</a>

			<div className="flex items-center gap-3">
				<div className="inline-flex items-center gap-2 rounded-full bg-[#F6FBF7] px-3 py-2 text-[#2E7D4F] text-[12px]">
					<span className="size-1.5 rounded-full bg-[#22C55E]" />
					12 viewing now
				</div>
				<button
					className="inline-flex items-center gap-2 rounded-full border border-[#E7E5E4] px-4 py-2 font-medium text-[13px]"
					type="button"
				>
					<Heart className="size-4" />
					Save
				</button>
			</div>
		</header>
	);
}

function MobileTopNav() {
	return (
		<header className="flex items-center justify-between border-[#E7E5E4] border-b bg-white px-5 py-3">
			<a href="/demo/listings">
				<ChevronLeft className="size-5 text-[#3F3F46]" />
				<span className="sr-only">Back to Listings</span>
			</a>
			<div className="flex items-center gap-3 text-[12px]">
				<div className="inline-flex items-center gap-1 text-[#2E7D4F]">
					<span className="size-1.5 rounded-full bg-[#22C55E]" />
					12
				</div>
				<button type="button">
					<Heart className="size-4 text-[#737373]" />
					<span className="sr-only">Save listing</span>
				</button>
			</div>
		</header>
	);
}

function DesktopFinancials({ listing }: { listing: ListingDetailMock }) {
	return (
		<section className="px-16 pt-10">
			<SectionLabel>Key Financials</SectionLabel>
			<div className="mt-5 grid grid-cols-4 gap-4">
				{listing.keyFinancials.slice(0, 4).map((item) => (
					<MetricCard item={item} key={item.label} />
				))}
			</div>
			<div className="mt-4 grid grid-cols-4 gap-4">
				{listing.keyFinancials.slice(4).map((item) => (
					<MetricCard item={item} key={item.label} />
				))}
			</div>
		</section>
	);
}

function DesktopAppraisal({ listing }: { listing: ListingDetailMock }) {
	return (
		<section className="px-16 pt-10">
			<SectionLabel>Appraisal</SectionLabel>
			<div className="mt-5 grid grid-cols-[minmax(0,1fr)_320px] gap-6">
				<WhiteSurface className="px-7 py-6">
					<div className="flex items-start justify-between">
						<div>
							<h2 className="font-semibold text-[24px]">
								{listing.appraisal.asIs.label}
							</h2>
							<p className="mt-3 text-[#737373] text-sm">Appraised value</p>
							<p className="mt-1 font-semibold text-[44px] leading-none tracking-[-0.04em]">
								{listing.appraisal.asIs.value}
							</p>
						</div>
						<p className="text-[#6B6B68] text-xs uppercase tracking-[0.22em]">
							{listing.appraisal.asIs.note}
						</p>
					</div>
					<div className="mt-8 grid grid-cols-3 gap-4 text-sm">
						<InfoColumn
							label="Date"
							value={listing.appraisal.asIs.date ?? ""}
						/>
						<InfoColumn
							label="Company"
							value={listing.appraisal.asIs.secondaryValue ?? ""}
						/>
						<InfoColumn label="Type" value={listing.appraisal.asIs.note} />
					</div>
				</WhiteSurface>

				<WhiteSurface className="border-dashed px-6 py-6">
					<div className="flex items-center gap-2">
						<h2 className="font-semibold text-[24px]">
							{listing.appraisal.asIf.label}
						</h2>
						<span className="font-semibold text-[#C07A1C] text-[10px] uppercase tracking-[0.24em]">
							Projected
						</span>
					</div>
					<p className="mt-5 font-semibold text-[44px] leading-none tracking-[-0.04em]">
						{listing.appraisal.asIf.value}
					</p>
					<p className="mt-4 text-[#4A4A48] text-sm leading-6">
						{listing.appraisal.asIf.note}
					</p>
				</WhiteSurface>
			</div>
		</section>
	);
}

function DesktopComparables({ listing }: { listing: ListingDetailMock }) {
	return (
		<section className="px-16 pt-4">
			<div className="grid grid-cols-2 gap-6">
				<ComparableTable
					rows={listing.comparables.asIs}
					title="As-Is Comparables"
				/>
				<ComparableTable
					projected
					rows={listing.comparables.asIf}
					title="As-If Comparables"
				/>
			</div>
		</section>
	);
}

function DesktopBorrowerAndHistory({
	listing,
}: {
	listing: ListingDetailMock;
}) {
	return (
		<section className="px-16 pt-10">
			<SectionLabel>Borrower</SectionLabel>
			<div className="mt-5 grid grid-cols-2 gap-6">
				<WhiteSurface className="px-7 py-7">
					<div className="flex items-start justify-between gap-4">
						<div className="flex items-center gap-4">
							<div className="flex size-16 items-center justify-center rounded-full border border-[#2E7D4F] text-[#2E7D4F]">
								<span className="font-semibold text-[28px] leading-none">
									{listing.borrowerSignals.grade}
								</span>
							</div>
							<div>
								<p className="font-semibold text-[22px]">
									Composite Score: {listing.borrowerSignals.score}
								</p>
								<p className="mt-1 text-[#737373] text-sm">
									{listing.borrowerSignals.subtitle}
								</p>
							</div>
						</div>
						<p className="text-[#A3A3A3] text-[11px] uppercase tracking-[0.22em]">
							{listing.borrowerSignals.note}
						</p>
					</div>
					<div className="mt-8 space-y-5">
						{listing.borrowerSignals.items.map((item) => (
							<SignalRow item={item} key={item.id} />
						))}
					</div>
				</WhiteSurface>

				<WhiteSurface className="px-7 py-7">
					<SectionLabel>Payment History</SectionLabel>
					<div className="mt-6 flex gap-8">
						<MetricSummary
							label="On-time"
							value={listing.paymentHistory.onTimeRate}
						/>
						<MetricSummary
							label="Late"
							value={String(listing.paymentHistory.lateCount)}
						/>
						<MetricSummary
							label="Missed"
							value={String(listing.paymentHistory.missedCount)}
						/>
					</div>
					<div className="mt-8">
						<p className="font-medium text-[#6B6B68] text-[13px]">
							Payment Timeline
						</p>
						<div className="mt-4 flex flex-wrap gap-1.5">
							{listing.paymentHistory.months.map((month) => (
								<div
									className={cn(
										"flex h-8 min-w-8 items-center justify-center rounded-md px-2 font-semibold text-[10px] uppercase",
										monthStatusClass(month.status)
									)}
									key={month.id}
									title={`${month.label} · ${month.status}`}
								>
									{month.label}
								</div>
							))}
						</div>
						<div className="mt-4 flex gap-4 text-[#737373] text-[11px]">
							<LegendChip color="bg-[#22C55E]" label="On-time" />
							<LegendChip color="bg-[#F59E0B]" label="Late (1-30 days)" />
							<LegendChip color="bg-[#EF4444]" label="Missed (30+ days)" />
						</div>
					</div>
				</WhiteSurface>
			</div>
		</section>
	);
}

function DesktopDocuments({
	documents,
	selectedDocumentId,
	onDocumentSelect,
}: {
	documents: ListingDocumentItem[];
	onDocumentSelect: (documentId: string) => void;
	selectedDocumentId: string;
}) {
	const selectedDocument =
		documents.find((document) => document.id === selectedDocumentId) ??
		documents[0];

	return (
		<section className="px-16 pt-10">
			<SectionLabel>Documents</SectionLabel>
			<div className="mt-5 flex overflow-hidden rounded-xl border border-[#E7E5E4] bg-white">
				<div className="w-[260px] border-[#EFEDE8] border-r p-3">
					<div className="space-y-1">
						{documents.map((document) => {
							const isSelected = document.id === selectedDocument.id;
							return (
								<button
									className={cn(
										"flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors",
										isSelected
											? "bg-[#F1FAF3] text-[#204636]"
											: "text-[#4A4A48] hover:bg-[#F7F6F3]"
									)}
									key={document.id}
									onClick={() => onDocumentSelect(document.id)}
									type="button"
								>
									<FileText className="size-4 shrink-0" />
									<div>
										<p className="font-medium text-sm">{document.label}</p>
										<p className="text-[#888784] text-[12px]">
											{document.meta}
										</p>
									</div>
								</button>
							);
						})}
					</div>
				</div>
				<div className="flex h-[358px] flex-1 flex-col items-center justify-center bg-[#FBFAF8] text-center">
					<FileText className="size-10 text-[#B0AEA8]" />
					<p className="mt-4 font-medium text-[#5A5956] text-sm">
						{selectedDocument.pageLabel}
					</p>
					<p className="mt-2 text-[#A3A3A3] text-sm">
						Inline PDF viewer renders here
					</p>
				</div>
			</div>
		</section>
	);
}

function InvestmentSummaryCard({
	className,
	listing,
	mobile = false,
}: {
	className?: string;
	listing: ListingDetailMock;
	mobile?: boolean;
}) {
	return (
		<section className={className}>
			<SectionLabel>Invest in This Mortgage</SectionLabel>
			<WhiteSurface
				className={cn("mt-5 px-6 py-6", mobile && "mt-3 px-5 py-5")}
			>
				<div className="flex items-center justify-between gap-4 text-[#6B6B68] text-sm">
					<span>Fraction Availability</span>
					<span>{listing.investment.availabilityLabel}</span>
				</div>
				<div className="mt-4 h-2 rounded-full bg-[#E7E5E4]">
					<div
						className="h-full rounded-full bg-[#204636]"
						style={{ width: `${listing.investment.availabilityValue}%` }}
					/>
				</div>
				<div
					className={cn(
						"mt-6 grid gap-4",
						mobile ? "grid-cols-3" : "grid-cols-3"
					)}
				>
					<MiniMetric
						label="Per fraction"
						value={formatCurrency(listing.checkout.perFractionAmount)}
					/>
					<MiniMetric
						label="Minimum purchase"
						value={`${listing.checkout.minimumFractions} frac.`}
					/>
					<MiniMetric
						label="Yield"
						tone="positive"
						value={listing.investment.projectedYield}
					/>
				</div>
				<p className="mt-5 text-[#737373] text-sm">
					{listing.investment.investorCountLabel}
				</p>
			</WhiteSurface>
		</section>
	);
}

function CheckoutCard({
	calculatedInvestment,
	className,
	ctaLabel,
	fractions,
	listing,
	selectedLawyerLabel,
}: {
	calculatedInvestment: number;
	className?: string;
	ctaLabel: string;
	fractions: number;
	listing: ListingDetailMock;
	selectedLawyerLabel: string;
}) {
	return (
		<div
			className={cn(
				"w-[400px] shrink-0 rounded-xl bg-[#1B4332] px-7 py-7 text-white",
				className
			)}
		>
			<h2 className="font-semibold text-[20px]">Lock Fee Checkout</h2>
			<div className="mt-5 space-y-3 text-sm">
				<CheckoutRow label="Listing" value={listing.title} />
				<CheckoutRow
					label="Fractions"
					value={`${fractions} (${formatCurrency(calculatedInvestment)})`}
				/>
				<CheckoutRow label="Lawyer" value={selectedLawyerLabel} />
				<CheckoutRow
					emphasis
					label="Lock Fee"
					value={listing.checkout.lockFee}
				/>
			</div>

			<div className="mt-6 space-y-3">
				<div>
					<label className="text-[12px] text-white/70" htmlFor="card-number">
						Card number
					</label>
					<Input
						className="mt-1 h-11 border-white/15 bg-white/6 text-white placeholder:text-white/45"
						defaultValue="4242 4242 4242 4242"
						id="card-number"
					/>
				</div>
				<div className="grid grid-cols-2 gap-3">
					<div>
						<label className="text-[12px] text-white/70" htmlFor="expiry">
							Expiry
						</label>
						<Input
							className="mt-1 h-11 border-white/15 bg-white/6 text-white placeholder:text-white/45"
							defaultValue="MM / YY"
							id="expiry"
						/>
					</div>
					<div>
						<label className="text-[12px] text-white/70" htmlFor="cvc">
							CVC
						</label>
						<Input
							className="mt-1 h-11 border-white/15 bg-white/6 text-white placeholder:text-white/45"
							defaultValue="123"
							id="cvc"
						/>
					</div>
				</div>
			</div>

			<Button className="mt-6 h-11 w-full rounded-xl bg-white text-[#173A2B] hover:bg-white/90">
				{ctaLabel}
			</Button>

			<p className="mt-4 text-[12px] text-white/65 leading-5">
				Non-refundable lock fee. Powered by {listing.checkout.poweredBy}.
				Secures your fractions while the deal is documented.
			</p>
		</div>
	);
}

function SimilarListingsSection({
	cards,
	className,
	mobile = false,
	title,
}: {
	cards: ListingSimilarCard[];
	className?: string;
	mobile?: boolean;
	title: string;
}) {
	return (
		<section className={className}>
			<SectionLabel>{title}</SectionLabel>
			<div
				className={cn(
					"mt-5 gap-4",
					mobile ? "flex overflow-x-auto pb-2" : "grid grid-cols-3"
				)}
			>
				{cards.map((card) => (
					<a
						className={cn(
							"overflow-hidden rounded-xl border border-[#E7E5E4] bg-white",
							mobile ? "w-[220px] shrink-0" : "min-w-0"
						)}
						href={`/demo/listings/${card.id}`}
						key={card.id}
					>
						<div className="h-[138px] overflow-hidden">
							<MediaPanel
								className="h-full rounded-none"
								image={{
									id: card.id,
									label: card.title,
									alt: card.title,
									tone: card.tone,
								}}
							/>
						</div>
						<div className="space-y-3 px-4 py-4">
							<div className="flex flex-wrap gap-1.5">
								{card.badges.map((badge) => (
									<BadgePill badge={badge} key={badge.id} mobile />
								))}
							</div>
							<div className="space-y-1">
								<p className="font-medium leading-6">{card.title}</p>
								<div className="flex flex-wrap gap-2 text-[#5A5956] text-sm">
									<span className="font-medium text-[#1F1F1B]">
										{card.price}
									</span>
									{card.metrics.map((metric) => (
										<span key={metric}>{metric}</span>
									))}
								</div>
							</div>
						</div>
					</a>
				))}
			</div>
		</section>
	);
}

function MapPanel({ listing }: { listing: ListingDetailMock }) {
	return (
		<div
			className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl bg-[#E8E4DF]"
			id="listing-map"
		>
			<div className="relative flex size-[180px] items-center justify-center rounded-full border border-[#BFC9BF] border-dashed bg-[#E6EBE4]">
				<div className="size-2 rounded-full bg-[#2E7D4F]" />
			</div>
			<p className="text-[#6B6B68] text-sm">
				{listing.map.label} · {listing.map.locationText}
			</p>
		</div>
	);
}

function MediaPanel({
	className,
	compact = false,
	image,
}: {
	className?: string;
	compact?: boolean;
	image: ListingHeroImage;
}) {
	return (
		<div
			className={cn(
				"flex h-full w-full items-center justify-center rounded-xl",
				HERO_TONE_CLASSES[image.tone],
				className
			)}
		>
			<div className="flex flex-col items-center gap-3 text-[#7B776F]">
				<ImageIcon className={cn("size-10", compact && "size-6")} />
				<span
					className={cn("font-medium", compact ? "text-[11px]" : "text-base")}
				>
					{image.label}
				</span>
			</div>
		</div>
	);
}

function WhiteSurface({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn("rounded-xl border border-[#E7E5E4] bg-white", className)}
		>
			{children}
		</div>
	);
}

function MetricCard({
	item,
}: {
	item: ListingDetailMock["keyFinancials"][number];
}) {
	return (
		<WhiteSurface className="px-5 py-5">
			<p className="text-[#737373] text-sm">{item.label}</p>
			<p
				className={cn(
					"mt-2 font-semibold text-[34px] leading-none tracking-[-0.04em]",
					VALUE_TONE_CLASSES[item.tone ?? "default"]
				)}
			>
				{item.value}
			</p>
			<p className="mt-2 text-[#A3A3A3] text-sm">{item.note}</p>
		</WhiteSurface>
	);
}

function CompactMetricCard({
	item,
}: {
	item: ListingDetailMock["keyFinancials"][number];
}) {
	return (
		<WhiteSurface className="px-4 py-4">
			<p className="text-[#737373] text-[12px]">{item.label}</p>
			<p
				className={cn(
					"mt-2 font-semibold text-[32px] leading-none tracking-[-0.04em]",
					VALUE_TONE_CLASSES[item.tone ?? "default"]
				)}
			>
				{item.value}
			</p>
		</WhiteSurface>
	);
}

function ComparableTable({
	projected = false,
	rows,
	title,
}: {
	projected?: boolean;
	rows: ListingComparable[];
	title: string;
}) {
	return (
		<WhiteSurface className={cn("px-5 py-5", projected && "border-dashed")}>
			<div className="flex items-center gap-2">
				<h2 className="font-semibold text-[20px]">{title}</h2>
				{projected ? (
					<span className="font-semibold text-[#C07A1C] text-[10px] uppercase tracking-[0.24em]">
						Projected
					</span>
				) : null}
			</div>
			<div className="mt-4 overflow-hidden rounded-lg border border-[#F0EEE9]">
				<div className="grid grid-cols-[1.6fr_1fr_0.9fr_0.8fr_0.8fr] gap-3 bg-[#FBFAF8] px-4 py-3 text-[#8A877F] text-[11px] uppercase tracking-[0.18em]">
					<span>Address</span>
					<span>Price</span>
					<span>Date</span>
					<span>Dist.</span>
					<span>Sq Ft</span>
				</div>
				{rows.map((row) => (
					<div
						className="grid grid-cols-[1.6fr_1fr_0.9fr_0.8fr_0.8fr] gap-3 border-[#F0EEE9] border-t px-4 py-3 text-sm"
						key={row.id}
					>
						<span>{row.address}</span>
						<span>{row.price}</span>
						<span>{row.date}</span>
						<span>{row.distance}</span>
						<span>{row.squareFeet}</span>
					</div>
				))}
			</div>
		</WhiteSurface>
	);
}

function SignalRow({ item }: { item: ListingBorrowerSignal }) {
	return (
		<div className="flex items-center justify-between gap-4">
			<span className="text-[#4A4A48] text-[15px]">{item.label}</span>
			<span
				className={cn(
					"inline-flex items-center rounded-full font-medium text-sm",
					item.value === "Approved"
						? "bg-[#204636] px-3 py-1 text-white"
						: VALUE_TONE_CLASSES[item.tone]
				)}
			>
				{item.value}
			</span>
		</div>
	);
}

function LawyerOptionCard({
	isCompact = false,
	isSelected,
	lawyer,
	onSelect,
}: {
	isCompact?: boolean;
	isSelected: boolean;
	lawyer: ListingDetailMock["checkout"]["lawyers"][number];
	onSelect: (lawyerId: string) => void;
}) {
	return (
		<button
			aria-pressed={isSelected}
			className={cn(
				"flex w-full items-start gap-3 rounded-xl border px-4 py-4 text-left transition-colors",
				isSelected
					? "border-[#204636] bg-[#F1FAF3]"
					: "border-[#E7E5E4] bg-white hover:bg-[#FBFAF8]",
				isCompact && "px-4 py-3"
			)}
			onClick={() => onSelect(lawyer.id)}
			type="button"
		>
			<div
				className={cn(
					"mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
					isSelected
						? "border-[#204636] bg-[#204636] text-white"
						: "border-[#D6D3D1] bg-white text-transparent"
				)}
			>
				<Check className="size-3" />
			</div>
			<div>
				<p className="font-medium text-sm">{lawyer.label}</p>
				<p className="mt-1 text-[#737373] text-[13px]">{lawyer.detail}</p>
			</div>
		</button>
	);
}

function SectionLabel({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<p
			className={cn(
				"font-semibold text-[#4B4B47] text-[12px] uppercase tracking-[0.22em]",
				className
			)}
		>
			{children}
		</p>
	);
}

function BadgePill({
	badge,
	mobile = false,
}: {
	badge: ListingBadge;
	mobile?: boolean;
}) {
	if (badge.tone === "dark") {
		return (
			<Badge className={cn("bg-[#204636] text-white", mobile && "text-[10px]")}>
				{badge.label}
			</Badge>
		);
	}

	return (
		<Badge
			className={cn(
				"border-[#E7E5E4] bg-white text-[#4A4A48]",
				mobile && "text-[10px]"
			)}
			variant="outline"
		>
			{badge.label}
		</Badge>
	);
}

function HeroArrowButton({
	ariaLabel,
	className,
	direction,
	onClick,
}: {
	ariaLabel: string;
	className?: string;
	direction: "left" | "right";
	onClick: () => void;
}) {
	const Icon = direction === "left" ? ChevronLeft : ChevronRight;
	return (
		<button
			aria-label={ariaLabel}
			className={cn(
				"absolute top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-[#4A4A48] shadow-sm",
				className
			)}
			onClick={onClick}
			type="button"
		>
			<Icon className="size-4" />
		</button>
	);
}

function MetricSummary({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<p className="font-semibold text-[#171717] text-[40px] leading-none tracking-[-0.04em]">
				{value}
			</p>
			<p className="mt-1 text-[#737373] text-sm">{label}</p>
		</div>
	);
}

function MiniMetric({
	label,
	tone = "default",
	value,
}: {
	label: string;
	tone?: ListingValueTone;
	value: string;
}) {
	return (
		<div>
			<p className="text-[#737373] text-sm">{label}</p>
			<p
				className={cn(
					"mt-1 font-semibold text-[30px] leading-none tracking-[-0.04em]",
					VALUE_TONE_CLASSES[tone]
				)}
			>
				{value}
			</p>
		</div>
	);
}

function InfoColumn({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<p className="text-[#8A877F] text-xs uppercase tracking-[0.18em]">
				{label}
			</p>
			<p className="mt-2 text-[#30302D] text-[15px]">{value}</p>
		</div>
	);
}

function LegendChip({ color, label }: { color: string; label: string }) {
	return (
		<div className="flex items-center gap-1.5">
			<span className={cn("size-2 rounded-full", color)} />
			<span>{label}</span>
		</div>
	);
}

function CheckoutRow({
	emphasis = false,
	label,
	value,
}: {
	emphasis?: boolean;
	label: string;
	value: string;
}) {
	return (
		<div className="flex items-start justify-between gap-4">
			<span className="text-white/70">{label}</span>
			<span
				className={cn(
					"text-right",
					emphasis ? "font-semibold text-[32px] leading-none" : "font-medium"
				)}
			>
				{value}
			</span>
		</div>
	);
}

function monthStatusClass(
	status: ListingDetailMock["paymentHistory"]["months"][number]["status"]
) {
	switch (status) {
		case "late":
			return "bg-[#F59E0B] text-white";
		case "missed":
			return "bg-[#EF4444] text-white";
		case "onTime":
			return "bg-[#22C55E] text-white";
		default:
			return "bg-[#E7E5E4] text-[#171717]";
	}
}

function splitSummary(summary: string) {
	const sentences = summary.split(". ").map((sentence) => sentence.trim());
	if (sentences.length < 3) {
		return [summary];
	}

	return [
		`${sentences.slice(0, 2).join(". ")}.`,
		`${sentences.slice(2).join(". ")}`.trim(),
	].filter(Boolean);
}

function formatCurrency(amount: number) {
	return new Intl.NumberFormat("en-CA", {
		style: "currency",
		currency: "CAD",
		maximumFractionDigits: 0,
	}).format(amount);
}
