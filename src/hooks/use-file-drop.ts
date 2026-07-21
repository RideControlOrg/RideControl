import { type RefObject, useEffect, useRef, useState } from 'react';

const FILE_DRAG_TYPE = 'Files';

function containsFiles(dataTransfer: DataTransfer): boolean {
	return Array.from(dataTransfer.types).includes(FILE_DRAG_TYPE);
}

export function useFileDrop(
	enabled: boolean,
	onDropFile: (file: File) => Promise<void>
): { active: boolean; targetRef: RefObject<HTMLDivElement | null> } {
	const targetRef = useRef<HTMLDivElement>(null);
	const dragDepth = useRef(0);
	const [active, setActive] = useState(false);

	useEffect(() => {
		const target = targetRef.current;
		if (!(enabled && target)) {
			return;
		}
		const finish = () => {
			dragDepth.current = 0;
			setActive(false);
		};
		const enter = (event: DragEvent) => {
			if (!(event.dataTransfer && containsFiles(event.dataTransfer))) {
				return;
			}
			event.preventDefault();
			dragDepth.current += 1;
			setActive(true);
		};
		const leave = (event: DragEvent) => {
			event.preventDefault();
			dragDepth.current = Math.max(0, dragDepth.current - 1);
			if (dragDepth.current === 0) {
				setActive(false);
			}
		};
		const over = (event: DragEvent) => {
			if (!(event.dataTransfer && containsFiles(event.dataTransfer))) {
				return;
			}
			event.preventDefault();
			event.dataTransfer.dropEffect = 'copy';
		};
		const drop = (event: DragEvent) => {
			if (!(event.dataTransfer && containsFiles(event.dataTransfer))) {
				return;
			}
			event.preventDefault();
			const [file] = Array.from(event.dataTransfer.files);
			finish();
			if (file) {
				onDropFile(file).catch(() => undefined);
			}
		};

		target.addEventListener('dragenter', enter);
		target.addEventListener('dragleave', leave);
		target.addEventListener('dragover', over);
		target.addEventListener('drop', drop);
		return () => {
			finish();
			target.removeEventListener('dragenter', enter);
			target.removeEventListener('dragleave', leave);
			target.removeEventListener('dragover', over);
			target.removeEventListener('drop', drop);
		};
	}, [enabled, onDropFile]);

	return { active, targetRef };
}
