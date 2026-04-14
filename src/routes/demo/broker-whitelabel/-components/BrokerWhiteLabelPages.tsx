import { Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
	ArrowRight,
	Building2,
	ChevronRight,
	CircleDollarSign,
	Handshake,
	House,
	Menu,
	ShieldCheck,
	Sparkles,
} from "lucide-react";
import type {
	ComponentProps,
	CSSProperties,
	Dispatch,
	FormEvent,
	SetStateAction,
} from "react";
import { useState } from "react";
import "./broker-whitelabel.css";
import { getListingDetailMock } from "#/components/demo/listings/listing-detail-mock-data";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { cn } from "#/lib/utils";
import { brokerStats, brokerValuePoints } from "../-lib/mock-data";
import { getBrokerListingById, useBrokerWhiteLabelStore } from "../-lib/store";
import type {
	BrokerAuthIntent,
	BrokerBorrowerPreApprovalContent,
	BrokerListingSummary,
	BrokerOnboardingFieldSet,
	BrokerThemeConfig,
} from "../-lib/types";
import { MortgageApplicationSection } from "./MortgageApplicationSection";

interface BorrowerPreApprovalFormFields {
	address: string;
	desiredAmount: string;
	email: string;
	fullName: string;
	phone: string;
}

const borrowerPreApprovalEmptyFields: BorrowerPreApprovalFormFields = {
	fullName: "",
	email: "",
	phone: "",
	address: "",
	desiredAmount: "",
};

const borrowerPreApprovalFieldIds = {
	address: "broker-borrower-pa-address",
	amount: "broker-borrower-pa-amount",
	email: "broker-borrower-pa-email",
	fullName: "broker-borrower-pa-full-name",
	phone: "broker-borrower-pa-phone",
} as const;

const brokerOnboardingFieldIds = {
	accreditedInvestor: "broker-onboarding-accredited-investor",
	brokerageName: "broker-onboarding-brokerage-name",
	city: "broker-onboarding-city",
	email: "broker-onboarding-email",
	experienceLevel: "broker-onboarding-experience-level",
	firstName: "broker-onboarding-first-name",
	lastName: "broker-onboarding-last-name",
	mortgageAmount: "broker-onboarding-mortgage-amount",
	notes: "broker-onboarding-notes",
	phone: "broker-onboarding-phone",
	propertyCity: "broker-onboarding-property-city",
	propertyType: "broker-onboarding-property-type",
	targetAllocation: "broker-onboarding-target-allocation",
	timeline: "broker-onboarding-timeline",
} as const satisfies Record<keyof BrokerOnboardingFieldSet, string>;

const borrowerPaCardShellClass =
	"relative overflow-hidden rounded-3xl border border-emerald-200/70 bg-gradient-to-br from-white via-emerald-50/90 to-teal-100/70 p-6 text-slate-900 shadow-2xl shadow-emerald-900/10 ring-1 ring-white/80 md:p-10 dark:from-white dark:via-emerald-50 dark:to-teal-100";

function borrowerPaEnterTransition(reduceMotion: boolean | null) {
	return reduceMotion
		? { duration: 0.2 }
		: { type: "spring" as const, stiffness: 280, damping: 28 };
}

/** Tailwind-only field chrome for the borrower showcase card (always reads “light”). */
const borrowerPaInputClass =
	"h-11 rounded-xl border border-emerald-200/90 bg-white/95 text-slate-900 shadow-sm shadow-emerald-900/5 outline-none transition-all duration-200 placeholder:text-slate-400 selection:bg-emerald-200/50 hover:border-emerald-400 hover:shadow-md hover:shadow-emerald-900/5 focus-visible:border-emerald-500 focus-visible:ring-4 focus-visible:ring-emerald-400/25 md:text-sm dark:bg-white/95 dark:text-slate-900";

type BrokerThemeStyle = CSSProperties;

/** Overrides shadcn default `size` height/radius so CTAs match as a pair. */
const brokerCtaButtonClass =
	"!h-12 !min-h-12 !rounded-[var(--broker-radius-button)] px-8 text-[15px] font-semibold !leading-none";

const brokerHeaderCtaClass =
	"!h-11 !min-h-11 !rounded-[var(--broker-radius-button)] px-5 text-sm font-semibold !leading-none";

const brokerRevealParent = {
	hidden: {},
	show: {
		transition: { staggerChildren: 0.07, delayChildren: 0.05 },
	},
};

const brokerRevealItem = {
	hidden: { opacity: 0, y: 18 },
	show: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const },
	},
};

const intentIcons = {
	lender: CircleDollarSign,
	borrower: Handshake,
	"mortgage-applicant": Building2,
};

function createThemeStyle(theme: BrokerThemeConfig): BrokerThemeStyle {
	return {
		"--broker-primary": theme.colorPrimary,
		"--broker-primary-foreground": theme.colorPrimaryForeground,
		"--broker-accent": theme.colorAccent,
		"--broker-background": theme.colorBackground,
		"--broker-surface": theme.colorSurface,
		"--broker-surface-muted": theme.colorSurfaceMuted,
		"--broker-border": theme.colorBorder,
		"--broker-text": theme.colorText,
		"--broker-text-muted": theme.colorTextMuted,
		"--broker-success": theme.colorSuccess,
		"--broker-warning": theme.colorWarning,
		"--broker-radius-card": theme.radiusCard,
		"--broker-radius-button": theme.radiusButton,
		"--broker-font-display": theme.fontDisplay,
		"--broker-font-body": theme.fontBody,
		"--broker-font-mono": theme.fontMono,
		backgroundColor: theme.colorBackground,
		color: "var(--broker-text)",
		fontFamily: "var(--broker-font-body)",
	} as BrokerThemeStyle;
}

function useBrokerTheme() {
	return useBrokerWhiteLabelStore((state) => state.theme);
}

function useBrokerContent() {
	return useBrokerWhiteLabelStore((state) => state.content);
}

function useSectionScroll() {
	return (id: string) => {
		if (typeof document === "undefined") {
			return;
		}

		document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
	};
}

function BrandMark() {
	const theme = useBrokerTheme();

	return (
		<div className="flex items-center gap-3">
			<div
				className="flex size-9 items-center justify-center rounded-[8px] font-black text-sm shadow-sm transition-transform duration-200 ease-out will-change-transform hover:scale-105 active:scale-95"
				style={{
					backgroundColor: "var(--broker-primary)",
					color: "var(--broker-primary-foreground)",
					fontFamily: "var(--broker-font-display)",
				}}
			>
				{theme.logoLetter}
			</div>
			<div className="leading-tight">
				<div
					className="font-bold text-[16px]"
					style={{ fontFamily: "var(--broker-font-display)" }}
				>
					{theme.brokerName}
				</div>
				<div
					className="text-[11px]"
					style={{ color: "var(--broker-text-muted)" }}
				>
					{theme.poweredByLabel}
				</div>
			</div>
		</div>
	);
}

function BrokerPrimaryButton(
	props: ComponentProps<typeof Button> & { compact?: boolean }
) {
	const { className, compact = false, ...rest } = props;
	return (
		<Button
			className={cn(
				compact ? brokerHeaderCtaClass : brokerCtaButtonClass,
				"relative overflow-hidden border-0 font-semibold shadow-sm transition-[transform,box-shadow,filter] duration-200 ease-out before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-[45%] before:bg-gradient-to-b before:from-white/18 before:to-transparent hover:shadow-md hover:brightness-[1.05] focus-visible:ring-2 focus-visible:ring-[var(--broker-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--broker-background)] active:scale-[0.98]",
				className
			)}
			style={{
				backgroundColor: "var(--broker-primary)",
				color: "var(--broker-primary-foreground)",
			}}
			{...rest}
		/>
	);
}

function BrokerSecondaryButton({
	className,
	...props
}: ComponentProps<typeof Button>) {
	return (
		<Button
			className={cn(
				brokerCtaButtonClass,
				"!border-2 !border-[var(--broker-border)] !bg-gradient-to-b !from-[var(--broker-surface)] !to-[color-mix(in_srgb,var(--broker-surface-muted)_55%,var(--broker-surface))] !text-[var(--broker-text)] hover:!border-[color-mix(in_srgb,var(--broker-border)_45%,var(--broker-primary))] hover:!from-[color-mix(in_srgb,var(--broker-surface)_88%,var(--broker-primary))] hover:!to-[var(--broker-surface)] hover:!text-[var(--broker-text)] focus-visible:!text-[var(--broker-text)] shadow-sm transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-px hover:shadow-md active:scale-[0.99]",
				className
			)}
			variant="outline"
			{...props}
		/>
	);
}

