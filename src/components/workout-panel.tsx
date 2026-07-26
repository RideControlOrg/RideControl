import {
	type CollisionDetection,
	closestCenter,
	DndContext,
	type DragEndEvent,
	type DraggableAttributes,
	type DraggableSyntheticListeners,
	PointerSensor,
	pointerWithin,
	useSensor,
	useSensors,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
	type CSSProperties,
	Fragment,
	type KeyboardEvent,
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { useFileDrop } from '../hooks/use-file-drop';
import { usePersistentScrollPosition } from '../hooks/use-persistent-scroll-position';
import { APP_OVERLAY } from '../lib/app-overlay';
import { errorMessage } from '../lib/errors';
import { descriptionWithoutDistance, formatDistance, formatElevation } from '../lib/units';
import {
	OPENSTREETMAP_ATTRIBUTION_URL,
	WORKOUT_DESCRIPTION_ATTRIBUTION,
} from '../lib/workout-description';
import { canMoveWorkoutCourse, downloadWorkoutFile } from '../lib/workout-file';
import { workoutMaximumGrade } from '../lib/workout-metrics';
import { WORKOUT_VIEW, workoutRouteLabel } from '../lib/workout-schema';
import { workoutDifficultyLabel, workoutMatchesSearch } from '../lib/workouts';
import type { SpeedUnit, WorkoutCourse } from '../types';
import type { GpxBrowserSelection } from './gpx-browser-dialog';
import { Icon } from './icon';
import { RenameWorkoutDialog } from './rename-workout-dialog';
import { SideTray } from './side-tray';
import { WorkoutRouteVisualization } from './workout-route-visualization';

const REORDER_KEY = {
	EARLIER: 'ArrowUp',
	LATER: 'ArrowDown',
} as const;
const WORKOUT_SCROLL_POSITION_STORAGE_KEY = 'ride-control-workout-scroll-position';
const WorkoutMapDialog = lazy(async () => {
	const module = await import('./workout-map-dialog');
	return { default: module.WorkoutMapDialog };
});
const GpxBrowserDialog = lazy(async () => {
	const module = await import('./gpx-browser-dialog');
	return { default: module.GpxBrowserDialog };
});

const workoutCollisionDetection: CollisionDetection = (args) => {
	const pointerCollisions = pointerWithin(args);
	return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args);
};

