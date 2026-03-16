import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
	BarChart3,
	History,
	PenLine,
	Plus,
	Sparkles,
	Trash2,
	Users,
} from "lucide-react";
import { useCallback, useState } from "react";
import { DemoLayout } from "#/components/demo-layout";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/demo/convex-triggers")({
	ssr: false,
	component: TriggersDemo,
});

const CATEGORIES = ["personal", "work", "other"] as const;

function operationVariant(op: string) {
	if (op === "delete") {
		return "destructive" as const;
	}
	if (op === "insert") {
		return "default" as const;
	}
	return "secondary" as const;
}

function TriggersDemo() {
	// @ts-expect-error — fluent-convex deep generics exceed TS instantiation depth
	const contacts = useQuery(api.demo.triggers.listContacts);
	const stats = useQuery(api.demo.triggers.getStats);
	const log = useQuery(api.demo.triggers.getLog);

	const addContact = useMutation(api.demo.triggers.addContact);
	const updateContact = useMutation(api.demo.triggers.updateContact);
	const deleteContact = useMutation(api.demo.triggers.deleteContact);
	const seedContacts = useMutation(api.demo.triggers.seedContacts);

	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [email, setEmail] = useState("");
	const [category, setCategory] = useState<string>("personal");
	const [error, setError] = useState<string | null>(null);

	const [editingId, setEditingId] =
		useState<Id<"demo_triggers_contacts"> | null>(null);
	const [editFirstName, setEditFirstName] = useState("");
	const [editLastName, setEditLastName] = useState("");
	const [editEmail, setEditEmail] = useState("");
	const [editCategory, setEditCategory] = useState("personal");

	const handleAdd = useCallback(async () => {
		if (!(firstName.trim() && lastName.trim() && email.trim())) {
			return;
		}
		setError(null);
		try {
			await addContact({
				firstName: firstName.trim(),
				lastName: lastName.trim(),
				email: email.trim(),
				category,
			});
			setFirstName("");
			setLastName("");
			setEmail("");
			setCategory("personal");
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, [addContact, firstName, lastName, email, category]);

	const handleUpdate = useCallback(async () => {
		if (!editingId) {
			return;
		}
		setError(null);
		try {
			await updateContact({
				id: editingId,
				firstName: editFirstName,
				lastName: editLastName,
				email: editEmail,
				category: editCategory,
			});
			setEditingId(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, [
		updateContact,
		editingId,
		editFirstName,
		editLastName,
		editEmail,
		editCategory,
	]);

	const handleDelete = useCallback(
		async (id: Id<"demo_triggers_contacts">) => {
			setError(null);
			try {
				await deleteContact({ id });
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		},
		[deleteContact]
	);

	return (
		<DemoLayout
			description="React to database writes with computed fields, validation, denormalized counts, and audit logging — all atomic within the same transaction."
			docsHref="https://stack.convex.dev/triggers"
			title="Triggers"
		>
			<div className="space-y-6">
				{error && (
					<div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-destructive text-sm">
						{error}
					</div>
				)}

				<div className="grid gap-6 lg:grid-cols-3">
					{/* Contact Manager */}
					<div className="space-y-4 lg:col-span-2">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-base">
									<Users className="size-4" />
									Contact Manager
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="flex flex-wrap gap-2">
									<Input
										className="min-w-[120px] flex-1"
										onChange={(e) => setFirstName(e.target.value)}
										placeholder="First name"
										value={firstName}
									/>
									<Input
										className="min-w-[120px] flex-1"
										onChange={(e) => setLastName(e.target.value)}
										placeholder="Last name"
										value={lastName}
									/>
									<Input
										className="min-w-[160px] flex-1"
										onChange={(e) => setEmail(e.target.value)}
										placeholder="Email"
										value={email}
									/>
									<select
										className="rounded-md border bg-background px-3 py-2 text-sm"
										onChange={(e) => setCategory(e.target.value)}
										value={category}
									>
										{CATEGORIES.map((c) => (
											<option key={c} value={c}>
												{c}
											</option>
										))}
									</select>
									<Button
										disabled={
											!(firstName.trim() && lastName.trim() && email.trim())
										}
										onClick={handleAdd}
										size="sm"
									>
										<Plus className="mr-1 size-3.5" />
										Add
									</Button>
								</div>

								{contacts && contacts.length === 0 && (
									<div className="py-4 text-center">
										<p className="mb-2 text-muted-foreground text-sm">
											No contacts yet.
										</p>
										<Button
											onClick={() => seedContacts({})}
											size="sm"
											variant="outline"
										>
											<Sparkles className="mr-1 size-3.5" />
											Seed sample contacts
										</Button>
									</div>
								)}

								{contacts?.map((contact) => (
									<div className="rounded-md border p-3" key={contact._id}>
										{editingId === contact._id ? (
											<div className="space-y-2">
												<div className="flex flex-wrap gap-2">
													<Input
														className="min-w-[120px] flex-1"
														onChange={(e) => setEditFirstName(e.target.value)}
														value={editFirstName}
													/>
													<Input
														className="min-w-[120px] flex-1"
														onChange={(e) => setEditLastName(e.target.value)}
														value={editLastName}
													/>
													<Input
														className="min-w-[160px] flex-1"
														onChange={(e) => setEditEmail(e.target.value)}
														value={editEmail}
													/>
													<select
														className="rounded-md border bg-background px-3 py-2 text-sm"
														onChange={(e) => setEditCategory(e.target.value)}
														value={editCategory}
													>
														{CATEGORIES.map((c) => (
															<option key={c} value={c}>
																{c}
															</option>
														))}
													</select>
												</div>
												<div className="flex gap-2">
													<Button onClick={handleUpdate} size="sm">
														Save
													</Button>
													<Button
														onClick={() => setEditingId(null)}
														size="sm"
														variant="outline"
													>
														Cancel
													</Button>
												</div>
											</div>
										) : (
											<div className="flex items-center gap-2">
												<div className="min-w-0 flex-1">
													<p className="font-medium">{contact.fullName}</p>
													<p className="text-muted-foreground text-sm">
														{contact.email}
													</p>
												</div>
												<Badge variant="outline">{contact.category}</Badge>
												<Button
													onClick={() => {
														setEditingId(contact._id);
														setEditFirstName(contact.firstName);
														setEditLastName(contact.lastName);
														setEditEmail(contact.email);
														setEditCategory(contact.category);
														setError(null);
													}}
													size="icon"
													variant="ghost"
												>
													<PenLine className="size-4" />
												</Button>
												<Button
													onClick={() => handleDelete(contact._id)}
													size="icon"
													variant="ghost"
												>
													<Trash2 className="size-4" />
												</Button>
											</div>
										)}
									</div>
								))}
							</CardContent>
						</Card>
					</div>

					{/* Right column: Stats + Log */}
					<div className="space-y-4">
						{/* Live Stats */}
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-base">
									<BarChart3 className="size-4" />
									Live Stats
								</CardTitle>
							</CardHeader>
							<CardContent>
								{stats && stats.length > 0 ? (
									<div className="space-y-2">
										{stats.map((s) => (
											<div
												className="flex items-center justify-between rounded-md border p-2"
												key={s._id}
											>
												<span className="text-sm capitalize">{s.category}</span>
												<Badge variant="secondary">{s.count}</Badge>
											</div>
										))}
									</div>
								) : (
									<p className="text-muted-foreground text-sm">
										Add contacts to see category counts.
									</p>
								)}
							</CardContent>
						</Card>

						{/* Change Log */}
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-base">
									<History className="size-4" />
									Change Log
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="max-h-80 space-y-2 overflow-y-auto">
									{log && log.length > 0 ? (
										log.map((entry) => (
											<div
												className="rounded-md border p-2 text-sm"
												key={entry._id}
											>
												<div className="flex items-center gap-2">
													<Badge variant={operationVariant(entry.operation)}>
														{entry.operation}
													</Badge>
													<span className="text-muted-foreground text-xs">
														{new Date(entry.timestamp).toLocaleTimeString()}
													</span>
												</div>
												<p className="mt-1 text-muted-foreground text-xs">
													{entry.summary}
												</p>
											</div>
										))
									) : (
										<p className="text-muted-foreground text-sm">
											Change history will appear here.
										</p>
									)}
								</div>
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		</DemoLayout>
	);
}