function BrokerHeader({
	showMarketingLinks = true,
	showPartnerPrompt = false,
}: {
	showMarketingLinks?: boolean;
	showPartnerPrompt?: boolean;
}) {
	const [mobileOpen, setMobileOpen] = useState(false);
	const theme = useBrokerTheme();
	const content = useBrokerContent();
	const scrollTo = useSectionScroll();

	return (
		<header
			className="sticky top-0 z-40 border-b backdrop-blur-md transition-[box-shadow,background-color] duration-300"
			style={{
				WebkitBackdropFilter: "blur(12px)",
				backdropFilter: "blur(12px)",
				backgroundColor:
					"color-mix(in srgb, var(--broker-surface) 88%, transparent)",
				borderColor: "var(--broker-border)",
				boxShadow:
					"0 1px 0 color-mix(in srgb, var(--broker-border) 40%, transparent)",
			}}
		>
			<div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-4 md:px-8 xl:px-16">
				<BrandMark />
				<div className="hidden items-center gap-6 md:flex">
					{showMarketingLinks ? (
						<>
							<Link
								className="text-sm underline-offset-4 transition-[opacity,color] hover:opacity-80"
								to="/demo/broker-whitelabel/listings"
								viewTransition
							>
								Listings
							</Link>
							<button
								className="text-sm transition-opacity hover:opacity-80"
								onClick={() => scrollTo("about")}
								type="button"
							>
								About
							</button>
							<button
								className="text-sm transition-opacity hover:opacity-80"
								onClick={() => scrollTo("contact")}
								type="button"
							>
								Contact
							</button>
							<BrokerPrimaryButton asChild compact>
								<Link to="/demo/broker-whitelabel/auth" viewTransition>
									{content.hero.primaryCtaLabel}
								</Link>
							</BrokerPrimaryButton>
						</>
					) : null}
					{showPartnerPrompt ? (
						<div className="flex items-center gap-2 text-sm">
							<span style={{ color: "var(--broker-text-muted)" }}>
								Already a partner?
							</span>
							<Link
								className="font-semibold underline-offset-4 transition-opacity hover:opacity-80"
								to="/demo/broker-whitelabel/auth"
								viewTransition
							>
								Sign In
							</Link>
						</div>
					) : null}
				</div>
				<button
					aria-label="Open navigation"
					className="md:hidden"
					onClick={() => setMobileOpen((value) => !value)}
					type="button"
				>
					<Menu className="size-5" style={{ color: theme.colorTextMuted }} />
				</button>
			</div>
			{mobileOpen ? (
				<div
					className="space-y-3 border-t px-5 py-4 md:hidden"
					style={{
						borderColor: "var(--broker-border)",
						backgroundColor: "var(--broker-surface)",
					}}
				>
					<Link
						className="block text-sm"
						to="/demo/broker-whitelabel/listings"
						viewTransition
					>
						Listings
					</Link>
					<button
						className="block text-sm"
						onClick={() => {
							scrollTo("about");
							setMobileOpen(false);
						}}
						type="button"
					>
						About
					</button>
					<button
						className="block text-sm"
						onClick={() => {
							scrollTo("contact");
							setMobileOpen(false);
						}}
						type="button"
					>
						Contact
					</button>
					<BrokerPrimaryButton asChild className="w-full" compact>
						<Link to="/demo/broker-whitelabel/auth" viewTransition>
							{content.hero.primaryCtaLabel}
						</Link>
					</BrokerPrimaryButton>
				</div>
			) : null}
		</header>
	);
}

function BrokerFooter() {
	const theme = useBrokerTheme();
	return (
		<footer
			className="border-t"
			style={{
				backgroundColor: "var(--broker-background)",
				borderColor: "var(--broker-border)",
			}}
		>
			<div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-5 py-6 text-xs md:flex-row md:items-center md:justify-between md:px-8 xl:px-16">
				<p style={{ color: "var(--broker-text-muted)" }}>
					Powered by FairLend · {theme.subdomainLabel} · All investments carry
					risk
				</p>
				<div
					className="flex gap-4"
					style={{ color: "var(--broker-text-muted)" }}
				>
					<a className="transition-opacity hover:opacity-80" href="#contact">
						Privacy
					</a>
					<a className="transition-opacity hover:opacity-80" href="#contact">
						Terms
					</a>
					<a className="transition-opacity hover:opacity-80" href="#contact">
						Disclaimer
					</a>
				</div>
			</div>
		</footer>
	);
}

function ListingStatusBadge({ listing }: { listing: BrokerListingSummary }) {
	return (
		<div className="ml-auto flex items-center gap-1.5 font-semibold text-[11px]">
			<div
				className="size-1.5 rounded-full"
				style={{
					backgroundColor:
						listing.statusTone === "active"
							? "var(--broker-success)"
							: "var(--broker-warning)",
				}}
			/>
			<span
				style={{
					color:
						listing.statusTone === "active"
							? "var(--broker-success)"
							: "var(--broker-warning)",
				}}
			>
				{listing.statusLabel}
			</span>
		</div>
	);
}

function BrokerListingCard({
	listing,
	showSummary = false,
	onSelect,
}: {
	listing: BrokerListingSummary;
	showSummary?: boolean;
	onSelect: (listingId: string) => void;
}) {
	return (
		<div
			className="overflow-hidden rounded-[var(--broker-radius-card)] border transition-[transform,box-shadow,border-color] duration-300 ease-out will-change-transform hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--broker-primary)_28%,var(--broker-border))] hover:shadow-lg"
			style={{
				backgroundColor: "var(--broker-surface)",
				borderColor: "var(--broker-border)",
			}}
		>
			<button
				className="block w-full text-left"
				onClick={() => onSelect(listing.id)}
				type="button"
			>
				<div
					className="broker-preview-sheen relative flex h-40 items-center justify-center"
					style={{ backgroundColor: "var(--broker-surface-muted)" }}
				>
					<House
						className="broker-icon-breathe size-8"
						style={{ color: "var(--broker-text-muted)" }}
					/>
				</div>
				<div className="space-y-3 p-5">
					<div className="flex items-center gap-2">
						<div
							className="rounded-md px-2 py-1 font-semibold text-[11px]"
							style={{
								backgroundColor:
									listing.positionLabel === "1ST MORTGAGE"
										? "var(--broker-primary)"
										: "var(--broker-text)",
								color: "var(--broker-primary-foreground)",
							}}
						>
							{listing.positionLabel === "1ST MORTGAGE" ? "1st" : "2nd"}
						</div>
						<span
							className="text-xs"
							style={{ color: "var(--broker-text-muted)" }}
						>
							{listing.propertyType}
						</span>
						<ListingStatusBadge listing={listing} />
					</div>
					<div>
						<h3
							className="font-bold text-[16px] leading-5"
							style={{ fontFamily: "var(--broker-font-display)" }}
						>
							{listing.title}
						</h3>
						<p
							className="mt-1 text-sm"
							style={{ color: "var(--broker-text-muted)" }}
						>
							{listing.location}
						</p>
					</div>
					<div
						className="flex flex-wrap items-center gap-2 text-sm"
						style={{ color: "var(--broker-text-muted)" }}
					>
						<span
							className="font-semibold"
							style={{
								color: "var(--broker-text)",
								fontFamily: "var(--broker-font-mono)",
							}}
						>
							{listing.amountLabel}
						</span>
						<span
							className="font-semibold"
							style={{
								color: "var(--broker-success)",
								fontFamily: "var(--broker-font-mono)",
							}}
						>
							{listing.rateLabel}
						</span>
						<span>{listing.ltvLabel}</span>
						<span>{listing.termLabel}</span>
					</div>
					{showSummary ? (
						<p
							className="text-sm leading-6"
							style={{ color: "var(--broker-text-muted)" }}
						>
							{listing.summary}
						</p>
					) : null}
				</div>
			</button>
			<div
				className="flex items-center justify-between border-t px-5 py-4"
				style={{ borderColor: "var(--broker-border)" }}
			>
				<button
					className="font-semibold text-sm"
					onClick={() => onSelect(listing.id)}
					style={{ color: "var(--broker-primary)" }}
					type="button"
				>
					Request access
				</button>
				<Link
					className="inline-flex items-center gap-1 text-sm transition-[gap,color] duration-200 hover:gap-1.5 hover:text-[var(--broker-primary)]"
					params={{ listingId: listing.id }}
					style={{ color: "var(--broker-text-muted)" }}
					to="/demo/broker-whitelabel/listings/$listingId"
					viewTransition
				>
					Preview memo
					<ChevronRight className="size-4" />
				</Link>
			</div>
		</div>
	);
}