function WorkoutCourseCard({
	course,
	custom,
	disabled,
	dragHandleAttributes,
	dragHandleListeners,
	dragged,
	focused,
	onFocus,
	onMove,
	onRemove,
	onRename,
	onSelect,
	onViewMap,
	setDragHandleRef,
	setNodeRef,
	selected,
	speedUnit,
	style,
}: {
	course: WorkoutCourse;
	custom: boolean;
	disabled: boolean;
	dragHandleAttributes: DraggableAttributes;
	dragHandleListeners: DraggableSyntheticListeners;
	dragged: boolean;
	focused: boolean;
	onFocus: () => void;
	onMove: (direction: -1 | 1) => void;
	onRemove: () => void;
	onRename: () => void;
	onSelect: () => void;
	onViewMap: () => void;
	setDragHandleRef: (node: HTMLElement | null) => void;
	setNodeRef: (node: HTMLElement | null) => void;
	selected: boolean;
	speedUnit: SpeedUnit;
	style?: CSSProperties;
}) {
	const usesOpenStreetMapAttribution =
		course.descriptionAttribution === WORKOUT_DESCRIPTION_ATTRIBUTION.OPENSTREETMAP;
	const moveWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.key === REORDER_KEY.EARLIER) {
			event.preventDefault();
			onMove(-1);
		} else if (event.key === REORDER_KEY.LATER) {
			event.preventDefault();
			onMove(1);
		}
	};
	let emphasis = 'border-transparent';
	if (selected) {
		emphasis = 'border-mint/30';
	} else if (focused) {
		emphasis = 'border-cyan-400/30';
	}

	return (
		<article
			className={`minimal-workout-card relative overflow-hidden border bg-[#12171d] px-4 py-3 transition-colors ${emphasis} ${dragged ? 'cursor-grabbing opacity-95 shadow-[0_20px_50px_rgba(0,0,0,.5)]' : ''}`}
			data-focused={focused ? 'true' : undefined}
			data-selected={selected ? 'true' : undefined}
			id={`workout-${encodeURIComponent(course.id)}`}
			onClickCapture={onFocus}
			ref={setNodeRef}
			style={style}
		>
			<button
				{...dragHandleAttributes}
				{...dragHandleListeners}
				aria-label={`Drag ${course.name} to reorder`}
				className="absolute top-3 right-3 z-10 grid h-8 w-8 cursor-grab touch-none place-items-center border border-line bg-[#12171d] text-slate-400 transition hover:border-cyan-400/70 hover:text-cyan-300 active:cursor-grabbing"
				onKeyDown={moveWithKeyboard}
				ref={setDragHandleRef}
				title="Drag to reorder. Use the up and down arrow keys while focused."
				type="button"
			>
				<Icon className="h-4 w-4" name="move-vertical" title="Move workout up or down" />
			</button>
			<header className="pr-11">
				<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
					<h3 className="min-w-0 font-bold text-base">
						{custom ? (
							<button
								aria-label={`Rename ${course.name}`}
								className="text-left underline decoration-cyan-400/40 underline-offset-4 transition hover:text-cyan-300 hover:decoration-cyan-300"
								onClick={onRename}
								title="Rename imported workout"
								type="button"
							>
								{course.name}
							</button>
						) : (
							course.name
						)}
					</h3>
					<div className="flex shrink-0 items-center gap-1.5">
						{custom ? (
							<span className="border border-cyan-400/30 px-1.5 py-0.5 font-bold text-[9px] text-cyan-300 uppercase tracking-wide">
								Imported
							</span>
						) : null}
						<span className="border border-slate-700 px-1.5 py-0.5 font-bold text-[9px] text-slate-400 uppercase tracking-wide">
							{workoutDifficultyLabel(course.difficulty)}
						</span>
					</div>
				</div>
				<p className="mt-1 max-w-2xl text-slate-400 text-xs leading-relaxed">
					{usesOpenStreetMapAttribution ? (
						<button
							className="text-left underline decoration-cyan-400/40 underline-offset-2 transition hover:text-cyan-300 hover:decoration-cyan-300"
							onClick={onViewMap}
							title="View the route map"
							type="button"
						>
							{descriptionWithoutDistance(course.description)}
						</button>
					) : (
						descriptionWithoutDistance(course.description)
					)}
				</p>
			</header>
			<div className="minimal-workout-visuals mt-2 grid grid-cols-2">
				<div className="pr-4">
					<WorkoutRouteVisualization
						className="h-20"
						course={course}
						view={WORKOUT_VIEW.MAP}
					/>
				</div>
				<div className="minimal-workout-visual-pane pl-4">
					<WorkoutRouteVisualization
						className="h-20"
						course={course}
						view={WORKOUT_VIEW.PROFILE}
					/>
				</div>
			</div>
			<footer className="mt-2 flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
				<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-500 text-xs tabular-nums">
					<span>
						{formatDistance(course.distance, speedUnit, 1)}{' '}
						{workoutRouteLabel(course.routeType)}
					</span>
					<span>{formatElevation(course.elevationGain, speedUnit)} climbing</span>
					<span>Up to +{workoutMaximumGrade(course).toFixed(1)}%</span>
				</div>
				<div className="ml-auto flex shrink-0 items-center gap-3 font-semibold text-xs">
					{usesOpenStreetMapAttribution ? (
						<a
							className="font-normal text-[10px] text-slate-500 underline decoration-slate-700 underline-offset-2 hover:text-slate-300"
							href={OPENSTREETMAP_ATTRIBUTION_URL}
							rel="noreferrer"
							target="_blank"
						>
							© OpenStreetMap contributors
						</a>
					) : null}
					<button
						className="text-cyan-400 hover:text-cyan-200"
						onClick={() => downloadWorkoutFile(course)}
						type="button"
					>
						Download GPX
					</button>
					{custom ? (
						<button
							className="text-rose-400 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
							disabled={disabled}
							onClick={onRemove}
							type="button"
						>
							Remove
						</button>
					) : null}
					<button
						className={`h-8 border px-3 font-bold transition ${selected ? 'border-mint/40 bg-mint/10 text-mint hover:bg-mint/15' : 'border-line text-slate-200 hover:border-mint/60 hover:text-mint'} disabled:cursor-not-allowed disabled:opacity-40`}
						disabled={disabled}
						onClick={onSelect}
						type="button"
					>
						{selected ? 'Deselect workout' : 'Choose workout'}
					</button>
				</div>
			</footer>
		</article>
	);
}

