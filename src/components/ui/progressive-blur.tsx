"use client";

import { cn } from "#/lib/utils";

export interface ProgressiveBlurProps {
	blurLevels?: number[];
	className?: string;
	height?: string;
	position?: "top" | "bottom" | "both";
}

export function ProgressiveBlur({
	className,
	height = "30%",
	position = "bottom",
	blurLevels = [0.5, 1, 2, 4, 8, 16, 32, 64],
}: ProgressiveBlurProps) {
	const safeBlurLevels = blurLevels.length >= 2 ? blurLevels : [0.5, 1];
	const step = 100 / safeBlurLevels.length;
	const divElements = Array(Math.max(0, safeBlurLevels.length - 2)).fill(null);

	const firstLayerMask =
		position === "bottom"
			? `linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) ${step}%, rgba(0,0,0,1) ${step * 2}%, rgba(0,0,0,0) ${step * 3}%)`
			: position === "top"
				? `linear-gradient(to top, rgba(0,0,0,0) 0%, rgba(0,0,0,1) ${step}%, rgba(0,0,0,1) ${step * 2}%, rgba(0,0,0,0) ${step * 3}%)`
				: "linear-gradient(rgba(0,0,0,0) 0%, rgba(0,0,0,1) 5%, rgba(0,0,0,1) 95%, rgba(0,0,0,0) 100%)";

	const middleLayerMask = (
		blurIndex: number
	): string =>
		position === "bottom"
			? `linear-gradient(to bottom, rgba(0,0,0,0) ${blurIndex * step}%, rgba(0,0,0,1) ${(blurIndex + 1) * step}%, rgba(0,0,0,1) ${(blurIndex + 2) * step}%, rgba(0,0,0,0) ${(blurIndex + 3) * step}%)`
			: position === "top"
				? `linear-gradient(to top, rgba(0,0,0,0) ${blurIndex * step}%, rgba(0,0,0,1) ${(blurIndex + 1) * step}%, rgba(0,0,0,1) ${(blurIndex + 2) * step}%, rgba(0,0,0,0) ${(blurIndex + 3) * step}%)`
				: "linear-gradient(rgba(0,0,0,0) 0%, rgba(0,0,0,1) 5%, rgba(0,0,0,1) 95%, rgba(0,0,0,0) 100%)";

	const lastLayerMask =
		position === "bottom"
			? `linear-gradient(to bottom, rgba(0,0,0,0) ${100 - step}%, rgba(0,0,0,1) 100%)`
			: position === "top"
				? `linear-gradient(to top, rgba(0,0,0,0) ${100 - step}%, rgba(0,0,0,1) 100%)`
				: "linear-gradient(rgba(0,0,0,0) 0%, rgba(0,0,0,1) 5%, rgba(0,0,0,1) 95%, rgba(0,0,0,0) 100%)";

	return (
		<div
			className={cn(
				"gradient-blur pointer-events-none absolute inset-x-0 z-10",
				className,
				position === "top"
					? "top-0"
					: position === "bottom"
						? "bottom-0"
						: "inset-y-0"
			)}
			style={{ height }}
		>
			<div
				className="absolute inset-0"
				style={{
					zIndex: 1,
					backdropFilter: `blur(${safeBlurLevels[0]}px)`,
					WebkitBackdropFilter: `blur(${safeBlurLevels[0]}px)`,
					maskImage: firstLayerMask,
					WebkitMaskImage: firstLayerMask,
				}}
			/>

			{divElements.map((_, index) => {
				const blurIndex = index + 1;

				return (
					<div
						className="absolute inset-0"
						key={`blur-${index}`}
						style={{
							zIndex: index + 2,
							backdropFilter: `blur(${safeBlurLevels[blurIndex]}px)`,
							WebkitBackdropFilter: `blur(${safeBlurLevels[blurIndex]}px)`,
							maskImage: middleLayerMask(blurIndex),
							WebkitMaskImage: middleLayerMask(blurIndex),
						}}
					/>
				);
			})}

			<div
				className="absolute inset-0"
				style={{
					zIndex: safeBlurLevels.length,
					backdropFilter: `blur(${safeBlurLevels[safeBlurLevels.length - 1]}px)`,
					WebkitBackdropFilter: `blur(${safeBlurLevels[safeBlurLevels.length - 1]}px)`,
					maskImage: lastLayerMask,
					WebkitMaskImage: lastLayerMask,
				}}
			/>
		</div>
	);
}

export default ProgressiveBlur;