function OpportunitySummaryPanel() {
	const sourceListingId = useBrokerWhiteLabelStore(
		(state) => state.sourceListingId
	);
	const listing = getBrokerListingById(sourceListingId);

	if (!listing) {
		return null;
	}

	return (
		<div
			className="rounded-[var(--broker-radius-card)] border p-5 transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-md"
			style={{
				backgroundColor: "var(--broker-surface)",
				borderColor: "var(--broker-border)",
			}}
		>
			<div className="flex items-start justify-between gap-4">
				<div>
					<p
						className="font-semibold text-xs uppercase tracking-[0.2em]"
						style={{ color: "var(--broker-text-muted)" }}
					>
						Selected opportunity
					</p>
					<h3
						className="mt-2 font-bold text-lg"
						style={{ fontFamily: "var(--broker-font-display)" }}
					>
						{listing.title}
					</h3>
					<p
						className="mt-1 text-sm"
						style={{ color: "var(--broker-text-muted)" }}
					>
						{listing.location} · {listing.rateLabel} · {listing.termLabel}
					</p>
				</div>
				<ListingStatusBadge listing={listing} />
			</div>
			<p
				className="mt-4 text-sm leading-6"
				style={{ color: "var(--broker-text-muted)" }}
			>
				{listing.summary}
			</p>
			<Link
				className="mt-4 inline-flex items-center gap-2 font-semibold text-sm transition-[gap,opacity] duration-200 hover:gap-2.5 hover:opacity-90"
				params={{ listingId: listing.id }}
				style={{ color: "var(--broker-primary)" }}
				to="/demo/broker-whitelabel/listings/$listingId"
				viewTransition
			>
				Preview opportunity memo
				<ArrowRight className="size-4" />
			</Link>
		</div>
	);
}

type BorrowerPaTransition = ReturnType<typeof borrowerPaEnterTransition>;

function BorrowerPreApprovalSuccessCard({
	copy,
	enterTransition,
	reduceMotion,
}: {
	copy: BrokerBorrowerPreApprovalContent;
	enterTransition: BorrowerPaTransition;
	reduceMotion: boolean | null;
}) {
	return (
		<motion.div
			animate={{ opacity: 1, scale: 1, y: 0 }}
			className={borrowerPaCardShellClass}
			exit={{ opacity: 0, scale: 0.98, y: -8 }}
			initial={{ opacity: 0, scale: 0.96, y: 16 }}
			key="borrower-pa-success"
			transition={enterTransition}
		>
			<div
				aria-hidden
				className="broker-pa-blob pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-teal-300/35 blur-3xl"
			/>
			<div
				aria-hidden
				className="broker-pa-blob--delayed pointer-events-none absolute -bottom-20 left-0 h-64 w-64 rounded-full bg-emerald-200/40 blur-3xl"
			/>
			<div className="relative z-10">
				<motion.div
					animate={
						reduceMotion ? {} : { scale: [1, 1.08, 1], rotate: [0, 4, -4, 0] }
					}
					className="inline-flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-emerald-600/40 shadow-lg"
					transition={
						reduceMotion ? {} : { duration: 0.65, ease: "easeOut", delay: 0.12 }
					}
				>
					<ShieldCheck className="size-7" />
				</motion.div>
				<h2
					className="mt-6 bg-gradient-to-br from-emerald-900 via-teal-800 to-emerald-800 bg-clip-text font-black text-[30px] text-transparent tracking-[-0.04em] md:text-[36px]"
					style={{ fontFamily: "var(--broker-font-display)" }}
				>
					{copy.successTitle}
				</h2>
				<p className="mt-3 max-w-2xl text-slate-600 text-sm leading-7">
					{copy.successBody}
				</p>
			</div>
		</motion.div>
	);
}

function BorrowerPreApprovalFormCard({
	copy,
	enterTransition,
	fields,
	onSubmit,
	reduceMotion,
	setFields,
	validationError,
}: {
	copy: BrokerBorrowerPreApprovalContent;
	enterTransition: BorrowerPaTransition;
	fields: BorrowerPreApprovalFormFields;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
	reduceMotion: boolean | null;
	setFields: Dispatch<SetStateAction<BorrowerPreApprovalFormFields>>;
	validationError: string | null;
}) {
	return (
		<motion.div
			animate={{ opacity: 1, y: 0 }}
			className={borrowerPaCardShellClass}
			exit={{ opacity: 0, y: 14 }}
			initial={{ opacity: 0, y: 32 }}
			key="borrower-pa-form"
			transition={enterTransition}
			whileHover={
				reduceMotion
					? undefined
					: { y: -6, transition: { duration: 0.35, ease: "easeOut" } }
			}
		>
			<div
				aria-hidden
				className="broker-pa-blob pointer-events-none absolute -top-28 -right-28 h-80 w-80 rounded-full bg-cyan-200/40 blur-3xl"
			/>
			<div
				aria-hidden
				className="broker-pa-blob--delayed pointer-events-none absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-emerald-200/45 blur-3xl"
			/>
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 bg-[linear-gradient(140deg,rgb(255_255_255/0.92)_0%,transparent_42%,rgb(204_251_241/0.35)_100%)]"
			/>

			<div className="relative z-10">
				<div className="flex flex-wrap items-center gap-3">
					<motion.span
						animate={
							reduceMotion
								? undefined
								: { rotate: [0, -8, 8, 0], y: [0, -2, 0] }
						}
						aria-hidden
						className="inline-flex rounded-xl bg-emerald-100/90 p-2 text-emerald-700 shadow-sm ring-1 ring-emerald-200/60"
						transition={
							reduceMotion
								? undefined
								: {
										duration: 5,
										repeat: Number.POSITIVE_INFINITY,
										ease: "easeInOut",
									}
						}
					>
						<Sparkles className="size-4" />
					</motion.span>
					<p className="font-bold text-emerald-800 text-xs uppercase tracking-[0.22em]">
						{copy.eyebrow}
					</p>
				</div>
				<h2
					className="mt-5 max-w-3xl bg-gradient-to-br from-emerald-950 via-teal-900 to-emerald-800 bg-clip-text font-black text-[32px] text-transparent leading-[1.05] tracking-[-0.04em] md:text-[44px]"
					style={{ fontFamily: "var(--broker-font-display)" }}
				>
					{copy.heading}
				</h2>
				<p className="mt-4 max-w-2xl text-pretty text-slate-600 text-sm leading-7 md:text-base">
					{copy.body}
				</p>

				<form
					className="mt-10 space-y-5 border-emerald-100/80 border-t pt-8"
					noValidate
					onSubmit={onSubmit}
				>
					<div className="grid gap-5 md:grid-cols-2">
						<motion.label
							className="block space-y-2 font-semibold text-slate-800 text-sm"
							htmlFor={borrowerPreApprovalFieldIds.fullName}
							whileTap={reduceMotion ? undefined : { scale: 0.995 }}
						>
							<span>{copy.fullNameLabel}</span>
							<Input
								autoComplete="name"
								className={borrowerPaInputClass}
								id={borrowerPreApprovalFieldIds.fullName}
								onChange={(event) =>
									setFields((previous) => ({
										...previous,
										fullName: event.target.value,
									}))
								}
								value={fields.fullName}
							/>
						</motion.label>
						<motion.label
							className="block space-y-2 font-semibold text-slate-800 text-sm"
							htmlFor={borrowerPreApprovalFieldIds.email}
							whileTap={reduceMotion ? undefined : { scale: 0.995 }}
						>
							<span>{copy.emailLabel}</span>
							<Input
								autoComplete="email"
								className={borrowerPaInputClass}
								id={borrowerPreApprovalFieldIds.email}
								inputMode="email"
								onChange={(event) =>
									setFields((previous) => ({
										...previous,
										email: event.target.value,
									}))
								}
								type="email"
								value={fields.email}
							/>
						</motion.label>
						<motion.label
							className="block space-y-2 font-semibold text-slate-800 text-sm"
							htmlFor={borrowerPreApprovalFieldIds.phone}
							whileTap={reduceMotion ? undefined : { scale: 0.995 }}
						>
							<span>{copy.phoneLabel}</span>
							<Input
								autoComplete="tel"
								className={borrowerPaInputClass}
								id={borrowerPreApprovalFieldIds.phone}
								inputMode="tel"
								onChange={(event) =>
									setFields((previous) => ({
										...previous,
										phone: event.target.value,
									}))
								}
								type="tel"
								value={fields.phone}
							/>
						</motion.label>
						<motion.label
							className="block space-y-2 font-semibold text-slate-800 text-sm"
							htmlFor={borrowerPreApprovalFieldIds.amount}
							whileTap={reduceMotion ? undefined : { scale: 0.995 }}
						>
							<span>{copy.amountLabel}</span>
							<Input
								autoComplete="off"
								className={borrowerPaInputClass}
								id={borrowerPreApprovalFieldIds.amount}
								onChange={(event) =>
									setFields((previous) => ({
										...previous,
										desiredAmount: event.target.value,
									}))
								}
								placeholder={copy.amountPlaceholder}
								value={fields.desiredAmount}
							/>
						</motion.label>
					</div>
					<motion.label
						className="block space-y-2 font-semibold text-slate-800 text-sm"
						htmlFor={borrowerPreApprovalFieldIds.address}
						whileTap={reduceMotion ? undefined : { scale: 0.995 }}
					>
						<span>{copy.addressLabel}</span>
						<Textarea
							autoComplete="street-address"
							className={cn(
								"min-h-[100px] resize-y py-3",
								borrowerPaInputClass
							)}
							id={borrowerPreApprovalFieldIds.address}
							onChange={(event) =>
								setFields((previous) => ({
									...previous,
									address: event.target.value,
								}))
							}
							placeholder={copy.addressPlaceholder}
							value={fields.address}
						/>
					</motion.label>
					{validationError ? (
						<motion.p
							animate={{ opacity: 1, x: 0 }}
							className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 font-medium text-rose-700 text-sm"
							initial={{ opacity: 0, x: -6 }}
							role="alert"
						>
							{validationError}
						</motion.p>
					) : null}
					<motion.button
						className="broker-pa-cta group relative inline-flex h-12 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 px-10 font-semibold text-sm text-white shadow-emerald-600/35 shadow-lg transition-shadow duration-300 hover:shadow-emerald-600/45 hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/50 md:text-base"
						type="submit"
						whileHover={reduceMotion ? undefined : { scale: 1.03, y: -1 }}
						whileTap={reduceMotion ? undefined : { scale: 0.97 }}
					>
						<span className="relative z-10 flex items-center gap-2">
							{copy.submitLabel}
							<motion.span
								animate={reduceMotion ? undefined : { x: [0, 3, 0] }}
								className="inline-block"
								transition={
									reduceMotion
										? undefined
										: {
												duration: 1.6,
												repeat: Number.POSITIVE_INFINITY,
												ease: "easeInOut",
											}
								}
							>
								<ArrowRight className="size-4" />
							</motion.span>
						</span>
					</motion.button>
				</form>
			</div>
		</motion.div>
	);
}