function SortableWorkoutCourseCard(
	props: Omit<
		Parameters<typeof WorkoutCourseCard>[0],
		| 'dragHandleAttributes'
		| 'dragHandleListeners'
		| 'dragged'
		| 'setDragHandleRef'
		| 'setNodeRef'
		| 'style'
	>
) {
	const {
		attributes,
		isDragging,
		listeners,
		setActivatorNodeRef,
		setNodeRef,
		transform,
		transition,
	} = useSortable({ id: props.course.id });
	const style: CSSProperties = {
		position: isDragging ? 'relative' : undefined,
		transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined,
		transition,
		zIndex: isDragging ? 20 : undefined,
	};

	return (
		<WorkoutCourseCard
			{...props}
			dragged={isDragging}
			dragHandleAttributes={attributes}
			dragHandleListeners={listeners}
			setDragHandleRef={setActivatorNodeRef}
			setNodeRef={setNodeRef}
			style={style}
		/>
	);
}

function WorkoutDropBoundary({ index }: { index: number }) {
	return <div aria-hidden="true" className="h-4" data-workout-drop-index={index} />;
}

function WorkoutLibraryStatus({ error, status }: { error?: string; status: string }) {
	const message = error || status;
	if (!message) {
		return null;
	}
	return (
		<div
			aria-live={error ? 'assertive' : 'polite'}
			className={`flex min-h-9 flex-1 items-center rounded-lg border border-line bg-[#10151a] px-3 text-xs ${error ? 'text-rose-300' : 'text-cyan-300'}`}
			data-testid="workout-status"
			role={error ? 'alert' : 'status'}
		>
			{message}
		</div>
	);
}

function WorkoutPanelFooter({
	activeCourse,
	error,
	onClear,
	selectionLocked,
	status,
}: {
	activeCourse?: WorkoutCourse;
	error?: string;
	onClear: () => void;
	selectionLocked: boolean;
	status: string;
}) {
	const canClear = Boolean(activeCourse) && !selectionLocked;
	if (!(error || status || canClear)) {
		return null;
	}
	return (
		<footer className="flex items-center justify-end gap-3 border-line border-t p-4 sm:px-6">
			<WorkoutLibraryStatus error={error} status={status} />
			{canClear ? (
				<button
					className="min-h-9 shrink-0 rounded-lg border border-line px-3 py-2 font-semibold text-slate-400 text-xs hover:border-slate-500 hover:text-white"
					onClick={onClear}
					type="button"
				>
					Clear selected workout
				</button>
			) : null}
		</footer>
	);
}

