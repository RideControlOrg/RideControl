import { type DragEvent, type KeyboardEvent, useCallback, useMemo, useRef, useState } from 'react';
import { useFileDrop } from '../hooks/use-file-drop';
import { errorMessage } from '../lib/errors';
import { formatDistance, formatElevation } from '../lib/units';
import {
	OPENSTREETMAP_ATTRIBUTION_URL,
	WORKOUT_DESCRIPTION_ATTRIBUTION,
} from '../lib/workout-description';
import { downloadWorkoutFile } from '../lib/workout-file';
import { WORKOUT_VIEW, workoutRouteLabel } from '../lib/workout-schema';
import { workoutDifficultyLabel, workoutMatchesSearch, workoutMaximumGrade } from '../lib/workouts';
import type { SpeedUnit, WorkoutCourse } from '../types';
import { RenameWorkoutDialog } from './rename-workout-dialog';
import { SideTray } from './side-tray';
import { WorkoutRouteVisualization } from './workout-route-visualization';

const REORDER_KEY = {
	EARLIER: 'ArrowUp',
	LATER: 'ArrowDown',
} as const;
const REORDER_GRIP_DOTS = ['one', 'two', 'three', 'four', 'five', 'six'] as const;

function WorkoutCourseCard({
	course,
	custom,
	disabled,
	dragged,
	dropEnabled,
	dropTarget,
	onDragEnd,
	onDragOver,
	onDragStart,
	onDrop,
	onMove,
	onRemove,
	onRename,
	onSelect,
	selected,
	speedUnit,
}: {
	course: WorkoutCourse;
	custom: boolean;
	disabled: boolean;
	dragged: boolean;
	dropEnabled: boolean;
	dropTarget: boolean;
	onDragEnd: () => void;
	onDragOver: (event: DragEvent<HTMLButtonElement>) => void;
	onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
	onDrop: (event: DragEvent<HTMLButtonElement>) => void;
	onMove: (direction: -1 | 1) => void;
	onRemove: () => void;
	onRename: () => void;
	onSelect: () => void;
	selected: boolean;
	speedUnit: SpeedUnit;
}) {
	const moveWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.key === REORDER_KEY.EARLIER) {
			event.preventDefault();
			onMove(-1);
		} else if (event.key === REORDER_KEY.LATER) {
			event.preventDefault();
			onMove(1);
		}
	};

	return (
		<article
			className={`relative overflow-hidden rounded-2xl border bg-[#12171d] transition ${selected ? 'border-mint/50 shadow-[0_0_20px_rgba(173,245,189,.08)]' : 'border-line'} ${dragged ? 'opacity-40' : ''} ${dropTarget ? 'ring-2 ring-cyan-400/70' : ''}`}
		>
			{dropEnabled ? (
				<button
					aria-label={`Move dragged workout to ${course.name}`}
					className={`absolute inset-0 z-20 cursor-grabbing rounded-2xl border-2 border-dashed ${dropTarget ? 'border-cyan-300 bg-cyan-400/10' : 'border-transparent bg-transparent'}`}
					onDragOver={onDragOver}
					onDrop={onDrop}
					title={`Move workout to ${course.name}`}
					type="button"
				/>
			) : null}
			<div className="grid grid-cols-2 gap-px bg-line">
				<div className="bg-[#10151a] px-4 py-2">
					<WorkoutRouteVisualization
						className="h-24"
						course={course}
						view={WORKOUT_VIEW.MAP}
					/>
				</div>
				<div className="bg-[#10151a] px-4 py-2">
					<WorkoutRouteVisualization
						className="h-24"
						course={course}
						view={WORKOUT_VIEW.PROFILE}
					/>
				</div>
			</div>
			<div className="p-4">
				<div className="flex items-start justify-between gap-4">
					<div className="min-w-0">
						<h3 className="font-bold text-base">
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
						<p className="mt-1 text-slate-400 text-xs leading-relaxed">
							{course.description}
						</p>
						{course.descriptionAttribution ===
						WORKOUT_DESCRIPTION_ATTRIBUTION.OPENSTREETMAP ? (
							<a
								className="mt-1 inline-block text-[10px] text-slate-500 underline decoration-slate-700 underline-offset-2 hover:text-slate-300"
								href={OPENSTREETMAP_ATTRIBUTION_URL}
								rel="noreferrer"
								target="_blank"
							>
								City lookup © OpenStreetMap contributors
							</a>
						) : null}
					</div>
					<div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
						<button
							aria-label={`Drag ${course.name} to reorder`}
							className="grid cursor-grab grid-cols-2 gap-0.5 rounded-lg border border-slate-700 p-2 text-slate-500 hover:border-cyan-400/50 hover:text-cyan-300 active:cursor-grabbing"
							draggable
							onDragEnd={onDragEnd}
							onDragStart={onDragStart}
							onKeyDown={moveWithKeyboard}
							title="Drag to reorder. Use the up and down arrow keys while focused."
							type="button"
						>
							{REORDER_GRIP_DOTS.map((dot) => (
								<span
									aria-hidden="true"
									className="h-1 w-1 rounded-full bg-current"
									key={dot}
								/>
							))}
						</button>
						{custom ? (
							<span className="rounded-full border border-cyan-400/30 bg-cyan-400/5 px-2 py-1 font-bold text-[9px] text-cyan-300 uppercase tracking-wide">
								Imported
							</span>
						) : null}
						<span className="rounded-full border border-slate-700 px-2 py-1 font-bold text-[9px] text-slate-400 uppercase tracking-wide">
							{workoutDifficultyLabel(course.difficulty)}
						</span>
					</div>
				</div>
				<div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-slate-500 text-xs tabular-nums">
					<span>
						{formatDistance(course.distance, speedUnit, 1)}{' '}
						{workoutRouteLabel(course.routeType)}
					</span>
					<span>{formatElevation(course.elevationGain, speedUnit)} climbing</span>
					<span>Up to +{workoutMaximumGrade(course).toFixed(1)}%</span>
					<div className="ml-auto flex items-center gap-3 font-semibold">
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
					</div>
				</div>
				<button
					className={`mt-4 h-10 w-full rounded-lg border font-bold text-xs transition ${selected ? 'border-mint/30 bg-mint/10 text-mint' : 'border-slate-700 bg-slate-800/70 text-slate-200 hover:border-slate-500 hover:bg-slate-700/70 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-40`}
					disabled={disabled || selected}
					onClick={onSelect}
					type="button"
				>
					{selected ? 'Selected' : 'Choose workout'}
				</button>
			</div>
		</article>
	);
}