function BorrowerPreApprovalSection() {
	const copy = useBrokerContent().borrowerPreApproval;
	const reduceMotion = useReducedMotion();
	const enterTransition = borrowerPaEnterTransition(reduceMotion);
	const [fields, setFields] = useState<BorrowerPreApprovalFormFields>(
		borrowerPreApprovalEmptyFields
	);
	const [submitted, setSubmitted] = useState(false);
	const [validationError, setValidationError] = useState<string | null>(null);

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const allFilled = Object.values(fields).every(
			(value) => value.trim() !== ""
		);
		if (!allFilled) {
			setValidationError(copy.validationMessage);
			return;
		}
		setValidationError(null);
		setSubmitted(true);
	}

	return (
		<section
			className="mx-auto max-w-[1440px] px-5 py-10 md:px-8 lg:py-14 xl:px-16"
			id="borrower-pre-approval"
		>
			<AnimatePresence mode="wait">
				{submitted ? (
					<BorrowerPreApprovalSuccessCard
						copy={copy}
						enterTransition={enterTransition}
						reduceMotion={reduceMotion}
					/>
				) : (
					<BorrowerPreApprovalFormCard
						copy={copy}
						enterTransition={enterTransition}
						fields={fields}
						onSubmit={handleSubmit}
						reduceMotion={reduceMotion}
						setFields={setFields}
						validationError={validationError}
					/>
				)}
			</AnimatePresence>
		</section>
	);
}

export function BrokerWhiteLabelLandingPage() {
	const theme = useBrokerTheme();
	const content = useBrokerContent();
	const setIntent = useBrokerWhiteLabelStore((state) => state.setIntent);
	const navigate = useNavigate();

	function handleListingAccess(listingId?: string) {
		setIntent("lender", { sourceListingId: listingId });
		void navigate({ to: "/demo/broker-whitelabel/auth", viewTransition: true });
	}

	return (
		<div className="broker-shell-atmosphere" style={createThemeStyle(theme)}>
			<BrokerHeader />
			<main>
				<section className="broker-hero-section mx-auto flex max-w-[1440px] flex-col gap-12 px-5 py-8 md:px-8 lg:grid lg:grid-cols-[1fr_520px] lg:items-center lg:gap-16 lg:py-16 xl:px-16">
					<motion.div
						animate="show"
						className="space-y-6"
						initial="hidden"
						variants={brokerRevealParent}
					>
						<motion.div
							className="inline-flex items-center gap-2 rounded-full px-4 py-2 font-semibold text-[13px] shadow-sm transition-shadow duration-300 hover:shadow-md"
							style={{
								backgroundColor: "#F0FDF4",
								color: "var(--broker-success)",
							}}
							variants={brokerRevealItem}
						>
							<div
								className="size-1.5 animate-pulse rounded-full"
								style={{ backgroundColor: "var(--broker-success)" }}
							/>
							{content.hero.activeListingsLabel}
						</motion.div>
						<motion.div className="space-y-5" variants={brokerRevealItem}>
							<h1
								className="max-w-3xl font-black text-[44px] leading-[0.98] tracking-[-0.04em] md:text-[68px]"
								style={{ fontFamily: "var(--broker-font-display)" }}
							>
								{content.hero.headline}
							</h1>
							<p
								className="max-w-2xl text-lg leading-8"
								style={{ color: "var(--broker-text-muted)" }}
							>
								{content.hero.subheadline}
							</p>
						</motion.div>
						<motion.div
							className="flex flex-col gap-3 sm:flex-row"
							variants={brokerRevealItem}
						>
							<BrokerPrimaryButton
								className="w-full sm:w-auto"
								onClick={() => handleListingAccess()}
							>
								{content.hero.primaryCtaLabel}
							</BrokerPrimaryButton>
							<BrokerSecondaryButton
								className="w-full sm:w-auto"
								onClick={() =>
									document
										.getElementById("how-it-works")
										?.scrollIntoView({ behavior: "smooth" })
								}
							>
								{content.hero.secondaryCtaLabel}
							</BrokerSecondaryButton>
						</motion.div>
					</motion.div>
					<motion.div
						className="rounded-[var(--broker-radius-card)] border p-6 shadow-sm transition-[transform,box-shadow] duration-500 ease-out hover:shadow-lg lg:p-8"
						initial={{ opacity: 0, y: 22, scale: 0.98 }}
						style={{
							backgroundColor: "var(--broker-surface-muted)",
							borderColor: "var(--broker-border)",
						}}
						transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
						viewport={{ once: true, margin: "-40px" }}
						whileInView={{ opacity: 1, y: 0, scale: 1 }}
					>
						<p
							className="font-semibold text-xs uppercase tracking-[0.2em]"
							style={{ color: "var(--broker-text-muted)" }}
						>
							{content.hero.previewEyebrow}
						</p>
						<div
							className="broker-preview-sheen mt-6 flex h-[220px] items-center justify-center rounded-[20px] border bg-white/80 shadow-inner"
							style={{ borderColor: "var(--broker-border)" }}
						>
							<House
								className="broker-icon-breathe size-12"
								style={{ color: "var(--broker-text-muted)" }}
							/>
						</div>
						<h2
							className="mt-6 font-bold text-2xl"
							style={{ fontFamily: "var(--broker-font-display)" }}
						>
							{content.hero.previewTitle}
						</h2>
						<p
							className="mt-3 text-sm leading-7"
							style={{ color: "var(--broker-text-muted)" }}
						>
							{content.hero.previewBody}
						</p>
						<div className="mt-6 space-y-3">
							{content.hero.previewHighlights.map((highlight) => (
								<div
									className="flex items-center gap-3 text-sm"
									key={highlight}
								>
									<div
										className="size-2 rounded-full"
										style={{ backgroundColor: "var(--broker-accent)" }}
									/>
									<span>{highlight}</span>
								</div>
							))}
						</div>
					</motion.div>
				</section>

				<section
					className="border-y transition-colors duration-300"
					style={{
						backgroundColor: "var(--broker-surface)",
						borderColor: "var(--broker-border)",
					}}
				>
					<div className="mx-auto grid max-w-[1440px] grid-cols-3 gap-4 px-5 py-4 text-center md:grid-cols-4 md:px-8 xl:px-16">
						{content.trustMetrics.map((metric) => (
							<div className="space-y-1" key={metric.id}>
								<div
									className="font-bold text-2xl"
									style={{ fontFamily: "var(--broker-font-display)" }}
								>
									{metric.value}
								</div>
								<div
									className="text-xs md:text-sm"
									style={{ color: "var(--broker-text-muted)" }}
								>
									{metric.label}
								</div>
							</div>
						))}
					</div>
				</section>

				<section className="mx-auto max-w-[1440px] px-5 py-10 md:px-8 lg:py-14 xl:px-16">
					<div className="flex items-end justify-between gap-4">
						<div>
							<p
								className="font-bold text-sm uppercase tracking-[0.15em]"
								style={{ fontFamily: "var(--broker-font-display)" }}
							>
								Featured Listings
							</p>
							<p
								className="mt-2 text-sm"
								style={{ color: "var(--broker-text-muted)" }}
							>
								Currently available mortgage investment opportunities
							</p>
						</div>
						<Link
							className="hidden font-semibold text-sm underline-offset-4 transition-opacity hover:opacity-80 md:inline-flex"
							style={{ color: "var(--broker-primary)" }}
							to="/demo/broker-whitelabel/listings"
							viewTransition
						>
							View All
						</Link>
					</div>
					<div className="mt-6 grid gap-5 lg:grid-cols-3">
						{content.featuredListings.map((listing) => (
							<BrokerListingCard
								key={listing.id}
								listing={listing}
								onSelect={handleListingAccess}
							/>
						))}
					</div>
				</section>

				<MortgageApplicationSection />

				<BorrowerPreApprovalSection />

				<section
					className="border-y"
					id="how-it-works"
					style={{
						backgroundColor: "var(--broker-surface)",
						borderColor: "var(--broker-border)",
					}}
				>
					<div className="mx-auto max-w-[1440px] px-5 py-12 md:px-8 xl:px-16">
						<p
							className="text-center font-bold text-sm uppercase tracking-[0.15em]"
							style={{ fontFamily: "var(--broker-font-display)" }}
						>
							How It Works
						</p>
						<div className="mt-8 grid gap-8 md:grid-cols-3">
							{content.howItWorks.map((step, index) => (
								<div className="text-center" key={step.id}>
									<div
										className="mx-auto flex size-12 items-center justify-center rounded-full font-black text-xl shadow-sm transition-[transform,box-shadow] duration-200 hover:scale-105 hover:shadow-md"
										style={{
											backgroundColor: "#F0FDF4",
											color: "var(--broker-primary)",
											fontFamily: "var(--broker-font-display)",
										}}
									>
										{index + 1}
									</div>
									<h3
										className="mt-4 font-bold text-[22px]"
										style={{ fontFamily: "var(--broker-font-display)" }}
									>
										{step.label}
									</h3>
									<p
										className="mt-3 text-sm leading-7"
										style={{ color: "var(--broker-text-muted)" }}
									>
										{step.description}
									</p>
								</div>
							))}
						</div>
					</div>
				</section>

				<section className="mx-auto grid max-w-[1440px] gap-6 px-5 py-10 md:px-8 lg:grid-cols-2 xl:px-16">
					<div
						className="rounded-[var(--broker-radius-card)] border p-6 shadow-sm transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-md md:p-8"
						id="about"
						style={{
							backgroundColor: "var(--broker-surface)",
							borderColor: "var(--broker-border)",
						}}
					>
						<p
							className="font-semibold text-xs uppercase tracking-[0.2em]"
							style={{ color: "var(--broker-text-muted)" }}
						>
							About
						</p>
						<h2
							className="mt-4 font-bold text-3xl"
							style={{ fontFamily: "var(--broker-font-display)" }}
						>
							{content.about.heading}
						</h2>
						<p
							className="mt-4 text-sm leading-7"
							style={{ color: "var(--broker-text-muted)" }}
						>
							{content.about.body}
						</p>
					</div>
					<div
						className="rounded-[var(--broker-radius-card)] border p-6 shadow-sm transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-md md:p-8"
						id="contact"
						style={{
							backgroundColor: "var(--broker-surface)",
							borderColor: "var(--broker-border)",
						}}
					>
						<p
							className="font-semibold text-xs uppercase tracking-[0.2em]"
							style={{ color: "var(--broker-text-muted)" }}
						>
							Contact
						</p>
						<h2
							className="mt-4 font-bold text-3xl"
							style={{ fontFamily: "var(--broker-font-display)" }}
						>
							{content.contact.heading}
						</h2>
						<p
							className="mt-4 text-sm leading-7"
							style={{ color: "var(--broker-text-muted)" }}
						>
							{content.contact.body}
						</p>
						<div className="mt-6 space-y-2 text-sm">
							<p>invest@meridiancap.ca</p>
							<p>mortgages@meridiancap.ca</p>
							<p>200 Bay Street, Suite 1200, Toronto, ON</p>
						</div>
					</div>
				</section>
			</main>
			<BrokerFooter />
		</div>
	);
}

