import { authKit } from "../../auth";

export interface WorkosProvisioning {
	createOrganization(args: { name: string }): Promise<{ id: string }>;
	createOrganizationMembership(args: {
		organizationId: string;
		roleSlug: string;
		userId: string;
	}): Promise<unknown>;
}

const defaultProvisioning: WorkosProvisioning = {
	createOrganization: (args) =>
		authKit.workos.organizations.createOrganization(args),
	createOrganizationMembership: (args) =>
		authKit.workos.userManagement.createOrganizationMembership(args),
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
