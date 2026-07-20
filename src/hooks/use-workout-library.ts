import { useCallback, useMemo, useRef, useState } from 'react';
import {
	addCustomWorkout,
	loadCustomWorkouts,
	loadWorkoutOrder,
	moveWorkoutCourse,
	orderWorkoutCourses,
	readWorkoutFile,
	renameCustomWorkout,
	saveCustomWorkouts,
	saveWorkoutOrder,
	withoutCustomWorkout,
} from '../lib/workout-file';
import { WORKOUT_COURSES } from '../lib/workouts';
import type { WorkoutCourse } from '../types';

export function useWorkoutLibrary() {
	const [customCourses, setCustomCourses] = useState(loadCustomWorkouts);
	const [courseOrder, setCourseOrder] = useState(loadWorkoutOrder);
	const customCoursesRef = useRef(customCourses);
	const courses = useMemo(
		() => orderWorkoutCourses([...WORKOUT_COURSES, ...customCourses], courseOrder),
		[courseOrder, customCourses]
	);
	const coursesRef = useRef(courses);
	coursesRef.current = courses;
	const customCourseIds = useMemo(
		() => new Set(customCourses.map((course) => course.id)),
		[customCourses]
	);

	const replaceCustomCourses = useCallback((next: WorkoutCourse[]) => {
		saveCustomWorkouts(next);
		customCoursesRef.current = next;
		setCustomCourses(next);
	}, []);

	const importFile = useCallback(
		async (file: File) => {
			const course = await readWorkoutFile(file);
			const result = addCustomWorkout(customCoursesRef.current, course);
			replaceCustomCourses(result.courses);
			return result.course;
		},
		[replaceCustomCourses]
	);

	const removeCourse = useCallback(
		(courseId: string) => {
			replaceCustomCourses(withoutCustomWorkout(customCoursesRef.current, courseId));
		},
		[replaceCustomCourses]
	);
	const renameCourse = useCallback(
		(courseId: string, name: string) => {
			const result = renameCustomWorkout(customCoursesRef.current, courseId, name);
			replaceCustomCourses(result.courses);
			return result.course;
		},
		[replaceCustomCourses]
	);
	const reorderCourse = useCallback((movedCourseId: string, targetCourseId: string) => {
		const reordered = moveWorkoutCourse(coursesRef.current, movedCourseId, targetCourseId);
		if (reordered === coursesRef.current) {
			return;
		}
		const nextOrder = reordered.map((course) => course.id);
		saveWorkoutOrder(nextOrder);
		setCourseOrder(nextOrder);
	}, []);

	return {
		courses,
		customCourseIds,
		importFile,
		removeCourse,
		renameCourse,
		reorderCourse,
	};
}
