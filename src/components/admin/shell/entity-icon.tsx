import type { LucideProps } from "lucide-react";
import {
	BadgeDollarSign,
	Box,
	Briefcase,
	Building,
	Building2,
	CalendarClock,
	FileText,
	Handshake,
	Landmark,
	Shield,
	User,
	Users,
	X,
} from "lucide-react";

const ICONS_BY_NAME = {
	BadgeDollarSign,
	Box,
	Briefcase,
	Building,
	Building2,
	CalendarClock,
	FileText,
	Handshake,
	Landmark,
	Shield,
	User,
	Users,
	X,
	"badge-dollar-sign": BadgeDollarSign,
	box: Box,
	briefcase: Briefcase,
	building: Building,
	"building-2": Building2,
	"calendar-clock": CalendarClock,
	"file-text": FileText,
	handshake: Handshake,
	landmark: Landmark,
	shield: Shield,
	user: User,
	users: Users,
	x: X,
} as const satisfies Record<string, typeof FileText>;

interface EntityIconProps extends LucideProps {
	iconName?: string;
}

export function EntityIcon({ iconName, ...props }: EntityIconProps) {
	const normalizedIconName = iconName?.trim();
	const Icon = normalizedIconName
		? ICONS_BY_NAME[normalizedIconName as keyof typeof ICONS_BY_NAME]
		: undefined;

	if (Icon) {
		return <Icon {...props} />;
	}

	return <FileText {...props} />;
}
