import { authKit } from "../../auth";

export interface WorkosProvisioning {
	createOrganization(args: { name: string }): Promise<{ id: string }>;
	createOrganizationMembership(args: {
		organizationId: string;
		roleSlug: string;
		userId: string;
	}): Promise<unknown>;
	createUser(args: {
		email: string;
		firstName?: string;
		lastName?: string;
	}): Promise<{ email: string; id: string }>;
	listUsers(args: {
		email?: string;
	}): Promise<Array<{ email: string; id: string }>>;
}

const defaultProvisioning: WorkosProvisioning = {
	createOrganization: (args) =>
		authKit.workos.organizations.createOrganization(args),
	createOrganizationMembership: (args) =>
		authKit.workos.userManagement.createOrganizationMembership(args),
	createUser: async (args) => {
		const user = await authKit.workos.userManagement.createUser({
			email: args.email,
			firstName: args.firstName,
			lastName: args.lastName,
		});
		return { email: user.email, id: user.id };
	},
	listUsers: async (args) => {
		const users = await authKit.workos.userManagement.listUsers(args);
		return users.data.map((user) => ({ email: user.email, id: user.id }));
	},
};

let overrideProvisioning: WorkosProvisioning | null = null;

export function getWorkosProvisioning(): WorkosProvisioning {
	return overrideProvisioning ?? defaultProvisioning;
}

export function setWorkosProvisioningForTests(
	provisioning: WorkosProvisioning | null
) {
	overrideProvisioning = provisioning;
}
