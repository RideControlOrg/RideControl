import { type ChartTooltipExtension, tooltip } from '@tanstack/charts/tooltip';

const TOOLTIP_PRESENTATION_PROPERTIES = [
	'z-index',
	'padding',
	'font',
	'color',
	'background',
	'border',
	'border-radius',
	'box-shadow',
] as const;

export const chartTooltip: ChartTooltipExtension = {
	...tooltip,
	create(context) {
		const nativeTooltip = tooltip.create(context);
		let root: HTMLElement | null = null;

		return {
			...nativeTooltip,
			paint(paintContext) {
				nativeTooltip.paint(paintContext);
				if (root) {
					return;
				}

				// The native tooltip creates its root lazily during the first paint.
				root = context.container.querySelector<HTMLElement>(
					':scope > .ride-control-chart-tooltip'
				);
				if (!root) {
					return;
				}
				for (const property of TOOLTIP_PRESENTATION_PROPERTIES) {
					root.style.removeProperty(property);
				}

				// Recompute placement once using the stylesheet's final dimensions.
				nativeTooltip.paint(paintContext);
			},
		};
	},
};