export function WorkoutPanel({
	activeCourse,
	courses,
	customCourseIds,
	onClose,
	onImportFile,
	onRemoveCourse,
	onRenameCourse,
	onReorderCourse,
	onSelect,
	open,
	selectionLocked,
	speedUnit,
}: {
	activeCourse?: WorkoutCourse;
	courses: WorkoutCourse[];
	customCourseIds: ReadonlySet<string>;
	onClose: () => void;
	onImportFile: (file: File) => Promise<WorkoutCourse>;
	onRemoveCourse: (courseId: string) => void;
	onRenameCourse: (courseId: string, name: string) => WorkoutCourse;
	onReorderCourse: (movedCourseId: string, targetCourseId: string) => void;
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
	const [draggedCourseId, setDraggedCourseId] = useState('');
	const [dropTargetCourseId, setDropTargetCourseId] = useState('');
	const [searchQuery, setSearchQuery] = useState('');
	const filteredCourses = useMemo(
		() => courses.filter((course) => workoutMatchesSearch(course, searchQuery)),
		[courses, searchQuery]
	);

	const importWorkout = useCallback(
		async (file: File) => {
			setImporting(true);
			setLibraryStatus('');
			setImportError('');
			try {
				const course = await onImportFile(file);
				setSearchQuery('');
				setLibraryStatus(`${course.name} imported and saved on this device.`);
			} catch (error) {
				setImportError(errorMessage(error));
			} finally {
				setImporting(false);
			}
		},
		[onImportFile]
	);
	const { active: fileDropActive, targetRef: fileDropTarget } = useFileDrop(
		open && !importing,
		importWorkout
	);

	const closePanel = () => {
		setRenamingCourse(undefined);
		setDraggedCourseId('');
		setDropTargetCourseId('');
		setSearchQuery('');
		onClose();
	};
	const finishDragging = () => {
		setDraggedCourseId('');
		setDropTargetCourseId('');
	};
	const reorderCourse = (movedCourseId: string, targetCourseId: string) => {
		if (movedCourseId === targetCourseId) {
			return;
		}
		onReorderCourse(movedCourseId, targetCourseId);
		const movedCourse = courses.find((course) => course.id === movedCourseId);
		if (movedCourse) {
			setLibraryStatus(`${movedCourse.name} moved and its position was saved.`);
		}
	};

	return (
		<>
			<SideTray
				closeLabel="Close terrain workouts"
				closeOnEscape={!renamingCourse}
				labelledBy="workout-panel-title"
				onClose={closePanel}
				open={open}
				panelClassName="max-w-xl"
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
					<header className="flex items-start justify-between gap-4 border-line border-b px-5 py-5 sm:px-6">
						<div>
							<h2 className="font-bold text-xl" id="workout-panel-title">
								Terrain workouts
							</h2>
							<p className="mt-1 max-w-md text-slate-400 text-sm leading-relaxed">
								Resistance follows the climbs and descents while your position moves
								along the route.
							</p>
							<p className="mt-2 max-w-md text-slate-500 text-xs leading-relaxed">
								<a
									className="font-semibold text-cyan-400 hover:text-cyan-200"
									href="https://bikegpx.com/bike_routes/"
									rel="noreferrer"
									target="_blank"
								>
									BikeGPX has thousands of GPX files
								</a>{' '}
								you can upload here.
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
								className="h-9 rounded-lg border border-line px-3 font-semibold text-slate-300 text-xs hover:border-cyan-400/60 hover:text-white disabled:cursor-wait disabled:opacity-60"
								disabled={importing}
								onClick={() => importInput.current?.click()}
								type="button"
							>
								{importing ? 'Importing…' : 'Import GPX'}
							</button>
							<button
								aria-label="Close terrain workouts"
								className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-800 hover:text-white"
								onClick={closePanel}
								type="button"
							>
								×
							</button>
						</div>
					</header>
					<div className="border-line border-b bg-[#10151a] px-5 py-3 text-xs leading-relaxed sm:px-6">
						<div className="flex items-center gap-2">
							<label className="sr-only" htmlFor="workout-search">
								Search workouts by name or difficulty
							</label>
							<input
								className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-[#12171d] px-3 text-slate-100 text-sm outline-none placeholder:text-slate-600 focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/10"
								id="workout-search"
								onChange={(event) => setSearchQuery(event.currentTarget.value)}
								placeholder="Search by name or difficulty"
								type="search"
								value={searchQuery}
							/>
							{searchQuery ? (
								<button
									className="h-10 rounded-lg border border-line px-3 font-semibold text-slate-400 hover:border-slate-500 hover:text-white"
									onClick={() => setSearchQuery('')}
									type="button"
								>
									Clear
								</button>
							) : null}
						</div>
						{libraryStatus ? (
							<p aria-live="polite" className="mt-1 text-cyan-300">
								{libraryStatus}
							</p>
						) : null}
						{importError ? (
							<p aria-live="assertive" className="mt-1 text-rose-300">
								{importError}
							</p>
						) : null}
					</div>
					<div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
						{filteredCourses.map((course, index) => (
							<WorkoutCourseCard
								course={course}
								custom={customCourseIds.has(course.id)}
								disabled={selectionLocked}
								dragged={draggedCourseId === course.id}
								dropEnabled={Boolean(
									draggedCourseId && draggedCourseId !== course.id
								)}
								dropTarget={dropTargetCourseId === course.id}
								key={course.id}
								onDragEnd={finishDragging}
								onDragOver={(event) => {
									event.preventDefault();
									event.dataTransfer.dropEffect = 'move';
									if (draggedCourseId !== course.id) {
										setDropTargetCourseId(course.id);
									}
								}}
								onDragStart={(event) => {
									event.dataTransfer.effectAllowed = 'move';
									event.dataTransfer.setData('text/plain', course.id);
									setDraggedCourseId(course.id);
								}}
								onDrop={(event) => {
									event.preventDefault();
									const movedCourseId =
										draggedCourseId || event.dataTransfer.getData('text/plain');
									reorderCourse(movedCourseId, course.id);
									finishDragging();
								}}
								onMove={(direction) => {
									const target = filteredCourses[index + direction];
									if (target) {
										reorderCourse(course.id, target.id);
									}
								}}
								onRemove={() => onRemoveCourse(course.id)}
								onRename={() => setRenamingCourse(course)}
								onSelect={() => onSelect(course)}
								selected={activeCourse?.id === course.id}
								speedUnit={speedUnit}
							/>
						))}
						{filteredCourses.length === 0 ? (
							<p className="py-10 text-center text-slate-500 text-sm" role="status">
								No workouts match “{searchQuery.trim()}”.
							</p>
						) : null}
					</div>
					{activeCourse && !selectionLocked ? (
						<footer className="border-line border-t p-4 text-right sm:px-6">
							<button
								className="rounded-lg border border-line px-3 py-2 font-semibold text-slate-400 text-xs hover:border-slate-500 hover:text-white"
								onClick={() => onSelect(undefined)}
								type="button"
							>
								Ride without a workout
							</button>
						</footer>
					) : null}
				</div>
			</SideTray>
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
