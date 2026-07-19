import { useEffect } from 'react';

export function useCloseOnEscape(enabled: boolean, onClose: () => void): void {
	useEffect(() => {
		if (!enabled) {
			return;
		}
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				onClose();
			}
		};
		window.addEventListener('keydown', closeOnEscape);
		return () => window.removeEventListener('keydown', closeOnEscape);
	}, [enabled, onClose]);
}

export function useBodyScrollLock(locked: boolean): void {
	useEffect(() => {
		if (!locked) {
			return;
		}
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previousOverflow;
		};
	}, [locked]);
}