export function BrokerWhiteLabelListingsPage() {
	const theme = useBrokerTheme();
	const listings = useBrokerWhiteLabelStore((state) => state.listings);
	const setIntent = useBrokerWhiteLabelStore((state) => state.setIntent);
	const navigate = useNavigate();
	const [filter, setFilter] = useState<"all" | "1st" | "2nd">("all");

	const filteredListings = listings.filter((listing) => {
		if (filter === "all") {
			return true;
		}
		return filter === "1st"
			? listing.positionLabel === "1ST MORTGAGE"
			: listing.positionLabel !== "1ST MORTGAGE";
	});

	function handleListingAccess(listingId: string) {
		setIntent("lender", { sourceListingId: listingId });
		void navigate({ to: "/demo/broker-whitelabel/auth", viewTransition: true });
	}

	return (
		<div className="broker-shell-atmosphere" style={createThemeStyle(theme)}>
			<BrokerHeader />
			<main className="mx-auto max-w-[1440px] px-5 py-8 md:px-8 xl:px-16">
				<div className="space-y-4">
					<p
						className="font-semibold text-xs uppercase tracking-[0.2em]"
						style={{ color: "var(--broker-text-muted)" }}
					>
						Broker portal
					</p>
					<h1
						className="font-black text-[40px] tracking-[-0.04em]"
						style={{ fontFamily: "var(--broker-font-display)" }}
					>
						Meridian opportunity hub
					</h1>
					<p
						className="max-w-3xl text-sm leading-7"
						style={{ color: "var(--broker-text-muted)" }}
					>
						Explore Meridian's current private mortgage opportunities. Access to
						detailed memos and allocations is gated through the broker portal
						experience.
					</p>
				</div>
				<div className="mt-6 flex flex-wrap gap-3">
					{[
						["all", "All opportunities"],
						["1st", "1st mortgages"],
						["2nd", "2nd mortgages"],
					].map(([value, label]) => (
						<button
							className="rounded-full border px-4 py-2 font-medium text-sm transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-px active:scale-[0.98]"
							key={value}
							onClick={() => setFilter(value as "all" | "1st" | "2nd")}
							style={{
								backgroundColor:
									filter === value
										? "var(--broker-primary)"
										: "var(--broker-surface)",
								borderColor:
									filter === value
										? "var(--broker-primary)"
										: "var(--broker-border)",
								color:
									filter === value
										? "var(--broker-primary-foreground)"
										: "var(--broker-text)",
							}}
							type="button"
						>
							{label}
						</button>
					))}
				</div>
				<div className="mt-8 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
					{filteredListings.map((listing) => (
						<BrokerListingCard
							key={listing.id}
							listing={listing}
							onSelect={handleListingAccess}
							showSummary
						/>
					))}
				</div>
			</main>
			<BrokerFooter />
		</div>
	);
}

