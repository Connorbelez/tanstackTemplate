import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";

export const Route = createFileRoute("/demo/broker-whitelabel")({
	ssr: false,
	component: BrokerWhiteLabelRouteLayout,
});

function BrokerWhiteLabelRouteLayout() {
	const location = useLocation();
	return (
		<AnimatePresence mode="wait">
			<motion.div
				animate={{ opacity: 1, y: 0 }}
				className="min-h-dvh"
				exit={{ opacity: 0, y: -10 }}
				initial={{ opacity: 0, y: 12 }}
				key={location.pathname}
				transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
			>
				<Outlet />
			</motion.div>
		</AnimatePresence>
	);
}
