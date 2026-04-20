import { Link } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import {
	NativeSelect,
	NativeSelectOption,
} from "#/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { Textarea } from "#/components/ui/textarea";
import { EMPTY_ADMIN_DETAIL_SEARCH } from "#/lib/admin-detail-search";
import type { Id } from "../../../../convex/_generated/dataModel";

interface RotessaBorrowerOption {
	borrowerId: string;
	email: string | null;
	fullName: string;
}

interface RotessaReconciliationSnapshot {
	borrowerOptions: RotessaBorrowerOption[];
	brokenLinks: Array<{
		externalScheduleRef: string;
		linkedMortgageId: string;
		providerScheduleId: string;
		reason: string;
	}>;
	conflicts: Array<{
		detail: string;
		entityId: string;
		entityType: "customer" | "schedule";
		title: string;
	}>;
	generatedAt: number;
	lastSyncRun: {
		customerCount: number;
		errorMessage: string | null;
		finishedAt: number | null;
		scheduleCount: number;
		startedAt: number;
		status: "failed" | "running" | "success";
		trigger: "cron" | "manual";
	} | null;
	padAuthorizationExceptions: Array<{
		caseId: string;
		label: string;
		padAuthorizationSource: "admin_override" | "uploaded" | null;
		selectedBorrowerId: string | null;
		selectedProviderScheduleId: string | null;
		updatedAt: number;
	}>;
	summary: {
		availableSchedules: number;
		conflictCustomers: number;
		conflictSchedules: number;
		linkedCustomers: number;
		linkedSchedules: number;
		unmatchedCustomers: number;
		unmatchedSchedules: number;
	};
	unmatchedCustomers: Array<{
		accountSummary: string;
		customerProfileId: string;
		email: string | null;
		externalCustomerRef: string;
		fullName: string;
		scheduleCount: number;
	}>;
	unmatchedSchedules: Array<{
		amountCents: number | null;
		externalScheduleRef: string;
		frequency: string;
		nextProcessDate: string | null;
		processDate: string;
		providerScheduleId: string;
		providerStatus: string | null;
		sourceCustomer: string;
	}>;
}

interface RotessaReconciliationPageProps {
	createBorrowerFromCustomer: (args: {
		customerProfileId: Id<"externalCustomerProfiles">;
	}) => Promise<unknown>;
	linkCustomerToBorrower: (args: {
		borrowerId: Id<"borrowers">;
		customerProfileId: Id<"externalCustomerProfiles">;
		note?: string;
	}) => Promise<unknown>;
	onRefresh: () => Promise<unknown>;
	snapshot: RotessaReconciliationSnapshot;
	suppressItem: (args: {
		entityId: string;
		entityType: "customer" | "schedule";
		reason: string;
	}) => Promise<unknown>;
	syncNow: () => Promise<unknown>;
}

function formatCurrency(value: number | null) {
	if (value === null) {
		return "Unavailable";
	}
	return new Intl.NumberFormat("en-CA", {
		currency: "CAD",
		style: "currency",
	}).format(value / 100);
}