export function BrokerWhiteLabelAuthPage() {
	const theme = useBrokerTheme();
	const content = useBrokerContent();
	const setIntent = useBrokerWhiteLabelStore((state) => state.setIntent);
	const navigate = useNavigate();
	const [showReturningState, setShowReturningState] = useState(false);

	function handleIntentSelection(intent: Exclude<BrokerAuthIntent, "none">) {
		const sourceListingId = useBrokerWhiteLabelStore.getState().sourceListingId;
		setIntent(intent, { sourceListingId });
		void navigate({
			to: "/demo/broker-whitelabel/onboarding",
			viewTransition: true,
		});
	}

	return (
		<div className="broker-shell-atmosphere" style={createThemeStyle(theme)}>
			<BrokerHeader />
			<main className="mx-auto grid max-w-[1440px] gap-6 px-5 py-8 md:px-8 lg:grid-cols-[1.2fr_0.8fr] xl:px-16">
				<section className="space-y-6">
					<div>
						<p
							className="font-semibold text-xs uppercase tracking-[0.2em]"
							style={{ color: "var(--broker-text-muted)" }}
						>
							Gated broker access
						</p>
						<h1
							className="mt-3 font-black text-[40px] tracking-[-0.04em]"
							style={{ fontFamily: "var(--broker-font-display)" }}
						>
							Choose how you want to continue
						</h1>
						<p
							className="mt-3 max-w-2xl text-sm leading-7"
							style={{ color: "var(--broker-text-muted)" }}
						>
							Meridian uses a branded FairLend intake so lenders and borrowers
							see the right next step before full opportunity materials or
							mortgage actions are unlocked.
						</p>
					</div>
					<OpportunitySummaryPanel />
					<div className="grid gap-4 md:grid-cols-3">
						{content.authOptions.map((option) => {
							const Icon = intentIcons[option.id];
							return (
								<motion.div
									className="group rounded-[var(--broker-radius-card)] border p-5 shadow-sm transition-shadow duration-300 hover:shadow-md"
									key={option.id}
									style={{
										backgroundColor: "var(--broker-surface)",
										borderColor: "var(--broker-border)",
									}}
									transition={{ type: "spring", stiffness: 420, damping: 28 }}
									whileHover={{ y: -4 }}
									whileTap={{ scale: 0.992 }}
								>
									<div
										className="flex size-11 items-center justify-center rounded-2xl transition-transform duration-200 ease-out group-hover:scale-105"
										style={{ backgroundColor: "var(--broker-surface-muted)" }}
									>
										<Icon
											className="size-5"
											style={{ color: "var(--broker-primary)" }}
										/>
									</div>
									<h2
										className="mt-4 font-bold text-xl"
										style={{ fontFamily: "var(--broker-font-display)" }}
									>
										{option.title}
									</h2>
									<p
										className="mt-3 text-sm leading-7"
										style={{ color: "var(--broker-text-muted)" }}
									>
										{option.description}
									</p>
									<BrokerPrimaryButton
										className="mt-5 w-full"
										compact
										onClick={() => handleIntentSelection(option.id)}
									>
										{option.buttonLabel}
									</BrokerPrimaryButton>
								</motion.div>
							);
						})}
					</div>
				</section>
				<aside
					className="rounded-[32px] p-6 shadow-xl ring-1 ring-black/5 md:p-8"
					style={{
						backgroundColor: "var(--broker-primary)",
						backgroundImage:
							"radial-gradient(120% 90% at 10% 0%, color-mix(in srgb, var(--broker-primary-foreground) 12%, transparent), transparent 55%), radial-gradient(80% 60% at 100% 100%, color-mix(in srgb, #000 18%, transparent), transparent 50%)",
						color: "var(--broker-primary-foreground)",
					}}
				>
					<h2
						className="font-black text-[34px] tracking-[-0.04em]"
						style={{ fontFamily: "var(--broker-font-display)" }}
					>
						Why brokers choose FairLend
					</h2>
					<p className="mt-4 text-sm text-white/80 leading-7">
						Join 40+ mortgage brokerages already growing lender relationships
						and borrower pipelines through a branded front door.
					</p>
					<div className="mt-8 space-y-5">
						{brokerValuePoints.map((point) => (
							<div className="flex gap-4" key={point.id}>
								<div className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
									<Sparkles className="size-4" />
								</div>
								<div>
									<h3
										className="font-bold text-lg"
										style={{ fontFamily: "var(--broker-font-display)" }}
									>
										{point.title}
									</h3>
									<p className="mt-2 text-sm text-white/80 leading-7">
										{point.description}
									</p>
								</div>
							</div>
						))}
					</div>
					<div className="mt-8 rounded-[24px] bg-white/10 p-5">
						<p className="font-semibold text-white/70 text-xs uppercase tracking-[0.2em]">
							Broker results
						</p>
						<div className="mt-4 grid grid-cols-3 gap-4">
							{brokerStats.map((stat) => (
								<div key={stat.id}>
									<div
										className="font-black text-[30px]"
										style={{ fontFamily: "var(--broker-font-display)" }}
									>
										{stat.value}
									</div>
									<div className="text-white/70 text-xs leading-5">
										{stat.label}
									</div>
								</div>
							))}
						</div>
					</div>
					<div className="mt-8 border-white/10 border-t pt-6">
						<p className="text-sm text-white/70">Already a partner?</p>
						<button
							className="mt-3 inline-flex items-center gap-2 font-semibold transition-[gap,opacity] duration-200 hover:gap-2.5 hover:opacity-90"
							onClick={() => setShowReturningState((value) => !value)}
							type="button"
						>
							Mock Sign In
							<ArrowRight className="size-4" />
						</button>
						{showReturningState ? (
							<div className="mt-4 rounded-2xl bg-white/10 p-4 text-sm text-white/80 leading-6">
								This demo does not connect to WorkOS. In production, this entry
								would launch the broker-scoped sign-in flow for Meridian
								Capital.
							</div>
						) : null}
					</div>
				</aside>
			</main>
			<BrokerFooter />
		</div>
	);
}

function getIntentLabels(intent: BrokerAuthIntent) {
	if (intent === "lender") {
		return {
			title: "Tell us about your investor profile",
			description:
				"We'll use this to prepare Meridian's investor access path and shortlist the right private mortgage opportunities.",
			steps: ["Your Profile", "Investment Goals", "Review & Launch"],
			primaryButton: "Request Investor Access",
		};
	}

	if (intent === "borrower") {
		return {
			title: "Tell us about your mortgage needs",
			description:
				"We'll route your intake to Meridian's borrower desk with the right property and financing context.",
			steps: [
				"Your Details",
				"Property Goals",
				"Financial Snapshot",
				"Review & Launch",
			],
			primaryButton: "Submit Borrower Intake",
		};
	}

	return {
		title: "Start your mortgage pre-approval",
		description:
			"We'll use this intake to frame a mock pre-approval journey through Meridian's branded FairLend portal.",
		steps: [
			"Your Details",
			"Property Goals",
			"Financial Snapshot",
			"Review & Launch",
		],
		primaryButton: "Submit Pre-Approval Request",
	};
}

function BrokerOnboardingSteps({ intent }: { intent: BrokerAuthIntent }) {
	const onboarding = useBrokerWhiteLabelStore((state) => state.onboarding);
	const labels = getIntentLabels(intent);

	return (
		<div className="flex flex-wrap items-center justify-center gap-3 md:gap-6">
			{labels.steps.map((stepLabel, index) => {
				const isActive = index === onboarding.currentStep;
				const isComplete = onboarding.currentStep > index;

				return (
					<div className="flex items-center gap-3" key={stepLabel}>
						<div className="flex flex-col items-center gap-2">
							<div
								className="flex size-8 items-center justify-center rounded-full border font-black text-sm"
								style={{
									backgroundColor:
										isActive || isComplete
											? "var(--broker-primary)"
											: "var(--broker-surface)",
									borderColor:
										isActive || isComplete
											? "var(--broker-primary)"
											: "var(--broker-border)",
									color:
										isActive || isComplete
											? "var(--broker-primary-foreground)"
											: "var(--broker-text-muted)",
								}}
							>
								{index + 1}
							</div>
							<span
								className="text-xs md:text-sm"
								style={{
									color: isActive
										? "var(--broker-text)"
										: "var(--broker-text-muted)",
								}}
							>
								{stepLabel}
							</span>
						</div>
						{index < labels.steps.length - 1 ? (
							<div className="hidden h-px w-10 bg-[var(--broker-border)] md:block" />
						) : null}
					</div>
				);
			})}
		</div>
	);
}