export function WorkoutPanel({
	activeCourse,
	courses,
	customCourseIds,
	focusedCourseId,
	gpxBrowserOpen = false,
	gpxCollectionId,
	gpxProviderId,
	gpxRouteId,
	onClose,
	onCloseGpx,
	onFocusCourse,
	onImportCourse,
	onImportFile,
	onRemoveCourse,
	onRenameCourse,
	onReorderCourse,
	onOpenGpx,
	onSelectGpxRoute,
	onSelect,
	open,
	selectionLocked,
	speedUnit,
}: {
	activeCourse?: WorkoutCourse;
	courses: WorkoutCourse[];
	customCourseIds: ReadonlySet<string>;
	focusedCourseId?: string;
	gpxBrowserOpen?: boolean;
	gpxCollectionId?: string;
	gpxProviderId?: string;
	gpxRouteId?: string;
	onClose: () => void;
	onCloseGpx?: () => void;
	onFocusCourse?: (courseId: string | undefined) => void;
	onImportCourse: (course: WorkoutCourse) => Promise<WorkoutCourse>;
	onImportFile: (file: File) => Promise<WorkoutCourse>;
	onRemoveCourse: (courseId: string) => void;
	onRenameCourse: (courseId: string, name: string) => WorkoutCourse;
	onReorderCourse: (movedCourseId: string, destinationIndex: number) => void;
	onOpenGpx?: () => void;
	onSelectGpxRoute?: (selection: GpxBrowserSelection) => void;
	onSelect: (course?: WorkoutCourse) => void;
	open: boolean;
	selectionLocked: boolean;
	speedUnit: SpeedUnit;
}) {
	const importInput = useRef<HTMLInputElement>(null);
	const [importing, setImporting] = useState(false);
	const [libraryStatus, setLibraryStatus] = useState('');
	const [importError, setImportError] = useState('');
	const [renamingCourse, setRenamingCourse] = useState<WorkoutCourse>();
	const [mappedCourse, setMappedCourse] = useState<WorkoutCourse>();
	const [searchQuery, setSearchQuery] = useState('');
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 6 },
		})
	);
	const filteredCourses = useMemo(
		() => courses.filter((course) => workoutMatchesSearch(course, searchQuery, speedUnit)),
		[courses, searchQuery, speedUnit]
	);
	const sortableCourseIds = useMemo(
		() => filteredCourses.map((course) => course.id),
		[filteredCourses]
	);
	const workoutListScroll = usePersistentScrollPosition(
		WORKOUT_SCROLL_POSITION_STORAGE_KEY,
		open
	);
	useEffect(() => {
		if (!(open && focusedCourseId)) {
			return;
		}
		const focusedCourse = courses.find((course) => course.id === focusedCourseId);
		if (!focusedCourse) {
			onFocusCourse?.(undefined);
			return;
		}
		const frame = window.requestAnimationFrame(() => {
			document
				.getElementById(`workout-${encodeURIComponent(focusedCourseId)}`)
				?.scrollIntoView({ block: 'center' });
		});
		return () => window.cancelAnimationFrame(frame);
	}, [courses, focusedCourseId, onFocusCourse, open]);

	const importWorkout = useCallback(
		async (file: File) => {
			setImporting(true);
			setLibraryStatus('');
			setImportError('');
			try {
				const course = await onImportFile(file);
				setSearchQuery('');
				workoutListScroll.scrollToTop();
				setLibraryStatus(`${course.name} imported and saved on this device.`);
			} catch (error) {
				setImportError(errorMessage(error));
			} finally {
				setImporting(false);
			}
		},
		[onImportFile, workoutListScroll.scrollToTop]
	);
	const { active: fileDropActive, targetRef: fileDropTarget } = useFileDrop(
		open && !importing,
		importWorkout
	);

	const closePanel = () => {
		setRenamingCourse(undefined);
		setMappedCourse(undefined);
		setSearchQuery('');
		onClose();
	};
	const reorderCourse = (movedCourseId: string, destinationIndex: number) => {
		if (!movedCourseId) {
			return;
		}
		onReorderCourse(movedCourseId, destinationIndex);
		const movedCourse = courses.find((course) => course.id === movedCourseId);
		if (movedCourse) {
			setLibraryStatus(`${movedCourse.name} moved and its position was saved.`);
		}
	};
	const destinationForBoundary = (boundaryIndex: number): number => {
		const nextCourse = filteredCourses[boundaryIndex];
		if (nextCourse) {
			return courses.findIndex((course) => course.id === nextCourse.id);
		}
		const previousCourse = filteredCourses[boundaryIndex - 1];
		return previousCourse
			? courses.findIndex((course) => course.id === previousCourse.id) + 1
			: courses.length;
	};
	const targetBoundaryForDrag = (event: DragEndEvent): number | undefined => {
		const activeCourseId = String(event.active.id);
		const activeCourseIndex = filteredCourses.findIndex(
			(course) => course.id === activeCourseId
		);
		const { over } = event;
		if (activeCourseIndex < 0 || !over) {
			return;
		}
		const overId = String(over.id);
		const overCourseIndex = filteredCourses.findIndex((course) => course.id === overId);
		if (overCourseIndex < 0 || overCourseIndex === activeCourseIndex) {
			return;
		}
		const boundaryIndex =
			activeCourseIndex < overCourseIndex ? overCourseIndex + 1 : overCourseIndex;
		return canMoveWorkoutCourse(courses, activeCourseId, destinationForBoundary(boundaryIndex))
			? boundaryIndex
			: undefined;
	};
	const moveDraggedCourse = (event: DragEndEvent) => {
		const activeCourseId = String(event.active.id);
		const movedCourse = filteredCourses.find((course) => course.id === activeCourseId);
		const boundaryIndex = targetBoundaryForDrag(event);
		if (movedCourse && boundaryIndex !== undefined) {
			reorderCourse(movedCourse.id, destinationForBoundary(boundaryIndex));
		}
	};

	return (
		<>
			<SideTray
				closeLabel="Close terrain workouts"
				closeOnEscape={!(gpxBrowserOpen || mappedCourse || renamingCourse)}
				labelledBy="workout-panel-title"
				onClose={closePanel}
				open={open}
				panelClassName="max-w-xl"
				tray={APP_OVERLAY.WORKOUTS}
			>
				<div
					className="relative flex h-full flex-col"
					data-gpx-drop-target="true"
					ref={fileDropTarget}
				>
					{fileDropActive ? (
						<div
							className="pointer-events-none absolute inset-3 z-30 grid place-items-center rounded-2xl border-2 border-cyan-300 border-dashed bg-[#0b1118]/95 shadow-[0_0_40px_rgba(34,211,238,.16)]"
							role="status"
						>
							<div className="text-center">
								<p className="font-bold text-cyan-200 text-lg">
									Drop GPX to import
								</p>
								<p className="mt-1 text-slate-400 text-xs">
									The workout will be saved on this device.
								</p>
							</div>
						</div>
					) : null}
					<header className="relative flex flex-col gap-3 px-4 py-3 pr-12 sm:flex-row sm:items-start sm:gap-4 sm:px-6 sm:py-4 sm:pr-16">
						<div className="min-w-0 flex-1">
							<h2 className="font-bold text-xl" id="workout-panel-title">
								Terrain workouts
							</h2>
							<p className="mt-1 max-w-md text-slate-400 text-sm leading-snug">
								Choose a public route or import GPX. Resistance follows its climbs
								and descents.
							</p>
						</div>
						<div className="flex shrink-0 items-center gap-1.5">
							<input
								accept=".gpx,application/gpx+xml,application/xml,text/xml"
								className="hidden"
								onChange={(event) => {
									const file = event.currentTarget.files?.[0];
									event.currentTarget.value = '';
									if (file) {
										importWorkout(file);
									}
								}}
								ref={importInput}
								type="file"
							/>
							<button
								className="h-9 rounded-lg border border-line px-3 font-semibold text-slate-300 text-xs hover:border-cyan-400/60 hover:text-white"
								onClick={onOpenGpx}
								type="button"
							>
								Browse routes
							</button>
							<button
								className="h-9 rounded-lg border border-line px-3 font-semibold text-slate-300 text-xs hover:border-cyan-400/60 hover:text-white disabled:cursor-wait disabled:opacity-60"
								disabled={importing}
								onClick={() => importInput.current?.click()}
								type="button"
							>
								{importing ? 'Importing…' : 'Import GPX'}
							</button>
						</div>
						<button
							aria-label="Close terrain workouts"
							className="absolute top-3 right-3 grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-800 hover:text-white sm:top-4 sm:right-4"
							onClick={closePanel}
							type="button"
						>
							×
						</button>
					</header>
					<div className="px-5 pt-3 text-xs leading-relaxed sm:px-6">
						<div
							className="flex items-center gap-3 border-line border-b transition-colors focus-within:border-cyan-400/70"
							data-testid="workout-search-bar"
						>
							<label className="sr-only" htmlFor="workout-search">
								Search workouts by name, difficulty, or distance
							</label>
							<input
								className="h-10 min-w-0 flex-1 border-0 bg-transparent px-0 text-slate-100 text-sm outline-none placeholder:text-slate-600"
								id="workout-search"
								onChange={(event) => setSearchQuery(event.currentTarget.value)}
								placeholder="Search by name, difficulty, or distance"
								type="search"
								value={searchQuery}
							/>
							{searchQuery ? (
								<button
									className="h-9 shrink-0 px-1 font-semibold text-slate-400 hover:text-white"
									onClick={() => setSearchQuery('')}
									type="button"
								>
									Clear
								</button>
							) : null}
						</div>
					</div>
					<DndContext
						collisionDetection={workoutCollisionDetection}
						modifiers={[restrictToVerticalAxis, restrictToParentElement]}
						onDragEnd={moveDraggedCourse}
						sensors={sensors}
					>
						<div
							className="flex-1 overflow-y-auto px-5 py-3 sm:px-6"
							data-testid="workout-list"
							onScroll={workoutListScroll.onScroll}
							ref={workoutListScroll.ref}
						>
							<SortableContext
								items={sortableCourseIds}
								strategy={verticalListSortingStrategy}
							>
								{filteredCourses.map((course, index) => (
									<Fragment key={course.id}>
										<WorkoutDropBoundary index={index} />
										<SortableWorkoutCourseCard
											course={course}
											custom={customCourseIds.has(course.id)}
											disabled={selectionLocked}
											focused={focusedCourseId === course.id}
											onFocus={() => onFocusCourse?.(course.id)}
											onMove={(direction) => {
												const target = filteredCourses[index + direction];
												if (target) {
													const targetIndex = courses.findIndex(
														(candidate) => candidate.id === target.id
													);
													reorderCourse(
														course.id,
														direction < 0
															? targetIndex
															: targetIndex + 1
													);
												}
											}}
											onRemove={() => onRemoveCourse(course.id)}
											onRename={() => setRenamingCourse(course)}
											onSelect={() =>
												onSelect(
													activeCourse?.id === course.id
														? undefined
														: course
												)
											}
											onViewMap={() => setMappedCourse(course)}
											selected={activeCourse?.id === course.id}
											speedUnit={speedUnit}
										/>
									</Fragment>
								))}
								{filteredCourses.length > 0 ? (
									<WorkoutDropBoundary index={filteredCourses.length} />
								) : null}
							</SortableContext>
							{filteredCourses.length === 0 ? (
								<p
									className="py-10 text-center text-slate-500 text-sm"
									role="status"
								>
									No workouts match “{searchQuery.trim()}”.
								</p>
							) : null}
						</div>
					</DndContext>
					<WorkoutPanelFooter
						activeCourse={activeCourse}
						error={importError}
						onClear={() => onSelect(undefined)}
						selectionLocked={selectionLocked}
						status={libraryStatus}
					/>
				</div>
			</SideTray>
			{gpxBrowserOpen ? (
				<Suspense
					fallback={
						<div
							className="fixed inset-4 z-50 grid place-items-center rounded-2xl border border-slate-600 bg-panel text-slate-400 text-sm shadow-2xl shadow-black/70 xl:top-6 xl:right-152 xl:bottom-6 xl:left-6"
							role="status"
						>
							Loading route browser…
						</div>
					}
				>
					<GpxBrowserDialog
						customCourseIds={customCourseIds}
						onClose={() => onCloseGpx?.()}
						onImportCourse={async (course) => {
							const imported = await onImportCourse(course);
							setSearchQuery('');
							workoutListScroll.scrollToTop();
							setLibraryStatus(`${imported.name} imported and saved on this device.`);
							return imported;
						}}
						onSelectRoute={onSelectGpxRoute}
						requestedCollectionId={gpxCollectionId}
						requestedProviderId={gpxProviderId}
						requestedRouteId={gpxRouteId}
						speedUnit={speedUnit}
					/>
				</Suspense>
			) : null}
			{mappedCourse ? (
				<Suspense
					fallback={
						<div
							className="fixed inset-4 z-50 grid place-items-center rounded-2xl border border-slate-600 bg-panel text-slate-400 text-sm shadow-2xl shadow-black/70 xl:top-6 xl:right-152 xl:bottom-6 xl:left-6"
							role="status"
						>
							Loading map…
						</div>
					}
				>
					<WorkoutMapDialog
						course={mappedCourse}
						onClose={() => setMappedCourse(undefined)}
						speedUnit={speedUnit}
					/>
				</Suspense>
			) : null}
			{renamingCourse ? (
				<RenameWorkoutDialog
					course={renamingCourse}
					key={renamingCourse.id}
					onClose={() => setRenamingCourse(undefined)}
					onRename={(courseId, name) => {
						const renamed = onRenameCourse(courseId, name);
						setLibraryStatus(`${renamed.name} renamed and saved on this device.`);
					}}
				/>
			) : null}
		</>
	);
}