function formatDateTime(value: number | null | undefined) {
	if (!value) {
		return "Not available";
	}
	return new Intl.DateTimeFormat("en-CA", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(value);
}

function formatDate(value: string | null) {
	if (!value) {
		return "Unknown";
	}
	return value;
}

export function RotessaReconciliationPage({
	createBorrowerFromCustomer,
	linkCustomerToBorrower,
	onRefresh,
	snapshot,
	suppressItem,
	syncNow,
}: RotessaReconciliationPageProps) {
	const [busyKey, setBusyKey] = useState<string | null>(null);
	const [selectedBorrowerByCustomerId, setSelectedBorrowerByCustomerId] =
		useState<Record<string, string>>({});
	const [noteByCustomerId, setNoteByCustomerId] = useState<
		Record<string, string>
	>({});
	const [suppressionReasonByItemId, setSuppressionReasonByItemId] = useState<
		Record<string, string>
	>({});

	const borrowerOptions = useMemo(
		() =>
			snapshot.borrowerOptions.map((borrower) => ({
				label: borrower.email
					? `${borrower.fullName} (${borrower.email})`
					: borrower.fullName,
				value: borrower.borrowerId,
			})),
		[snapshot.borrowerOptions]
	);

	async function runBusyAction(key: string, action: () => Promise<void>) {
		setBusyKey(key);
		try {
			await action();
		} finally {
			setBusyKey(null);
		}
	}

	return (
		<div className="space-y-6 p-6">
			<div className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-background px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
				<div className="space-y-2">
					<div className="flex flex-wrap items-center gap-2">
						<h1 className="font-semibold text-2xl tracking-tight">
							Rotessa Reconciliation
						</h1>
						<Badge variant="outline">Payments</Badge>
					</div>
					<p className="max-w-3xl text-muted-foreground text-sm leading-6">
						Sync the Rotessa sandbox into canonical customer and schedule
						read-models, resolve unmatched identities, suppress false positives,
						and repair broken payment-rail linkages before origination or
						servicing uses them.
					</p>
					<p className="text-muted-foreground text-sm">
						Last sync:{" "}
						{snapshot.lastSyncRun
							? `${snapshot.lastSyncRun.status} at ${formatDateTime(snapshot.lastSyncRun.finishedAt ?? snapshot.lastSyncRun.startedAt)}`
							: "No sync run recorded yet"}
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button
						onClick={() =>
							void runBusyAction("refresh", async () => {
								await onRefresh();
								toast.success("Rotessa reconciliation refreshed.");
							})
						}
						type="button"
						variant="outline"
					>
						Refresh
					</Button>
					<Button
						disabled={busyKey === "sync"}
						onClick={() =>
							void runBusyAction("sync", async () => {
								await syncNow();
								await onRefresh();
								toast.success("Rotessa sync completed.");
							})
						}
						type="button"
					>
						{busyKey === "sync" ? (
							<RefreshCw className="mr-2 size-4 animate-spin" />
						) : (
							<RefreshCw className="mr-2 size-4" />
						)}
						Run sync now
					</Button>
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<Card className="border-border/70">
					<CardHeader className="pb-3">
						<CardDescription>Unmatched customers</CardDescription>
						<CardTitle className="text-3xl">
							{snapshot.summary.unmatchedCustomers}
						</CardTitle>
					</CardHeader>
					<CardContent className="text-muted-foreground text-sm">
						Customers in Rotessa that still need canonical borrower linkage.
					</CardContent>
				</Card>
				<Card className="border-border/70">
					<CardHeader className="pb-3">
						<CardDescription>Unmatched schedules</CardDescription>
						<CardTitle className="text-3xl">
							{snapshot.summary.unmatchedSchedules}
						</CardTitle>
					</CardHeader>
					<CardContent className="text-muted-foreground text-sm">
						Schedules that are imported but not yet attached to a borrower.
					</CardContent>
				</Card>
				<Card className="border-border/70">
					<CardHeader className="pb-3">
						<CardDescription>Conflicts</CardDescription>
						<CardTitle className="text-3xl">
							{snapshot.summary.conflictCustomers +
								snapshot.summary.conflictSchedules}
						</CardTitle>
					</CardHeader>
					<CardContent className="text-muted-foreground text-sm">
						Rows requiring manual review before they can be used safely.
					</CardContent>
				</Card>
				<Card className="border-border/70">
					<CardHeader className="pb-3">
						<CardDescription>Available schedules</CardDescription>
						<CardTitle className="text-3xl">
							{snapshot.summary.availableSchedules}
						</CardTitle>
					</CardHeader>
					<CardContent className="text-muted-foreground text-sm">
						Imported schedules ready to be reserved by origination.
					</CardContent>
				</Card>
			</div>

			<Tabs className="space-y-4" defaultValue="customers">
				<TabsList className="flex h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
					<TabsTrigger value="customers">Unmatched customers</TabsTrigger>
					<TabsTrigger value="schedules">Unmatched schedules</TabsTrigger>
					<TabsTrigger value="conflicts">Conflicts</TabsTrigger>
					<TabsTrigger value="broken-links">Broken links</TabsTrigger>
					<TabsTrigger value="pad-exceptions">PAD exceptions</TabsTrigger>
				</TabsList>

				<TabsContent className="space-y-4" value="customers">
					{snapshot.unmatchedCustomers.length === 0 ? (
						<Card className="border-border/70">
							<CardContent className="px-6 py-8 text-muted-foreground text-sm">
								All imported Rotessa customers are matched or intentionally
								suppressed.
							</CardContent>
						</Card>
					) : (
						snapshot.unmatchedCustomers.map((customer) => (
							<Card
								className="border-border/70"
								key={customer.customerProfileId}
							>
								<CardHeader>
									<div className="flex flex-wrap items-center justify-between gap-3">
										<div>
											<CardTitle className="text-base">
												{customer.fullName}
											</CardTitle>
											<CardDescription>
												{customer.email ?? "Missing email"} •{" "}
												{customer.accountSummary || "Bank summary unavailable"}{" "}
												• {customer.scheduleCount} schedules
											</CardDescription>
										</div>
										<Badge variant="outline">
											Rotessa {customer.externalCustomerRef}
										</Badge>
									</div>
								</CardHeader>
								<CardContent className="space-y-3">
									<div className="grid gap-3 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,0.3fr)]">
										<div className="space-y-2">
											<label
												className="font-medium text-sm"
												htmlFor={`borrower-link-${customer.customerProfileId}`}
											>
												Link to existing borrower
											</label>
											<NativeSelect
												id={`borrower-link-${customer.customerProfileId}`}
												onChange={(event) =>
													setSelectedBorrowerByCustomerId((current) => ({
														...current,
														[customer.customerProfileId]: event.target.value,
													}))
												}
												value={
													selectedBorrowerByCustomerId[
														customer.customerProfileId
													] ?? ""
												}
											>
												<NativeSelectOption value="">
													Select borrower
												</NativeSelectOption>
												{borrowerOptions.map((borrower) => (
													<NativeSelectOption
														key={`${customer.customerProfileId}:${borrower.value}`}
														value={borrower.value}
													>
														{borrower.label}
													</NativeSelectOption>
												))}
											</NativeSelect>
										</div>
										<div className="space-y-2">
											<label
												className="font-medium text-sm"
												htmlFor={`borrower-link-note-${customer.customerProfileId}`}
											>
												Audit note
											</label>
											<Input
												id={`borrower-link-note-${customer.customerProfileId}`}
												onChange={(event) =>
													setNoteByCustomerId((current) => ({
														...current,
														[customer.customerProfileId]: event.target.value,
													}))
												}
												placeholder="Optional note"
												value={
													noteByCustomerId[customer.customerProfileId] ?? ""
												}
											/>
										</div>
									</div>
									<div className="flex flex-wrap gap-2">
										<Button
											disabled={
												busyKey === customer.customerProfileId ||
												!selectedBorrowerByCustomerId[
													customer.customerProfileId
												]
											}
											onClick={() =>
												void runBusyAction(
													customer.customerProfileId,
													async () => {
														await linkCustomerToBorrower({
															borrowerId: selectedBorrowerByCustomerId[
																customer.customerProfileId
															] as Id<"borrowers">,
															customerProfileId:
																customer.customerProfileId as Id<"externalCustomerProfiles">,
															note:
																noteByCustomerId[customer.customerProfileId] ||
																undefined,
														});
														await onRefresh();
														toast.success(
															"Rotessa customer linked to borrower."
														);
													}
												)
											}
											type="button"
										>
											Link borrower
										</Button>
										<Button
											disabled={
												busyKey === `create:${customer.customerProfileId}`
											}
											onClick={() =>
												void runBusyAction(
													`create:${customer.customerProfileId}`,
													async () => {
														await createBorrowerFromCustomer({
															customerProfileId:
																customer.customerProfileId as Id<"externalCustomerProfiles">,
														});
														await onRefresh();
														toast.success(
															"Borrower created from Rotessa customer."
														);
													}
												)
											}
											type="button"
											variant="outline"
										>
											Create borrower
										</Button>
									</div>
								</CardContent>
							</Card>
						))
					)}
				</TabsContent>

				<TabsContent className="space-y-4" value="schedules">
					{snapshot.unmatchedSchedules.length === 0 ? (
						<Card className="border-border/70">
							<CardContent className="px-6 py-8 text-muted-foreground text-sm">
								No unmatched schedules remain.
							</CardContent>
						</Card>
					) : (
						snapshot.unmatchedSchedules.map((schedule) => (
							<Card
								className="border-border/70"
								key={schedule.providerScheduleId}
							>
								<CardHeader>
									<div className="flex flex-wrap items-center justify-between gap-3">
										<div>
											<CardTitle className="text-base">
												{schedule.externalScheduleRef}
											</CardTitle>
											<CardDescription>
												{schedule.sourceCustomer} • {schedule.frequency} •{" "}
												{formatCurrency(schedule.amountCents)}
											</CardDescription>
										</div>
										<Badge variant="outline">
											{schedule.providerStatus ?? "Unknown status"}
										</Badge>
									</div>
								</CardHeader>
								<CardContent className="space-y-3">
									<p className="text-muted-foreground text-sm">
										Process date {formatDate(schedule.processDate)}. Next
										process date {formatDate(schedule.nextProcessDate)}.
									</p>
									<Textarea
										onChange={(event) =>
											setSuppressionReasonByItemId((current) => ({
												...current,
												[schedule.providerScheduleId]: event.target.value,
											}))
										}
										placeholder="Suppress reason, if this schedule should be ignored."
										value={
											suppressionReasonByItemId[schedule.providerScheduleId] ??
											""
										}
									/>
									<div className="flex flex-wrap gap-2">
										<Button
											disabled={
												busyKey === `suppress:${schedule.providerScheduleId}` ||
												!suppressionReasonByItemId[
													schedule.providerScheduleId
												]?.trim()
											}
											onClick={() =>
												void runBusyAction(
													`suppress:${schedule.providerScheduleId}`,
													async () => {
														await suppressItem({
															entityId: schedule.providerScheduleId,
															entityType: "schedule",
															reason:
																suppressionReasonByItemId[
																	schedule.providerScheduleId
																].trim(),
														});
														await onRefresh();
														toast.success("Schedule suppressed.");
													}
												)
											}
											type="button"
											variant="outline"
										>
											Suppress schedule
										</Button>
									</div>
								</CardContent>
							</Card>
						))
					)}
				</TabsContent>

				<TabsContent className="space-y-4" value="conflicts">
					{snapshot.conflicts.length === 0 ? (
						<Card className="border-border/70">
							<CardContent className="px-6 py-8 text-muted-foreground text-sm">
								No conflicts are currently flagged.
							</CardContent>
						</Card>
					) : (
						snapshot.conflicts.map((conflict) => (
							<Card className="border-border/70" key={conflict.entityId}>
								<CardHeader>
									<div className="flex flex-wrap items-center justify-between gap-3">
										<div>
											<CardTitle className="text-base">
												{conflict.title}
											</CardTitle>
											<CardDescription>{conflict.detail}</CardDescription>
										</div>
										<Badge variant="outline">{conflict.entityType}</Badge>
									</div>
								</CardHeader>
								<CardContent className="space-y-3">
									<Textarea
										onChange={(event) =>
											setSuppressionReasonByItemId((current) => ({
												...current,
												[conflict.entityId]: event.target.value,
											}))
										}
										placeholder="Document why this conflict is a false positive or should be suppressed."
										value={suppressionReasonByItemId[conflict.entityId] ?? ""}
									/>
									<div className="flex flex-wrap gap-2">
										<Button
											disabled={
												busyKey === `conflict:${conflict.entityId}` ||
												!suppressionReasonByItemId[conflict.entityId]?.trim()
											}
											onClick={() =>
												void runBusyAction(
													`conflict:${conflict.entityId}`,
													async () => {
														await suppressItem({
															entityId: conflict.entityId,
															entityType: conflict.entityType,
															reason:
																suppressionReasonByItemId[
																	conflict.entityId
																].trim(),
														});
														await onRefresh();
														toast.success("Conflict suppressed.");
													}
												)
											}
											type="button"
											variant="outline"
										>
											Suppress conflict
										</Button>
									</div>
								</CardContent>
							</Card>
						))
					)}
				</TabsContent>

				<TabsContent className="space-y-4" value="broken-links">
					{snapshot.brokenLinks.length === 0 ? (
						<Card className="border-border/70">
							<CardContent className="px-6 py-8 text-muted-foreground text-sm">
								No broken imported schedule links are currently detected.
							</CardContent>
						</Card>
					) : (
						snapshot.brokenLinks.map((item) => (
							<Card className="border-border/70" key={item.providerScheduleId}>
								<CardHeader>
									<CardTitle className="text-base">
										{item.externalScheduleRef}
									</CardTitle>
									<CardDescription>{item.reason}</CardDescription>
								</CardHeader>
								<CardContent className="text-sm">
									Linked mortgage {item.linkedMortgageId}. Provider schedule{" "}
									{item.providerScheduleId}.
								</CardContent>
							</Card>
						))
					)}
				</TabsContent>

				<TabsContent className="space-y-4" value="pad-exceptions">
					{snapshot.padAuthorizationExceptions.length === 0 ? (
						<Card className="border-border/70">
							<CardContent className="px-6 py-8 text-muted-foreground text-sm">
								No origination cases are missing PAD authorization evidence.
							</CardContent>
						</Card>
					) : (
						snapshot.padAuthorizationExceptions.map((item) => (
							<Card className="border-border/70" key={item.caseId}>
								<CardHeader>
									<div className="flex flex-wrap items-center justify-between gap-3">
										<div>
											<CardTitle className="text-base">{item.label}</CardTitle>
											<CardDescription>
												PAD source {item.padAuthorizationSource ?? "missing"} •
												last updated {formatDateTime(item.updatedAt)}
											</CardDescription>
										</div>
										<Button asChild type="button" variant="outline">
											<Link
												params={{ caseId: item.caseId }}
												search={EMPTY_ADMIN_DETAIL_SEARCH}
												to="/admin/originations/$caseId"
											>
												Open origination
											</Link>
										</Button>
									</div>
								</CardHeader>
								<CardContent className="text-sm">
									Borrower {item.selectedBorrowerId ?? "not selected"} •
									schedule {item.selectedProviderScheduleId ?? "not selected"}.
								</CardContent>
							</Card>
						))
					)}
				</TabsContent>
			</Tabs>
		</div>
	);
}