function BrokerOnboardingForm({ intent }: { intent: BrokerAuthIntent }) {
	const onboarding = useBrokerWhiteLabelStore((state) => state.onboarding);
	const updateField = useBrokerWhiteLabelStore(
		(state) => state.updateOnboardingField
	);
	const nextStep = useBrokerWhiteLabelStore(
		(state) => state.nextOnboardingStep
	);
	const previousStep = useBrokerWhiteLabelStore(
		(state) => state.previousOnboardingStep
	);
	const submitOnboarding = useBrokerWhiteLabelStore(
		(state) => state.submitOnboarding
	);
	const labels = getIntentLabels(intent);

	const isFinalStep = onboarding.currentStep === labels.steps.length - 1;

	if (onboarding.isSubmitted) {
		return (
			<div
				className="rounded-[var(--broker-radius-card)] border p-6 md:p-8"
				style={{
					backgroundColor: "var(--broker-surface)",
					borderColor: "var(--broker-border)",
				}}
			>
				<div className="inline-flex size-12 items-center justify-center rounded-full bg-[#F0FDF4]">
					<ShieldCheck
						className="size-5"
						style={{ color: "var(--broker-success)" }}
					/>
				</div>
				<h2
					className="mt-5 font-black text-[34px] tracking-[-0.04em]"
					style={{ fontFamily: "var(--broker-font-display)" }}
				>
					Submission received
				</h2>
				<p
					className="mt-3 max-w-2xl text-sm leading-7"
					style={{ color: "var(--broker-text-muted)" }}
				>
					Meridian Capital has your mock intake details. In a real broker portal
					this would create the org-scoped FairLend onboarding record and
					trigger follow-up.
				</p>
				<div className="mt-6 grid gap-4 md:grid-cols-2">
					<div
						className="rounded-2xl border p-4"
						style={{ borderColor: "var(--broker-border)" }}
					>
						<p
							className="text-xs uppercase tracking-[0.2em]"
							style={{ color: "var(--broker-text-muted)" }}
						>
							Name
						</p>
						<p className="mt-2 font-semibold">
							{onboarding.fields.firstName} {onboarding.fields.lastName}
						</p>
					</div>
					<div
						className="rounded-2xl border p-4"
						style={{ borderColor: "var(--broker-border)" }}
					>
						<p
							className="text-xs uppercase tracking-[0.2em]"
							style={{ color: "var(--broker-text-muted)" }}
						>
							Intent
						</p>
						<p className="mt-2 font-semibold">{labels.title}</p>
					</div>
				</div>
				<div className="mt-8 flex flex-col gap-3 sm:flex-row">
					<BrokerPrimaryButton asChild>
						<Link to="/demo/broker-whitelabel" viewTransition>
							Return to broker portal
						</Link>
					</BrokerPrimaryButton>
					<BrokerSecondaryButton asChild>
						<Link to="/demo/broker-whitelabel/listings" viewTransition>
							Browse opportunities
						</Link>
					</BrokerSecondaryButton>
				</div>
			</div>
		);
	}

	return (
		<div
			className="rounded-[var(--broker-radius-card)] border p-6 md:p-8"
			style={{
				backgroundColor: "var(--broker-surface)",
				borderColor: "var(--broker-border)",
			}}
		>
			<div className="space-y-2">
				<h1
					className="font-black text-[38px] tracking-[-0.04em]"
					style={{ fontFamily: "var(--broker-font-display)" }}
				>
					{labels.title}
				</h1>
				<p
					className="max-w-3xl text-sm leading-7"
					style={{ color: "var(--broker-text-muted)" }}
				>
					{labels.description}
				</p>
			</div>

			<div className="mt-8 space-y-5">
				{onboarding.currentStep === 0 ? (
					<div className="grid gap-5 md:grid-cols-2">
						<label
							className="space-y-2 text-sm"
							htmlFor={brokerOnboardingFieldIds.firstName}
						>
							<span>First Name</span>
							<Input
								id={brokerOnboardingFieldIds.firstName}
								onChange={(event) =>
									updateField("firstName", event.target.value)
								}
								value={onboarding.fields.firstName}
							/>
						</label>
						<label
							className="space-y-2 text-sm"
							htmlFor={brokerOnboardingFieldIds.lastName}
						>
							<span>Last Name</span>
							<Input
								id={brokerOnboardingFieldIds.lastName}
								onChange={(event) =>
									updateField("lastName", event.target.value)
								}
								value={onboarding.fields.lastName}
							/>
						</label>
						<label
							className="space-y-2 text-sm"
							htmlFor={brokerOnboardingFieldIds.email}
						>
							<span>Email</span>
							<Input
								id={brokerOnboardingFieldIds.email}
								onChange={(event) => updateField("email", event.target.value)}
								value={onboarding.fields.email}
							/>
						</label>
						<label
							className="space-y-2 text-sm"
							htmlFor={brokerOnboardingFieldIds.phone}
						>
							<span>Phone</span>
							<Input
								id={brokerOnboardingFieldIds.phone}
								onChange={(event) => updateField("phone", event.target.value)}
								value={onboarding.fields.phone}
							/>
						</label>
						<label
							className="space-y-2 text-sm md:col-span-2"
							htmlFor={brokerOnboardingFieldIds.city}
						>
							<span>City</span>
							<Input
								id={brokerOnboardingFieldIds.city}
								onChange={(event) => updateField("city", event.target.value)}
								value={onboarding.fields.city}
							/>
						</label>
					</div>
				) : null}

				{onboarding.currentStep === 1 ? (
					<div className="grid gap-5 md:grid-cols-2">
						{intent === "lender" ? (
							<>
								<label
									className="space-y-2 text-sm"
									htmlFor={brokerOnboardingFieldIds.targetAllocation}
								>
									<span>Target Allocation</span>
									<Input
										id={brokerOnboardingFieldIds.targetAllocation}
										onChange={(event) =>
											updateField("targetAllocation", event.target.value)
										}
										value={onboarding.fields.targetAllocation}
									/>
								</label>
								<label
									className="space-y-2 text-sm"
									htmlFor={brokerOnboardingFieldIds.timeline}
								>
									<span>Timeline</span>
									<Input
										id={brokerOnboardingFieldIds.timeline}
										onChange={(event) =>
											updateField("timeline", event.target.value)
										}
										value={onboarding.fields.timeline}
									/>
								</label>
								<label
									className="space-y-2 text-sm"
									htmlFor={brokerOnboardingFieldIds.accreditedInvestor}
								>
									<span>Accredited Investor</span>
									<select
										className="h-9 w-full rounded-md border px-3 text-sm"
										id={brokerOnboardingFieldIds.accreditedInvestor}
										onChange={(event) =>
											updateField("accreditedInvestor", event.target.value)
										}
										style={{ borderColor: "var(--broker-border)" }}
										value={onboarding.fields.accreditedInvestor}
									>
										<option>Yes</option>
										<option>No</option>
									</select>
								</label>
								<label
									className="space-y-2 text-sm"
									htmlFor={brokerOnboardingFieldIds.experienceLevel}
								>
									<span>Experience Level</span>
									<Input
										id={brokerOnboardingFieldIds.experienceLevel}
										onChange={(event) =>
											updateField("experienceLevel", event.target.value)
										}
										value={onboarding.fields.experienceLevel}
									/>
								</label>
							</>
						) : (
							<>
								<label
									className="space-y-2 text-sm"
									htmlFor={brokerOnboardingFieldIds.propertyCity}
								>
									<span>Property City</span>
									<Input
										id={brokerOnboardingFieldIds.propertyCity}
										onChange={(event) =>
											updateField("propertyCity", event.target.value)
										}
										value={onboarding.fields.propertyCity}
									/>
								</label>
								<label
									className="space-y-2 text-sm"
									htmlFor={brokerOnboardingFieldIds.propertyType}
								>
									<span>Property Type</span>
									<Input
										id={brokerOnboardingFieldIds.propertyType}
										onChange={(event) =>
											updateField("propertyType", event.target.value)
										}
										value={onboarding.fields.propertyType}
									/>
								</label>
								<label
									className="space-y-2 text-sm"
									htmlFor={brokerOnboardingFieldIds.mortgageAmount}
								>
									<span>Mortgage Amount</span>
									<Input
										id={brokerOnboardingFieldIds.mortgageAmount}
										onChange={(event) =>
											updateField("mortgageAmount", event.target.value)
										}
										value={onboarding.fields.mortgageAmount}
									/>
								</label>
								<label
									className="space-y-2 text-sm"
									htmlFor={brokerOnboardingFieldIds.timeline}
								>
									<span>Timeline</span>
									<Input
										id={brokerOnboardingFieldIds.timeline}
										onChange={(event) =>
											updateField("timeline", event.target.value)
										}
										value={onboarding.fields.timeline}
									/>
								</label>
							</>
						)}
					</div>
				) : null}

				{onboarding.currentStep === 2 && intent !== "lender" ? (
					<div className="grid gap-5 md:grid-cols-2">
						<label
							className="space-y-2 text-sm"
							htmlFor={brokerOnboardingFieldIds.brokerageName}
						>
							<span>Brokerage Name</span>
							<Input
								id={brokerOnboardingFieldIds.brokerageName}
								onChange={(event) =>
									updateField("brokerageName", event.target.value)
								}
								value={onboarding.fields.brokerageName}
							/>
						</label>
						<label
							className="space-y-2 text-sm"
							htmlFor={brokerOnboardingFieldIds.experienceLevel}
						>
							<span>Experience Level</span>
							<Input
								id={brokerOnboardingFieldIds.experienceLevel}
								onChange={(event) =>
									updateField("experienceLevel", event.target.value)
								}
								value={onboarding.fields.experienceLevel}
							/>
						</label>
						<label
							className="space-y-2 text-sm md:col-span-2"
							htmlFor={brokerOnboardingFieldIds.notes}
						>
							<span>Notes</span>
							<Textarea
								id={brokerOnboardingFieldIds.notes}
								onChange={(event) => updateField("notes", event.target.value)}
								value={onboarding.fields.notes}
							/>
						</label>
					</div>
				) : null}

				{isFinalStep ||
				(intent === "lender" && onboarding.currentStep === 2) ? (
					<div className="grid gap-4 md:grid-cols-2">
						{[
							[
								"Contact",
								`${onboarding.fields.firstName} ${onboarding.fields.lastName}`,
							],
							["Email", onboarding.fields.email],
							[
								intent === "lender" ? "Target Allocation" : "Mortgage Amount",
								intent === "lender"
									? onboarding.fields.targetAllocation
									: onboarding.fields.mortgageAmount,
							],
							["Timeline", onboarding.fields.timeline],
						].map(([label, value]) => (
							<div
								className="rounded-2xl border p-4"
								key={label}
								style={{ borderColor: "var(--broker-border)" }}
							>
								<p
									className="text-xs uppercase tracking-[0.2em]"
									style={{ color: "var(--broker-text-muted)" }}
								>
									{label}
								</p>
								<p className="mt-2 font-semibold">{value}</p>
							</div>
						))}
					</div>
				) : null}
			</div>

			<div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-between">
				<Button
					className="h-11 rounded-[var(--broker-radius-button)] px-5 shadow-none"
					onClick={previousStep}
					style={{
						backgroundColor: "transparent",
						color: "var(--broker-text-muted)",
					}}
					type="button"
					variant="ghost"
				>
					Back
				</Button>
				<BrokerPrimaryButton
					onClick={isFinalStep ? submitOnboarding : nextStep}
				>
					{isFinalStep ? labels.primaryButton : "Continue"}
				</BrokerPrimaryButton>
			</div>
		</div>
	);
}

