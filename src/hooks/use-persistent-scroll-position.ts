import { type UIEvent, useCallback } from 'react';
import { loadScrollPosition, saveScrollPosition } from '../lib/scroll-position';

export function usePersistentScrollPosition(storageKey: string, enabled: boolean) {
	const scrollContainerRef = useCallback(
		(element: HTMLDivElement | null) => {
			if (element && enabled) {
				element.scrollTop = loadScrollPosition(storageKey);
			}
		},
		[enabled, storageKey]
	);
	const savePosition = useCallback(
		(event: UIEvent<HTMLDivElement>) => {
			saveScrollPosition(storageKey, event.currentTarget.scrollTop);
		},
		[storageKey]
	);

	return { onScroll: savePosition, ref: scrollContainerRef };
}
