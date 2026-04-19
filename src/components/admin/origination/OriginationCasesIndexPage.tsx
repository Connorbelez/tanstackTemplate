import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { useAdminBreadcrumbLabel } from "#/components/admin/shell/AdminPageMetadataContext";
import {
	AdminPageSkeleton,
	AdminTableSkeleton,
} from "#/components/admin/shell/AdminRouteStates";
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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { EMPTY_ADMIN_DETAIL_SEARCH } from "#/lib/admin-detail-search";
import { api } from "../../../../convex/_generated/api";
import {
	formatOriginationCurrency,
	formatOriginationDateTime,
	formatOriginationStepLabel,
} from "./workflow";

function matchesSearch(value: string, query: string) {
	return value.toLowerCase().includes(query.toLowerCase());
}

export function OriginationCasesIndexPage() {
	const cases = useQuery(api.admin.origination.cases.listCases, {});
	const [search, setSearch] = useState("");
	const deferredSearch = useDeferredValue(search);

	useAdminBreadcrumbLabel("Originations");

	const filteredCases = useMemo(() => {
		if (!cases) {
			return [];
		}

		if (!deferredSearch.trim()) {
			return cases;
		}

		return cases.filter((row) =>
			[row.caseShortId, row.label, row.primaryBorrowerName, row.propertyAddress]
				.filter(Boolean)
				.some((value) => matchesSearch(value ?? "", deferredSearch))
		);
	}, [cases, deferredSearch]);

	if (cases === undefined) {
		return (
			<AdminPageSkeleton>
				<AdminTableSkeleton columnCount={6} rowCount={6} />
			</AdminPageSkeleton>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card px-6 py-6 shadow-sm lg:flex-row lg:items-end lg:justify-between">
				<div className="space-y-2">
					<p className="font-semibold text-muted-foreground text-sm uppercase tracking-[0.18em]">
						Admin origination
					</p>
					<h1 className="font-semibold text-3xl tracking-tight">
						Origination cases
					</h1>
					<p className="max-w-3xl text-muted-foreground text-sm leading-6">
						Draft mortgage-backed originations staged in backoffice before any
						canonical borrower, property, mortgage, listing, payment, or
						document rows exist.
					</p>
				</div>
				<Button asChild>
					<Link search={EMPTY_ADMIN_DETAIL_SEARCH} to="/admin/originations/new">
						<Plus className="mr-2 size-4" />
						New origination
					</Link>
				</Button>
			</div>

			<Card className="border-border/70">
				<CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
					<div className="space-y-1">
						<CardTitle>Draft queue</CardTitle>
						<CardDescription>
							Resume any staged case from the exact last saved step.
						</CardDescription>
					</div>
					<div className="w-full max-w-sm space-y-2">
						<label className="font-medium text-sm" htmlFor="origination-search">
							Search drafts
						</label>
						<Input
							id="origination-search"
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Search by borrower, address, or case ID"
							value={search}
						/>
					</div>
				</CardHeader>
				<CardContent>
					{filteredCases.length > 0 ? (
						<div className="overflow-hidden rounded-2xl border border-border/70">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Case</TableHead>
										<TableHead>Borrower</TableHead>
										<TableHead>Property</TableHead>
										<TableHead>Principal</TableHead>
										<TableHead>Step</TableHead>
										<TableHead>Updated</TableHead>
										<TableHead className="text-right">Action</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{filteredCases.map((row) => (
										<TableRow key={row.caseId}>
											<TableCell>
												<div className="space-y-1">
													<p className="font-medium">{row.label}</p>
													<p className="text-muted-foreground text-xs">
														Case {row.caseShortId}
													</p>
												</div>
											</TableCell>
											<TableCell>
												{row.primaryBorrowerName ?? "Not staged"}
											</TableCell>
											<TableCell>
												{row.propertyAddress ?? "Not staged"}
											</TableCell>
											<TableCell>
												{formatOriginationCurrency(row.principal)}
											</TableCell>
											<TableCell>
												{formatOriginationStepLabel(row.currentStep)}
											</TableCell>
											<TableCell>
												{formatOriginationDateTime(row.updatedAt)}
											</TableCell>
											<TableCell className="text-right">
												<Button asChild size="sm" variant="outline">
													<Link
														params={{ caseId: row.caseId }}
														search={EMPTY_ADMIN_DETAIL_SEARCH}
														to="/admin/originations/$caseId"
													>
														Resume
													</Link>
												</Button>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					) : (
						<div className="rounded-2xl border border-border/70 border-dashed px-6 py-12 text-center">
							<p className="font-medium text-lg">
								{search.trim()
									? "No origination drafts match that search."
									: "No origination drafts exist yet."}
							</p>
							<p className="mt-2 text-muted-foreground text-sm">
								{search.trim()
									? "Try another borrower name, address, or case identifier."
									: "Create the first draft to stage an origination case and activate it from review when it is ready."}
							</p>
							{search.trim() ? null : (
								<Button asChild className="mt-4">
									<Link
										search={EMPTY_ADMIN_DETAIL_SEARCH}
										to="/admin/originations/new"
									>
										<Plus className="mr-2 size-4" />
										New origination
									</Link>
								</Button>
							)}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