export function BrokerWhiteLabelOnboardingPage() {
	const theme = useBrokerTheme();
	const intent = useBrokerWhiteLabelStore((state) => state.currentIntent);
	const labels = getIntentLabels(intent);

	return (
		<div className="broker-shell-atmosphere" style={createThemeStyle(theme)}>
			<BrokerHeader showMarketingLinks={false} showPartnerPrompt />
			<main className="mx-auto max-w-[1440px] px-5 py-8 md:px-8 xl:px-16">
				{intent === "none" ? (
					<div
						className="rounded-[var(--broker-radius-card)] border p-8 shadow-sm transition-shadow duration-300 hover:shadow-md"
						style={{
							backgroundColor: "var(--broker-surface)",
							borderColor: "var(--broker-border)",
						}}
					>
						<h1
							className="font-black text-[34px]"
							style={{ fontFamily: "var(--broker-font-display)" }}
						>
							Choose a portal path first
						</h1>
						<p
							className="mt-3 text-sm leading-7"
							style={{ color: "var(--broker-text-muted)" }}
						>
							Start from the branded auth gate so this demo can tailor the
							intake flow to a lender, borrower, or mortgage applicant.
						</p>
						<BrokerPrimaryButton asChild className="mt-6">
							<Link to="/demo/broker-whitelabel/auth" viewTransition>
								Go to auth options
							</Link>
						</BrokerPrimaryButton>
					</div>
				) : (
					<>
						<div className="pb-8">
							<BrokerOnboardingSteps intent={intent} />
						</div>
						<div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
							<BrokerOnboardingForm intent={intent} />
							<aside
								className="rounded-[32px] p-6 shadow-xl ring-1 ring-black/5 md:p-8"
								style={{
									backgroundColor: "var(--broker-primary)",
									backgroundImage:
										"radial-gradient(120% 90% at 10% 0%, color-mix(in srgb, var(--broker-primary-foreground) 12%, transparent), transparent 55%), radial-gradient(80% 60% at 100% 100%, color-mix(in srgb, #000 18%, transparent), transparent 50%)",
									color: "var(--broker-primary-foreground)",
								}}
							>
								<h2
									className="font-black text-[34px] tracking-[-0.04em]"
									style={{ fontFamily: "var(--broker-font-display)" }}
								>
									Why brokers choose FairLend
								</h2>
								<p className="mt-4 text-sm text-white/80 leading-7">
									This mock flow mirrors the kind of guided intake Meridian
									would present once its white-label portal is live.
								</p>
								<div className="mt-8 space-y-5">
									{brokerValuePoints.map((point) => (
										<div className="flex gap-4" key={point.id}>
											<div className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
												<Sparkles className="size-4" />
											</div>
											<div>
												<h3
													className="font-bold text-lg"
													style={{ fontFamily: "var(--broker-font-display)" }}
												>
													{point.title}
												</h3>
												<p className="mt-2 text-sm text-white/80 leading-7">
													{point.description}
												</p>
											</div>
										</div>
									))}
								</div>
								<div className="mt-8 rounded-[24px] bg-white/10 p-5">
									<p className="font-semibold text-white/70 text-xs uppercase tracking-[0.2em]">
										Current flow
									</p>
									<p
										className="mt-3 font-bold text-2xl"
										style={{ fontFamily: "var(--broker-font-display)" }}
									>
										{labels.title}
									</p>
									<p className="mt-2 text-sm text-white/80 leading-7">
										{labels.description}
									</p>
								</div>
							</aside>
						</div>
					</>
				)}
			</main>
			<BrokerFooter />
		</div>
	);
}

export function BrokerWhiteLabelListingDetailPage({
	listingId,
}: {
	listingId: string;
}) {
	const theme = useBrokerTheme();
	const setIntent = useBrokerWhiteLabelStore((state) => state.setIntent);
	const navigate = useNavigate();
	const listing = getListingDetailMock(listingId);

	if (!listing) {
		return null;
	}

	function handleAccessRequest(intent: Exclude<BrokerAuthIntent, "none">) {
		setIntent(intent, { sourceListingId: listingId });
		void navigate({ to: "/demo/broker-whitelabel/auth", viewTransition: true });
	}

	return (
		<div className="broker-shell-atmosphere" style={createThemeStyle(theme)}>
			<BrokerHeader />
			<main className="mx-auto max-w-[1440px] px-5 py-8 md:px-8 xl:px-16">
				<Link
					className="inline-flex items-center gap-2 text-sm transition-[gap,color] duration-200 hover:gap-2.5 hover:text-[var(--broker-primary)]"
					style={{ color: "var(--broker-text-muted)" }}
					to="/demo/broker-whitelabel/listings"
					viewTransition
				>
					<ChevronRight className="size-4 rotate-180" />
					Back to listings
				</Link>
				<div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
					<section className="space-y-6">
						<div
							className="broker-preview-sheen flex h-[320px] items-center justify-center rounded-[var(--broker-radius-card)] border shadow-inner"
							style={{
								backgroundColor: "var(--broker-surface-muted)",
								borderColor: "var(--broker-border)",
							}}
						>
							<House
								className="broker-icon-breathe size-12"
								style={{ color: "var(--broker-text-muted)" }}
							/>
						</div>
						<div className="space-y-4">
							<div className="flex flex-wrap gap-2">
								{listing.badges.map((badge) => (
									<div
										className="rounded-full border px-3 py-1 font-semibold text-xs"
										key={badge.id}
										style={{
											backgroundColor:
												badge.tone === "dark"
													? "var(--broker-primary)"
													: "var(--broker-surface)",
											borderColor:
												badge.tone === "dark"
													? "var(--broker-primary)"
													: "var(--broker-border)",
											color:
												badge.tone === "dark"
													? "var(--broker-primary-foreground)"
													: "var(--broker-text)",
										}}
									>
										{badge.label}
									</div>
								))}
							</div>
							<h1
								className="font-black text-[42px] tracking-[-0.04em]"
								style={{ fontFamily: "var(--broker-font-display)" }}
							>
								{listing.title}
							</h1>
							<p
								className="text-sm"
								style={{ color: "var(--broker-text-muted)" }}
							>
								{listing.listedLabel} · {listing.map.locationText} · MLS #
								{listing.mlsId}
							</p>
							<p
								className="max-w-4xl text-sm leading-8"
								style={{ color: "var(--broker-text-muted)" }}
							>
								{listing.summary}
							</p>
						</div>
						<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
							{listing.atAGlance.map((item) => (
								<div
									className="rounded-2xl border p-4"
									key={item.label}
									style={{
										backgroundColor: "var(--broker-surface)",
										borderColor: "var(--broker-border)",
									}}
								>
									<p
										className="text-xs uppercase tracking-[0.2em]"
										style={{ color: "var(--broker-text-muted)" }}
									>
										{item.label}
									</p>
									<p className="mt-2 font-semibold text-lg">{item.value}</p>
								</div>
							))}
						</div>
						<div
							className="rounded-[var(--broker-radius-card)] border p-6"
							style={{
								backgroundColor: "var(--broker-surface)",
								borderColor: "var(--broker-border)",
							}}
						>
							<p
								className="font-semibold text-xs uppercase tracking-[0.2em]"
								style={{ color: "var(--broker-text-muted)" }}
							>
								Executive summary
							</p>
							<p
								className="mt-4 text-sm leading-8"
								style={{ color: "var(--broker-text-muted)" }}
							>
								{listing.summary}
							</p>
						</div>
					</section>

					<aside
						className="self-start rounded-[var(--broker-radius-card)] border p-6 shadow-sm transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-md"
						style={{
							backgroundColor: "var(--broker-surface)",
							borderColor: "var(--broker-border)",
						}}
					>
						<p
							className="font-semibold text-xs uppercase tracking-[0.2em]"
							style={{ color: "var(--broker-text-muted)" }}
						>
							Broker portal required
						</p>
						<h2
							className="mt-3 font-bold text-2xl"
							style={{ fontFamily: "var(--broker-font-display)" }}
						>
							Request access to the full opportunity memo
						</h2>
						<p
							className="mt-3 text-sm leading-7"
							style={{ color: "var(--broker-text-muted)" }}
						>
							This preview is intentionally limited. Meridian unlocks documents,
							borrower materials, and next actions after a lender or borrower
							intake.
						</p>
						<div className="mt-6 space-y-3">
							<BrokerPrimaryButton
								className="w-full"
								onClick={() => handleAccessRequest("lender")}
							>
								I'm a Lender
							</BrokerPrimaryButton>
							<BrokerSecondaryButton
								className="w-full"
								onClick={() => handleAccessRequest("mortgage-applicant")}
							>
								Apply for Pre-Approval
							</BrokerSecondaryButton>
						</div>
						<div
							className="mt-6 border-t pt-6"
							style={{ borderColor: "var(--broker-border)" }}
						>
							<p className="font-semibold text-sm">Included in gated access</p>
							<ul
								className="mt-3 space-y-2 text-sm"
								style={{ color: "var(--broker-text-muted)" }}
							>
								<li>Full appraisal and title package</li>
								<li>Meridian underwriting notes</li>
								<li>Next-step coordination with counsel</li>
							</ul>
						</div>
					</aside>
				</div>
			</main>
			<BrokerFooter />
		</div>
	);
}
