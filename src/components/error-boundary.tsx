import {
	AlertTriangle,
	ArrowLeft,
	Bug,
	Check,
	ChevronDown,
	ChevronRight,
	Clipboard,
	Globe,
	Home,
	Lock,
	RefreshCw,
	Search,
	ServerCrash,
	ShieldAlert,
	Timer,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import {
	classifyError,
	type ErrorCategory,
	generateErrorId,
	parseStack,
	type StackFrame,
} from "#/lib/error-utils";
import { cn } from "#/lib/utils";

const IS_DEV = process.env.NODE_ENV !== "production";

// ---------------------------------------------------------------------------
// Category → icon + accent color mapping
// ---------------------------------------------------------------------------

const CATEGORY_STYLE: Record<
	ErrorCategory,
	{ icon: React.ElementType; accent: string; iconColor: string }
> = {
	network: {
		icon: Globe,
		accent: "border-amber-500/20 bg-amber-500/5",
		iconColor: "text-amber-600 dark:text-amber-400",
	},
	auth: {
		icon: Lock,
		accent: "border-blue-500/20 bg-blue-500/5",
		iconColor: "text-blue-600 dark:text-blue-400",
	},
	"not-found": {
		icon: Search,
		accent: "border-[var(--lagoon)]/20 bg-[var(--lagoon)]/5",
		iconColor: "text-[var(--lagoon-deep)]",
	},
	validation: {
		icon: ShieldAlert,
		accent: "border-orange-500/20 bg-orange-500/5",
		iconColor: "text-orange-600 dark:text-orange-400",
	},
	"rate-limit": {
		icon: Timer,
		accent: "border-purple-500/20 bg-purple-500/5",
		iconColor: "text-purple-600 dark:text-purple-400",
	},
	server: {
		icon: ServerCrash,
		accent: "border-[var(--destructive)]/20 bg-[var(--destructive)]/5",
		iconColor: "text-[var(--destructive-foreground)]",
	},
	unknown: {
		icon: AlertTriangle,
		accent: "border-[var(--destructive)]/20 bg-[var(--destructive)]/5",
		iconColor: "text-[var(--destructive-foreground)]",
	},
};

// ---------------------------------------------------------------------------
// Diagnostic context for support / observability
// ---------------------------------------------------------------------------

interface ErrorContext {
	errorId: string;
	page: string;
	timestamp: string;
	traceId: string | null;
	userAgent: string;
	userId: string | null;
}

function useErrorContext(userId?: string | null): ErrorContext {
	return useMemo(() => {
		const page =
			typeof window !== "undefined" ? window.location.href : "unknown";
		const userAgent =
			typeof navigator !== "undefined" ? navigator.userAgent : "unknown";

		return {
			errorId: generateErrorId(),
			timestamp: new Date().toISOString(),
			page,
			userId: userId ?? null,
			userAgent,
			traceId: null, // TODO: populate from Sentry / observability SDK
		};
	}, [userId]);
}

// ---------------------------------------------------------------------------
// Copy-to-clipboard
// ---------------------------------------------------------------------------

function useCopyToClipboard() {
	const [copied, setCopied] = useState(false);
	const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	const copy = useCallback((text: string) => {
		navigator.clipboard
			.writeText(text)
			.then(() => {
				setCopied(true);
				clearTimeout(timeout.current);
				timeout.current = setTimeout(() => setCopied(false), 2000);
			})
			.catch(() => {
				// Clipboard unavailable (insecure context, permissions denied, etc.)
			});
	}, []);

	useEffect(() => () => clearTimeout(timeout.current), []);

	return { copied, copy };
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function Collapsible({
	title,
	defaultOpen = false,
	children,
}: {
	title: string;
	defaultOpen?: boolean;
	children: React.ReactNode;
}) {
	const [open, setOpen] = useState(defaultOpen);

	return (
		<div className="rounded-lg border border-[var(--line)]">
			<button
				className="flex w-full items-center gap-2 px-4 py-3 text-left font-medium text-sm transition-colors hover:bg-[var(--surface)]"
				onClick={() => setOpen((prev) => !prev)}
				type="button"
			>
				{open ? (
					<ChevronDown className="size-4 text-[var(--sea-ink-soft)]" />
				) : (
					<ChevronRight className="size-4 text-[var(--sea-ink-soft)]" />
				)}
				{title}
			</button>
			{open && (
				<div className="border-[var(--line)] border-t px-4 py-3">
					{children}
				</div>
			)}
		</div>
	);
}

function ContextRow({ label, value }: { label: string; value: string | null }) {
	if (!value) {
		return null;
	}
	return (
		<div className="flex items-baseline gap-3 py-1">
			<span className="shrink-0 font-medium text-[var(--sea-ink-soft)] text-xs uppercase tracking-wider">
				{label}
			</span>
			<span className="min-w-0 break-all font-mono text-xs">{value}</span>
		</div>
	);
}

function StackTraceView({ frames }: { frames: StackFrame[] }) {
	if (frames.length === 0) {
		return null;
	}

	return (
		<div className="max-h-72 overflow-auto rounded-lg bg-[#1d2e45] p-4">
			<pre className="text-xs leading-5">
				{frames.map((frame, i) => (
					<div
						className={cn(
							"py-0.5",
							i === 0 ? "text-red-300" : "text-slate-400"
						)}
						key={frame.raw}
					>
						<span className="mr-2 inline-block w-5 text-right text-slate-600">
							{i + 1}
						</span>
						{frame.fn && <span className="text-sky-300">{frame.fn}</span>}
						{frame.file && (
							<span className="text-slate-500">
								{" "}
								{frame.file}
								{frame.line && (
									<span className="text-amber-400">
										:{frame.line}
										{frame.col && `:${frame.col}`}
									</span>
								)}
							</span>
						)}
						{!(frame.fn || frame.file) && (
							<span className="text-slate-500">{frame.raw}</span>
						)}
					</div>
				))}
			</pre>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main error component
// ---------------------------------------------------------------------------

export interface AppErrorComponentProps {
	error: Error;
	reset?: () => void;
	/** Pass the current user ID when available — avoids calling useAuth inside the error boundary. */
	userId?: string | null;
}

export function AppErrorComponent({
	error,
	reset,
	userId,
}: AppErrorComponentProps) {
	const ctx = useErrorContext(userId);
	const { copied, copy } = useCopyToClipboard();
	const classified = useMemo(() => classifyError(error), [error]);
	const frames = useMemo(() => parseStack(error.stack), [error.stack]);
	const style = CATEGORY_STYLE[classified.category];
	const CategoryIcon = style.icon;

	const buildCopyPayload = useCallback(() => {
		const sections = [
			`Error: ${error.message}`,
			`Category: ${classified.category}`,
			`Error ID: ${ctx.errorId}`,
			`Timestamp: ${ctx.timestamp}`,
			`Page: ${ctx.page}`,
			ctx.userId ? `User ID: ${ctx.userId}` : null,
			ctx.traceId ? `Trace ID: ${ctx.traceId}` : null,
			"",
			"Stack Trace:",
			error.stack || "No stack trace available",
			"",
			`User Agent: ${ctx.userAgent}`,
		];
		return sections.filter(Boolean).join("\n");
	}, [error, classified.category, ctx]);

	return (
		<div className="rise-in flex min-h-[60vh] items-center justify-center px-4 py-16">
			<div className="w-full max-w-2xl">
				{/* ── Hero card ─────────────────────────────────────── */}
				<div className="island-shell overflow-hidden rounded-2xl">
					{/* Accent gradient stripe */}
					<div className="h-1 bg-gradient-to-r from-[var(--lagoon)] via-[var(--lagoon-deep)] to-[var(--palm)]" />

					<div className="p-8 sm:p-10">
						{/* Icon + heading */}
						<div className="mb-6 flex items-start gap-4">
							<div
								className={cn(
									"flex size-12 shrink-0 items-center justify-center rounded-xl",
									style.accent
								)}
							>
								<CategoryIcon className={cn("size-6", style.iconColor)} />
							</div>
							<div className="min-w-0">
								<h1 className="display-title font-bold text-xl tracking-tight sm:text-2xl">
									{classified.title}
								</h1>
								<p className="mt-1 text-[var(--sea-ink-soft)] text-sm leading-relaxed">
									{classified.description}
								</p>
							</div>
						</div>

						{/* Dev: raw error message */}
						{IS_DEV && (
							<div
								className={cn("mb-6 rounded-xl border px-4 py-3", style.accent)}
							>
								<div className="mb-1 flex items-center gap-1.5">
									<Zap className="size-3 text-[var(--sea-ink-soft)]" />
									<span className="font-medium text-[var(--sea-ink-soft)] text-xs uppercase tracking-wider">
										Error message
									</span>
								</div>
								<p className="font-mono text-sm leading-relaxed">
									{error.message || "Unknown error"}
								</p>
							</div>
						)}

						{/* ── Dev-only: full diagnostics ────────────────── */}
						{IS_DEV && (
							<div className="mb-6 space-y-3">
								{frames.length > 0 && (
									<Collapsible defaultOpen title="Stack Trace">
										<StackTraceView frames={frames} />
									</Collapsible>
								)}

								<Collapsible title="Error Context">
									<div className="space-y-0.5">
										<ContextRow label="Error ID" value={ctx.errorId} />
										<ContextRow label="Category" value={classified.category} />
										<ContextRow label="Timestamp" value={ctx.timestamp} />
										<ContextRow label="Page" value={ctx.page} />
										<ContextRow label="User ID" value={ctx.userId} />
										<ContextRow
											label="Trace ID"
											value={ctx.traceId ?? "not configured"}
										/>
										<ContextRow label="User Agent" value={ctx.userAgent} />
									</div>
								</Collapsible>
							</div>
						)}

						{/* ── Prod: compact reference info ──────────────── */}
						{!IS_DEV && (
							<div className="mb-6 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
								<p className="mb-2 font-medium text-[var(--sea-ink-soft)] text-xs uppercase tracking-wider">
									Reference info
								</p>
								<div className="space-y-0.5">
									<ContextRow label="Error ID" value={ctx.errorId} />
									<ContextRow
										label="Time"
										value={new Date(ctx.timestamp).toLocaleString()}
									/>
									<ContextRow label="Page" value={ctx.page} />
									{ctx.traceId && (
										<ContextRow label="Trace ID" value={ctx.traceId} />
									)}
								</div>
							</div>
						)}

						{/* ── Actions ──────────────────────────────────── */}
						<div className="flex flex-wrap items-center gap-3">
							{reset && (
								<Button onClick={reset} size="sm" variant="default">
									<RefreshCw className="size-3.5" />
									Try again
								</Button>
							)}

							<Button
								onClick={() => {
									window.location.href = "/";
								}}
								size="sm"
								variant="outline"
							>
								<Home className="size-3.5" />
								Go home
							</Button>

							{typeof window !== "undefined" && window.history.length > 1 && (
								<Button
									onClick={() => window.history.back()}
									size="sm"
									variant="ghost"
								>
									<ArrowLeft className="size-3.5" />
									Go back
								</Button>
							)}

							<div className="flex-1" />

							<Button
								className="text-[var(--sea-ink-soft)]"
								onClick={() => copy(buildCopyPayload())}
								size="sm"
								variant="ghost"
							>
								{copied ? (
									<>
										<Check className="size-3.5 text-[var(--palm)]" />
										Copied
									</>
								) : (
									<>
										<Clipboard className="size-3.5" />
										Copy {IS_DEV ? "error" : "details"}
									</>
								)}
							</Button>
						</div>
					</div>
				</div>

				{/* ── Footer hint ──────────────────────────────────── */}
				{!IS_DEV && (
					<p className="mt-4 text-center text-[var(--sea-ink-soft)] text-xs">
						If this keeps happening, share the Error ID with our support team so
						we can investigate.
					</p>
				)}

				{IS_DEV && (
					<div className="mt-4 flex items-center justify-center gap-2 text-[var(--sea-ink-soft)] text-xs">
						<Bug className="size-3.5" />
						<span>This detailed view is only visible in development.</span>
					</div>
				)}
			</div>
		</div>
	);
}
