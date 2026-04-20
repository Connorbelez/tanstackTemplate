"use client";

import { motion } from "framer-motion";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Slider } from "#/components/ui/slider";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "#/components/ui/tooltip";

interface RangeSliderWithHistogramProps {
	bufferPercentage?: number;
	className?: string;
	defaultValue?: [number, number];
	formatValue?: (value: number) => string;
	histogramData?: number[];
	inRangeClass?: string;
	max?: number;
	maxLabel?: string;
	min?: number;
	minLabel?: string;
	onValueChange?: (values: [number, number]) => void;
	outOfRangeClass?: string;
	renderTooltip?: (count: number, value: number) => React.ReactNode;
	showCard?: boolean;
	showTitle?: boolean;
	step?: number;
	targetBarCount?: number;
	title?: string;
	variant?: "compact" | "full";
}

const RangeSliderWithHistogram: React.FC<RangeSliderWithHistogramProps> = ({
	min = 50_000,
	max = 5_000_000,
	step = 100_000,
	histogramData,
	onValueChange,
	title = "Budget",
	formatValue = (value) => `$${value.toLocaleString()}`,
	minLabel = "Minimum",
	maxLabel = "Maximum",
	bufferPercentage = 0,
	inRangeClass = "bg-[#0A6EFF]",
	outOfRangeClass = "bg-gray-300",
	className,
	defaultValue = [min, max],
	renderTooltip,
	variant = "full",
	targetBarCount = 20,
	showTitle = true,
}) => {
	const [currentValue, setCurrentValue] =
		useState<[number, number]>(defaultValue);

	useEffect(() => {
		setCurrentValue(defaultValue);
	}, [defaultValue]);

	const [minValue, maxValue] = currentValue;
	const numBars = Math.max(1, targetBarCount);
	const bucketSize = (max - min) / numBars;

	const histogramDataToUse = useMemo(() => {
		if (histogramData?.length === numBars) {
			return histogramData;
		}

		return Array.from({ length: numBars }, () => 0);
	}, [histogramData, numBars]);

	const maxCount = useMemo(() => {
		const maxVal = Math.max(...histogramDataToUse);
		return maxVal === 0 ? 1 : maxVal;
	}, [histogramDataToUse]);

	const bufferRange = (maxValue - minValue) * bufferPercentage;
	const viewMin = Math.max(min, minValue - bufferRange);
	const viewMax = Math.min(max, maxValue + bufferRange);
	const isCompact = variant === "compact";
	const containerClass = isCompact
		? `space-y-2 ${className ?? ""}`
		: `w-full max-w-lg space-y-4 rounded-lg p-8 shadow-lg ${className ?? ""}`;
	const titleClass = isCompact
		? "mb-1 font-semibold text-sm"
		: "mb-4 font-bold text-2xl";
	const valueClass = isCompact
		? "font-medium text-primary text-sm"
		: "text-primary text-xl";
	const histogramHeight = isCompact ? "h-28" : "h-32";

	return (
		<TooltipProvider delayDuration={0}>
			<div className={containerClass}>
				{showTitle ? <h2 className={titleClass}>{title}</h2> : null}

				<div className="mb-2 flex justify-between">
					<span className={valueClass}>{formatValue(minValue)}</span>
					<span className={valueClass}>{formatValue(maxValue)}</span>
				</div>

				<div className={`relative overflow-hidden ${histogramHeight}`}>
					<div className="flex h-full items-end">
						{histogramDataToUse.map((count, index) => {
							const bucketStart = min + index * bucketSize;
							const bucketEnd = min + (index + 1) * bucketSize;
							const currentBucketValue = (bucketStart + bucketEnd) / 2;
							const isInRange =
								currentBucketValue >= minValue &&
								currentBucketValue <= maxValue;
							const isInView =
								currentBucketValue >= viewMin && currentBucketValue <= viewMax;
							const barColor =
								isInRange || isInView ? inRangeClass : outOfRangeClass;

							return (
								<Tooltip key={`${bucketStart}-${bucketEnd}`}>
									<TooltipTrigger asChild>
										<motion.div
											animate={{ height: `${(count / maxCount) * 100}%` }}
											className={`mx-[1px] flex-1 rounded-sm ${barColor}`}
											initial={{ height: 0 }}
											transition={{ duration: 0.3 }}
										/>
									</TooltipTrigger>
									<TooltipContent className="z-[200]">
										{renderTooltip ? (
											renderTooltip(count, currentBucketValue)
										) : (
											<p>
												Count: {count}
												<br />
												{formatValue(currentBucketValue)}
											</p>
										)}
									</TooltipContent>
								</Tooltip>
							);
						})}
					</div>
				</div>

				<div className="relative mt-2">
					<Slider
						max={max}
						min={min}
						onValueChange={(values) => {
							const nextValue = values as [number, number];
							setCurrentValue(nextValue);
							onValueChange?.(nextValue);
						}}
						step={step}
						value={currentValue}
					/>
					<div className="mt-2 flex justify-between">
						<span className="text-gray-400">{minLabel}</span>
						<span className="text-gray-400">{maxLabel}</span>
					</div>
				</div>
			</div>
		</TooltipProvider>
	);
};

export default RangeSliderWithHistogram;
