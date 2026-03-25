import { useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@workos/authkit-tanstack-react-start/client";
import { useEffect } from "react";
import { buildSignInRedirect } from "#/lib/auth-redirect";

type UserOrNull = ReturnType<typeof useAuth>["user"];

// redirects to the sign-in page if the user is not signed in
export const useUser = (): UserOrNull => {
	const { user, loading } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();

	useEffect(() => {
		if (loading || user) {
			return;
		}

		void navigate(buildSignInRedirect(location.href));
	}, [loading, user, location.href, navigate]);

	return user;
};
