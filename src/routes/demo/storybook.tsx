import { createFileRoute } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "#/components/storybook/button";
import { Dialog } from "#/components/storybook/dialog";
import { Input } from "#/components/storybook/input";
import { RadioGroup } from "#/components/storybook/radio-group";
import { Slider } from "#/components/storybook/slider";

export const Route = createFileRoute("/demo/storybook")({
	component: StorybookDemo,
});

function StorybookDemo() {
	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [employmentType, setEmploymentType] = useState("full-time");
	const [coffeeCups, setCoffeeCups] = useState(3);

	const handleSubmit = (event?: FormEvent<HTMLFormElement>) => {
		event?.preventDefault();
	};

	const handleReset = () => {
		setFirstName("");
		setLastName("");
		setEmploymentType("full-time");
		setCoffeeCups(3);
	};

	return (
		<div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 px-4 py-12 dark:from-gray-900 dark:to-gray-800">
			<div className="mx-auto max-w-2xl">
				<Dialog
					footer={
						<div className="flex justify-end gap-3">
							<Button onClick={handleReset} size="medium" variant="secondary">
								Reset
							</Button>
							<Button
								form="employee-form"
								onClick={() => handleSubmit()}
								size="medium"
								type="submit"
								variant="primary"
							>
								Submit
							</Button>
						</div>
					}
					title="Employee Information Form"
				>
					<form
						className="space-y-6"
						id="employee-form"
						onSubmit={handleSubmit}
					>
						<Input
							id="firstName"
							label="First Name"
							onChange={setFirstName}
							placeholder="John"
							required
							value={firstName}
						/>

						<Input
							id="lastName"
							label="Last Name"
							onChange={setLastName}
							placeholder="Doe"
							required
							value={lastName}
						/>

						<RadioGroup
							label="Employment Type"
							name="employmentType"
							onChange={setEmploymentType}
							options={[
								{ value: "full-time", label: "Full Time" },
								{ value: "part-time", label: "Part Time" },
							]}
							value={employmentType}
						/>

						<Slider
							id="coffeeCups"
							label="Coffee Cups Per Day"
							max={10}
							min={0}
							onChange={setCoffeeCups}
							value={coffeeCups}
						/>
					</form>
				</Dialog>
			</div>
		</div>
	);
}
