import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { useAppForm } from "#/hooks/demo.form";

const EMAIL_REGEX = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const POSTAL_CODE_PATTERNS: Record<string, RegExp> = {
	US: /^\d{5}(-\d{4})?$/,
	CA: /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i,
	GB: /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i,
	AU: /^\d{4}$/,
	DE: /^\d{5}$/,
	FR: /^\d{5}$/,
	JP: /^\d{3}-?\d{4}$/,
};
const POSTAL_CODE_FALLBACK = /^[A-Za-z0-9\s-]{2,10}$/;
const PHONE_REGEX = /^(\+\d{1,3})?\s?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/;

export const Route = createFileRoute("/demo/form/address")({
	component: AddressForm,
});

function AddressForm() {
	const [submitMessage, setSubmitMessage] = useState<string | null>(null);

	const form = useAppForm({
		defaultValues: {
			fullName: "",
			email: "",
			address: {
				street: "",
				city: "",
				state: "",
				zipCode: "",
				country: "",
			},
			phone: "",
		},
		validators: {
			onBlur: ({ value }) => {
				const errors = {
					fields: {},
				} as {
					fields: Record<string, string>;
				};
				if (value.fullName.trim().length === 0) {
					errors.fields.fullName = "Full name is required";
				}
				return errors;
			},
		},
		onSubmit: ({ value }) => {
			console.log(value);
			setSubmitMessage("Form submitted successfully.");
			setTimeout(() => setSubmitMessage(null), 3000);
		},
	});

	return (
		<div
			className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-100 to-blue-100 p-4 text-white"
			style={{
				backgroundImage:
					"radial-gradient(50% 50% at 5% 40%, #f4a460 0%, #8b4513 70%, #1a0f0a 100%)",
			}}
		>
			<div className="w-full max-w-2xl rounded-xl border-8 border-black/10 bg-black/50 p-8 shadow-xl backdrop-blur-md">
				<form
					className="space-y-6"
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
				>
					<form.AppField name="fullName">
						{(field) => <field.TextField label="Full Name" />}
					</form.AppField>

					<form.AppField
						name="email"
						validators={{
							onBlur: ({ value }) => {
								if (!value || value.trim().length === 0) {
									return "Email is required";
								}
								if (!EMAIL_REGEX.test(value)) {
									return "Invalid email address";
								}
								return undefined;
							},
						}}
					>
						{(field) => <field.TextField label="Email" />}
					</form.AppField>

					<form.AppField
						name="address.street"
						validators={{
							onBlur: ({ value }) => {
								if (!value || value.trim().length === 0) {
									return "Street address is required";
								}
								return undefined;
							},
						}}
					>
						{(field) => <field.TextField label="Street Address" />}
					</form.AppField>

					<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
						<form.AppField
							name="address.city"
							validators={{
								onBlur: ({ value }) => {
									if (!value || value.trim().length === 0) {
										return "City is required";
									}
									return undefined;
								},
							}}
						>
							{(field) => <field.TextField label="City" />}
						</form.AppField>
						<form.AppField
							name="address.state"
							validators={{
								onBlur: ({ value }) => {
									if (!value || value.trim().length === 0) {
										return "State is required";
									}
									return undefined;
								},
							}}
						>
							{(field) => <field.TextField label="State" />}
						</form.AppField>
						<form.AppField
							name="address.zipCode"
							validators={{
								onBlur: ({ value, fieldApi }) => {
									if (!value || value.trim().length === 0) {
										return "Zip code is required";
									}
									const country =
										fieldApi.form.getFieldValue("address.country");
									const pattern =
										POSTAL_CODE_PATTERNS[country] ?? POSTAL_CODE_FALLBACK;
									if (!pattern.test(value)) {
										return "Invalid postal code format";
									}
									return undefined;
								},
							}}
						>
							{(field) => <field.TextField label="Postal Code" />}
						</form.AppField>
					</div>

					<form.AppField
						name="address.country"
						validators={{
							onBlur: ({ value }) => {
								if (!value || value.trim().length === 0) {
									return "Country is required";
								}
								return undefined;
							},
						}}
					>
						{(field) => (
							<field.Select
								label="Country"
								placeholder="Select a country"
								values={[
									{ label: "United States", value: "US" },
									{ label: "Canada", value: "CA" },
									{ label: "United Kingdom", value: "GB" },
									{ label: "Australia", value: "AU" },
									{ label: "Germany", value: "DE" },
									{ label: "France", value: "FR" },
									{ label: "Japan", value: "JP" },
								]}
							/>
						)}
					</form.AppField>

					<form.AppField
						name="phone"
						validators={{
							onBlur: ({ value }) => {
								if (!value || value.trim().length === 0) {
									return "Phone number is required";
								}
								if (!PHONE_REGEX.test(value)) {
									return "Invalid phone number format";
								}
								return undefined;
							},
						}}
					>
						{(field) => (
							<field.TextField label="Phone" placeholder="123-456-7890" />
						)}
					</form.AppField>

					<div className="flex justify-end">
						<form.AppForm>
							<form.SubscribeButton label="Submit" />
						</form.AppForm>
					</div>

					{submitMessage ? (
						<p className="font-medium text-emerald-200">{submitMessage}</p>
					) : null}
				</form>
			</div>
		</div>
	);
}
