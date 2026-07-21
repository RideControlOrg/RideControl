import { type UIEvent, useCallback, useEffect, useRef } from 'react';
import { loadScrollPosition, saveScrollPosition } from '../lib/scroll-position';

export function usePersistentScrollPosition<Element extends HTMLElement = HTMLDivElement>(
	storageKey: string,
	enabled: boolean,
	restoreTrigger?: unknown
) {
	const scrollContainer = useRef<Element>(null);
	const restorePosition = useCallback(() => {
		if (scrollContainer.current && enabled) {
			scrollContainer.current.scrollTop = loadScrollPosition(storageKey);
		}
	}, [enabled, storageKey]);
	const scrollContainerRef = useCallback(
		(element: Element | null) => {
			scrollContainer.current = element;
			restorePosition();
		},
		[restorePosition]
	);
	useEffect(() => {
		if (restoreTrigger !== undefined) {
			restorePosition();
		}
	}, [restorePosition, restoreTrigger]);
	const savePosition = useCallback(
		(event: UIEvent<Element>) => {
			saveScrollPosition(storageKey, event.currentTarget.scrollTop);
		},
		[storageKey]
	);
	const scrollToTop = useCallback(() => {
		if (scrollContainer.current) {
			scrollContainer.current.scrollTop = 0;
		}
		saveScrollPosition(storageKey, 0);
	}, [storageKey]);

	return { onScroll: savePosition, ref: scrollContainerRef, scrollToTop };
}
